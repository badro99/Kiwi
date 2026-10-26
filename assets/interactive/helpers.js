/* Owner: interactive · settings rows, morning push, KPI detail data and AI demo answers
 * Moved verbatim from assets/interactive.js (tools/interactive-split-test.mjs rebuilds the
 * original byte for byte). Loaded before interactive.js; registering runs nothing.
 * Borrows from interactive.js: AI_RESPONSES_STR, KPI_DESC_STR, KPI_LONG_STR, escape, kiwiLang, toast, tr. */
(function () {
  'use strict';
  (window.__kiwiInteractiveParts = window.__kiwiInteractiveParts || {}).helpers = function (__deps) {
    const { AI_RESPONSES_STR, KPI_DESC_STR, KPI_LONG_STR, escape, kiwiLang, toast, tr } = __deps;
/* <<split:helpers>> */
  /* ─── Helpers for rendering ─── */
  /* Google Material Symbols · Outlined 400. Official paths from Google's
     open-source Material Symbols set, kept inline so settings work offline. */
  const MATERIAL_SETTINGS_ICONS = Object.freeze({
    storefront: 'M841-518v318q0 33-23.5 56.5T761-120H201q-33 0-56.5-23.5T121-200v-318q-23-21-35.5-54t-.5-72l42-136q8-26 28.5-43t47.5-17h556q27 0 47 16.5t29 43.5l42 136q12 39-.5 71T841-518Zm-272-42q27 0 41-18.5t11-41.5l-22-140h-78v148q0 21 14 36.5t34 15.5Zm-180 0q23 0 37.5-15.5T441-612v-148h-78l-22 140q-4 24 10.5 42t37.5 18Zm-178 0q18 0 31.5-13t16.5-33l22-154h-78l-40 134q-6 20 6.5 43t41.5 23Zm540 0q29 0 42-23t6-43l-42-134h-76l22 154q3 20 16.5 33t31.5 13ZM201-200h560v-282q-5 2-6.5 2H751q-27 0-47.5-9T663-518q-18 18-41 28t-49 10q-27 0-50.5-10T481-518q-17 18-39.5 28T393-480q-29 0-52.5-10T299-518q-21 21-41.5 29.5T211-480h-4.5q-2.5 0-5.5-2v282Zm560 0H201h560Z',
    schedule: 'm612-292 56-56-148-148v-184h-80v216l172 172ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-400Zm0 320q133 0 226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160Z',
    track_changes: 'M324-111.5Q251-143 197-197t-85.5-127Q80-397 80-480t31.5-156Q143-709 197-763t127-85.5Q397-880 480-880h40v331q18 11 29 28.5t11 40.5q0 33-23.5 56.5T480-400q-33 0-56.5-23.5T400-480q0-23 11-41t29-28v-86q-52 14-86 56.5T320-480q0 66 47 113t113 47q66 0 113-47t47-113q0-36-14.5-66.5T586-600l57-57q35 33 56 78.5t21 98.5q0 100-70 170t-170 70q-100 0-170-70t-70-170q0-90 57-156.5T440-717v-81q-119 15-199.5 105T160-480q0 134 93 227t227 93q134 0 227-93t93-227q0-69-27-129t-74-104l57-57q57 55 90.5 129.5T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80q-83 0-156-31.5Z',
    receipt_long: 'M240-80q-50 0-85-35t-35-85v-120h120v-560l60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60v680q0 50-35 85t-85 35H240Zm480-80q17 0 28.5-11.5T760-200v-560H320v440h360v120q0 17 11.5 28.5T720-160ZM360-600v-80h240v80H360Zm0 120v-80h240v80H360Zm320-120q-17 0-28.5-11.5T640-640q0-17 11.5-28.5T680-680q17 0 28.5 11.5T720-640q0 17-11.5 28.5T680-600Zm0 120q-17 0-28.5-11.5T640-520q0-17 11.5-28.5T680-560q17 0 28.5 11.5T720-520q0 17-11.5 28.5T680-480ZM240-160h360v-80H200v40q0 17 11.5 28.5T240-160Zm-40 0v-80 80Z',
    credit_card: 'M880-720v480q0 33-23.5 56.5T800-160H160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720Zm-720 80h640v-80H160v80Zm0 160v240h640v-240H160Zm0 240v-480 480Z',
    paid: 'M444-200h70v-50q50-9 86-39t36-89q0-42-24-77t-96-61q-60-20-83-35t-23-41q0-26 18.5-41t53.5-15q32 0 50 15.5t26 38.5l64-26q-11-35-40.5-61T516-710v-50h-70v50q-50 11-78 44t-28 74q0 47 27.5 76t86.5 50q63 23 87.5 41t24.5 47q0 33-23.5 48.5T486-314q-33 0-58.5-20.5T390-396l-66 26q14 48 43.5 77.5T444-252v52Zm36 120q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z',
    language: 'M325-111.5q-73-31.5-127.5-86t-86-127.5Q80-398 80-480.5t31.5-155q31.5-72.5 86-127t127.5-86Q398-880 480.5-880t155 31.5q72.5 31.5 127 86t86 127Q880-563 880-480.5T848.5-325q-31.5 73-86 127.5t-127 86Q563-80 480.5-80T325-111.5ZM480-162q26-36 45-75t31-83H404q12 44 31 83t45 75Zm-104-16q-18-33-31.5-68.5T322-320H204q29 50 72.5 87t99.5 55Zm208 0q56-18 99.5-55t72.5-87H638q-9 38-22.5 73.5T584-178ZM170-400h136q-3-20-4.5-39.5T300-480q0-21 1.5-40.5T306-560H170q-5 20-7.5 39.5T160-480q0 21 2.5 40.5T170-400Zm216 0h188q3-20 4.5-39.5T580-480q0-21-1.5-40.5T574-560H386q-3 20-4.5 39.5T380-480q0 21 1.5 40.5T386-400Zm268 0h136q5-20 7.5-39.5T800-480q0-21-2.5-40.5T790-560H654q3 20 4.5 39.5T660-480q0 21-1.5 40.5T654-400Zm-16-240h118q-29-50-72.5-87T584-782q18 33 31.5 68.5T638-640Zm-234 0h152q-12-44-31-83t-45-75q-26 36-45 75t-31 83Zm-200 0h118q9-38 22.5-73.5T376-782q-56 18-99.5 55T204-640Z',
    layers: 'M480-118 120-398l66-50 294 228 294-228 66 50-360 280Zm0-202L120-600l360-280 360 280-360 280Zm0-280Zm0 178 230-178-230-178-230 178 230 178Z',
    dark_mode: 'M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q14 0 27.5 1t26.5 3q-41 29-65.5 75.5T444-660q0 90 63 153t153 63q55 0 101-24.5t75-65.5q2 13 3 26.5t1 27.5q0 150-105 255T480-120Zm0-80q88 0 158-48.5T740-375q-20 5-40 8t-40 3q-123 0-209.5-86.5T364-660q0-20 3-40t8-40q-78 32-126.5 102T200-480q0 116 82 198t198 82Zm-10-270Z',
    notifications: 'M160-200v-80h80v-280q0-83 50-147.5T420-792v-28q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820v28q80 20 130 84.5T720-560v280h80v80H160Zm320-300Zm0 420q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80ZM320-280h320v-280q0-66-47-113t-113-47q-66 0-113 47t-47 113v280Z',
    key: 'M223.5-423.5Q200-447 200-480t23.5-56.5Q247-560 280-560t56.5 23.5Q360-513 360-480t-23.5 56.5Q313-400 280-400t-56.5-23.5ZM280-240q-100 0-170-70T40-480q0-100 70-170t170-70q67 0 121.5 33t86.5 87h352l120 120-180 180-80-60-80 60-85-60h-47q-32 54-86.5 87T280-240Zm0-80q56 0 98.5-34t56.5-86h125l58 41 82-61 71 55 75-75-40-40H435q-14-52-56.5-86T280-640q-66 0-113 47t-47 113q0 66 47 113t113 47Z',
    shield_lock: 'M480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q104-33 172-132t68-220v-189l-240-90-240 90v189q0 121 68 220t172 132Zm0-316Zm-80 160h160q17 0 28.5-11.5T600-360v-120q0-17-11.5-28.5T560-520v-40q0-33-23.5-56.5T480-640q-33 0-56.5 23.5T400-560v40q-17 0-28.5 11.5T360-480v120q0 17 11.5 28.5T400-320Zm40-200v-40q0-17 11.5-28.5T480-600q17 0 28.5 11.5T520-560v40h-80Z',
    file_upload: 'M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z',
    person_remove: 'M640-520v-80h240v80H640Zm-280 40q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM40-160v-112q0-34 17.5-62.5T104-378q62-31 126-46.5T360-440q66 0 130 15.5T616-378q29 15 46.5 43.5T680-272v112H40Zm80-80h480v-32q0-11-5.5-20T580-306q-54-27-109-40.5T360-360q-56 0-111 13.5T140-306q-9 5-14.5 14t-5.5 20v32Zm240-320q33 0 56.5-23.5T440-640q0-33-23.5-56.5T360-720q-33 0-56.5 23.5T280-640q0 33 23.5 56.5T360-560Zm0-80Zm0 400Z',
    local_shipping: 'M155-195q-35-35-35-85H40v-440q0-33 23.5-56.5T120-800h560v160h120l120 160v200h-80q0 50-35 85t-85 35q-50 0-85-35t-35-85H360q0 50-35 85t-85 35q-50 0-85-35Zm113.5-56.5Q280-263 280-280t-11.5-28.5Q257-320 240-320t-28.5 11.5Q200-297 200-280t11.5 28.5Q223-240 240-240t28.5-11.5ZM120-360h32q17-18 39-29t49-11q27 0 49 11t39 29h272v-360H120v360Zm628.5 108.5Q760-263 760-280t-11.5-28.5Q737-320 720-320t-28.5 11.5Q680-297 680-280t11.5 28.5Q703-240 720-240t28.5-11.5ZM680-440h170l-90-120h-80v120ZM360-540Z'
  });
  function materialSymbol(name, className) {
    const path = MATERIAL_SETTINGS_ICONS[name] || MATERIAL_SETTINGS_ICONS.storefront;
    return `<svg${className ? ` class="${className}"` : ''} viewBox="0 -960 960 960" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false"><path d="${path}"></path></svg>`;
  }
  /* Le point du matin, côté page. L'app Kiwi Pro (coque iOS) fournit le jeton
   * APNs via window.webkit.messageHandlers.kiwiShell ({push:'enable'}) et le
   * rend par window.KiwiNativePushResult. Dans un navigateur il n'y a rien à
   * activer : la bascule l'explique au lieu de mentir. */
  const morningPush = (function () {
    const KEY = 'kiwiMorningPush';
    let busy = false, waiter = null;
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; } };
    const write = (v) => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (_) {} };
    const merchant = () => { try { return String(window.KiwiLive?.merchant?.() || '').trim().toLowerCase(); } catch (_) { return ''; } };
    const native = () => !!(window.__kiwiHostCaps && window.__kiwiHostCaps.push && window.webkit?.messageHandlers?.kiwiShell);
    const say = (fr, en, ar, type) => toast(tr({ fr, en, ar }), { type: type || 'info' });
    window.KiwiNativePushResult = function (result) {
      if (result && result.kind === 'enable' && waiter) { const done = waiter; waiter = null; done(result); }
    };
    function askNative() {
      return new Promise((resolve) => {
        waiter = resolve;
        // Le dialogue système peut rester ouvert longtemps ; au-delà, on abandonne.
        setTimeout(() => { if (waiter === resolve) { waiter = null; resolve({ ok: false, reason: 'timeout' }); } }, 120000);
        try { window.webkit.messageHandlers.kiwiShell.postMessage({ push: 'enable' }); }
        catch (_) { waiter = null; resolve({ ok: false, reason: 'unavailable' }); }
      });
    }
    function post(body) {
      return fetch('/api/push/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', cache: 'no-store', body: JSON.stringify(body),
      }).then((r) => r.ok).catch(() => false);
    }
    /* APNs peut changer le jeton d'un appareil : tant que la bascule est
     * activée, on le redemande en silence (aucune invite, la permission est déjà
     * donnée) et on remet le serveur à jour s'il a changé. */
    async function refresh() {
      const v = read();
      if (busy || !native() || !v || !v.token || v.merchant !== merchant()) return;
      busy = true;
      try {
        const res = await askNative();
        if (res.ok && res.token && res.token !== v.token) {
          if (await post({ merchant: v.merchant, token: res.token, platform: 'ios', role: 'dashboard', lang: kiwiLang() })) {
            write({ merchant: v.merchant, token: res.token });
            post({ merchant: v.merchant, token: v.token, action: 'unregister' });
          }
        }
      } finally { busy = false; }
    }
    if (native() && read()) setTimeout(refresh, 6000);
    return {
      isOn() { const v = read(); return !!(v && v.token && v.merchant && v.merchant === merchant()); },
      /* Résout vers l'état final de la bascule (true = activé). */
      async toggle(want) {
        const current = this.isOn();
        if (busy) return current;
        if (!native()) {
          say('Le point du matin fonctionne dans l\'app Kiwi Pro.', 'The morning briefing works in the Kiwi Pro app.', 'ملخص الصباح يعمل في تطبيق Kiwi Pro.');
          return current;
        }
        const m = merchant();
        if (!m) {
          say('Établissement introuvable. Réessayez dans un instant.', 'Business not found. Try again in a moment.', 'تعذّر العثور على المنشأة. أعد المحاولة بعد لحظة.', 'danger');
          return current;
        }
        busy = true;
        try {
          if (want) {
            const res = await askNative();
            if (!res.ok || !res.token) {
              if (res.reason === 'denied') say('Autorisez les notifications pour Kiwi Pro dans les Réglages de l\'iPhone.', 'Allow notifications for Kiwi Pro in iPhone Settings.', 'اسمح بالإشعارات لتطبيق Kiwi Pro من إعدادات الهاتف.');
              else say('Activation impossible pour le moment.', 'Could not turn this on right now.', 'تعذّر التفعيل حالياً.', 'danger');
              return false;
            }
            const lang = kiwiLang();
            const saved = await post({ merchant: m, token: res.token, platform: 'ios', role: 'dashboard', lang: lang });
            if (!saved) { say('Activation impossible pour le moment.', 'Could not turn this on right now.', 'تعذّر التفعيل حالياً.', 'danger'); return false; }
            write({ merchant: m, token: res.token });
            say('Le point du matin est activé.', 'Morning briefing is on.', 'تم تفعيل ملخص الصباح.', 'success');
            return true;
          }
          const v = read();
          if (v && v.token && v.merchant) {
            const gone = await post({ merchant: v.merchant, token: v.token, action: 'unregister' });
            if (!gone) { say('Désactivation impossible pour le moment.', 'Could not turn this off right now.', 'تعذّر الإيقاف حالياً.', 'danger'); return true; }
          }
          write(null);
          say('Le point du matin est désactivé.', 'Morning briefing is off.', 'تم إيقاف ملخص الصباح.', 'success');
          return false;
        } finally { busy = false; }
      },
    };
  })();
  function ksetIco(key) {
    return `<span class="kset-ico">${materialSymbol(key)}</span>`;
  }
  function settingsRow(icon, label, value, opts) {
    if (opts === true) opts = { toggle: true, on: true };
    opts = opts || {};
    const attrs = (opts.action ? ` data-action="${opts.action}"` : '') +
                  (opts.arg ? ` data-arg="${opts.arg}"` : '');
    const right = opts.toggle
      ? `<div class="kset-toggle${opts.on ? ' on' : ''}" data-kset-toggle><div class="kset-knob"></div></div>`
      : opts.badge
      ? `<span class="kset-badge">${escape(opts.badge)}</span>`
      : '<svg class="kset-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--n-400)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
    return `<div class="kset-row"${attrs} role="button" tabindex="0">` +
      ksetIco(icon) +
      `<div style="flex:1; min-width:0;"><div style="font-size:13.5px; font-weight:600; letter-spacing:-0.01em;">${label}</div>` +
      `<div class="kset-val" style="font-size:12px; color:var(--n-500); margin-top:1px;">${value}</div></div>` +
      right + `</div>`;
  }

/* <<split:escape>> */
  /* Accepted payment methods belong to one account and one store. They lived in the
   * global `kiwiSet:methods`: the next account to sign in on the device read the
   * previous merchant's list, and a real merchant who had never chosen saw the
   * demo's "Visa · Mastercard · Kiwi Tap · QR". The key now carries account and
   * store (under `kiwi:`, so the tenant purge takes it); the demo default is shown
   * to a demo only, and the legacy global value is read by a demo alone. */
  const METHODS_DEMO_DEFAULT = 'Visa · Mastercard · Kiwi Tap · QR';
  function methodsKey() {
    let acct = '', v = '';
    try { acct = String(localStorage.getItem('kiwiAccountKey') || '').trim().toLowerCase(); } catch (_) {}
    try { v = String((window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || ''); } catch (_) {}
    return 'kiwi:methods:' + (acct || 'demo') + '|' + (v || 'default');
  }
  function methodsSaved() {
    const real = !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal());
    try {
      const own = localStorage.getItem(methodsKey());
      if (own) return own;
      if (real) return '';
      return localStorage.getItem('kiwiSet:methods') || METHODS_DEMO_DEFAULT;
    } catch (_) { return real ? '' : METHODS_DEMO_DEFAULT; }
  }

  /* ─── Demo data ─── */
  const txData = {
    'tx1': { id: 'TXN-28410398281', method: 'Visa •• 4291', amount: '240,00 MAD', status: 'Réglé · en attente de règlement', date: '24 avril 2026 14:32', network: 'Visa', customer: 'Karim B. (régulier)', table: 'T4', cart: 'Tajine kefta · Thé menthe × 2', tip: '24,00 MAD (10%)', fee: 'Inclus · abonnement Kiwi', net: '240,00 MAD', card: 'Visa •• 4291', issuer: 'Attijariwafa Bank', country: '🇲🇦 Maroc', staff: 'Fatima Khalki' },
    'default': { id: 'TXN-0000', method: 'Paiement carte', amount: '180,00 MAD', status: 'Réglé', date: '24 avril 2026', network: 'Carte', customer: 'Client', table: '·', cart: '·', tip: '·', fee: 'Inclus · abonnement Kiwi', net: '180,00 MAD', card: '••••', issuer: '·', country: '·', staff: '·' }
  };

  /* ─── KPI detail drawer content (one rich view per metric) ─── */
  // Shared style helpers for inline composition
  const kpiHero = (big, sub, deltaTxt, deltaCls = 'good') => `
    <div style="display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; margin-bottom:6px;">
      <div dir="ltr" style="font-size:42px; font-weight:600; letter-spacing:-0.035em; line-height:1; font-feature-settings:'tnum' 1; unicode-bidi:isolate;">${big}</div>
      ${deltaTxt ? `<div style="min-width:0; max-width:100%; overflow-wrap:anywhere; font-size:13px; font-weight:500; color:var(--${deltaCls === 'good' ? 'success' : deltaCls === 'warn' ? 'warning' : 'n-500'});">${deltaTxt}</div>` : ''}
    </div>
    <div style="font-size:13px; color:var(--n-500); margin-bottom:22px;">${sub}</div>
  `;
  const kpiSection = (label, body) => `
    <div style="margin-bottom:18px;">
      <div style="font-size:11px; letter-spacing:0.1em; color:var(--n-500); font-family:var(--mono); margin-bottom:10px;">${label}</div>
      ${body}
    </div>
  `;
  const kpiInsight = (text) => `
    <div style="padding:14px 16px; background:var(--atlas); color:var(--paper); border-radius:12px; display:flex; gap:12px; font-size:13px; line-height:1.45; margin-top:6px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="color:var(--mint); flex-shrink:0; margin-top:2px;"><path d="M12 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z"/></svg>
      <div>${text}</div>
    </div>
  `;
  const kpiRow = (left, right, sub = '') => `
    <div style="display:grid; grid-template-columns:1fr auto; gap:12px; padding:10px 0; border-top:1px solid var(--n-200); font-size:13.5px; align-items:center;">
      <div><div style="font-weight:500;">${left}</div>${sub ? `<div style="font-size:11.5px; color:var(--n-500); margin-top:2px;">${sub}</div>` : ''}</div>
      <bdi dir="ltr" style="font-family:var(--mono); font-weight:500; font-size:12.5px;">${right}</bdi>
    </div>
  `;
  const kpiFootBtns = (ghostLabel, atlasLabel) => `
    <button class="kb ghost" data-dismiss style="flex:1; justify-content:center;">${ghostLabel}</button>
    <button class="kb atlas" style="flex:1; justify-content:center;">${atlasLabel}</button>
  `;

  /* Short + long descriptions for personalised KPIs that have no hand-authored
     detail view — used to build a clean generic drawer on click. */
  const KPI_DESC = (KPI_DESC_STR[kiwiLang()] || KPI_DESC_STR.fr);
  const KPI_LONG = (KPI_LONG_STR[kiwiLang()] || KPI_LONG_STR.fr);

  const KPI_DATA_STR = {
    fr: {
      tx_title: 'Transactions',
      tx_subtitle: 'Vendredi 24 avril · service en cours',
      tx_foot_close: 'Fermer',
      tx_foot_journal: 'Voir le journal complet →',
      tx_hero_pic: 'Pic à 13h00 · 24 transactions sur l\'heure',
      tx_hero_delta: '↑ +24 vs hier (+15 %)',
      tx_section_repartition: 'RÉPARTITION HORAIRE',
      tx_section_server: 'PAR SERVEUR',
      tx_server_sofia: 'Sofia Belkadi',
      tx_server_sofia_role: 'barista · comptoir',
      tx_server_fatima: 'Fatima Khalki',
      tx_server_fatima_role: 'serveuse · salle',
      tx_server_hamid: 'Hamid Jelloul',
      tx_server_hamid_role: 'serveur · terrasse',
      tx_server_youssef: 'Youssef Amrani',
      tx_server_youssef_role: 'serveur · 17h-23h',
      tx_server_auto: 'Auto-caisse',
      tx_server_auto_role: 'sans contact',
      tx_insight: '<b style="color:var(--mint);">Insight :</b> Sofia transforme 54 % de plus que la moyenne salle. Lui assigner les tables T1-T3 ce soir pourrait ajouter ~2 400 MAD au service.',
      panier_title: 'Panier moyen',
      panier_subtitle: '24 dernières heures · tous canaux',
      panier_foot_ia: 'Activer recommandations IA →',
      panier_hero_median: 'Médiane 95 MAD · max 1 240 MAD (anniversaire T8)',
      panier_hero_delta: '≈ stable vs hier',
      panier_section_distribution: 'DISTRIBUTION DES TICKETS',
      panier_section_segmentation: 'SEGMENTATION',
      panier_segment_regulars: 'Clients réguliers',
      panier_segment_regulars_sub: '47 clients · ticket moyen',
      panier_segment_occasional: 'Clients occasionnels',
      panier_segment_occasional_sub: '108 clients · ticket moyen',
      panier_segment_tourists: 'Touristes (carte étrangère)',
      panier_segment_tourists_sub: '27 clients · ticket moyen',
      panier_insight: '<b style="color:var(--mint);">Insight :</b> Vos réguliers dépensent <b>+45 %</b> vs occasionnels. Les recommandations IA en fin de commande (« +1 thé pour 12 MAD ») peuvent lever le ticket moyen de <b>~12 %</b>.',
      tips_title: 'Pourboires',
      tips_subtitle: 'Cumul du jour · à distribuer en fin de service',
      tips_foot_distribute: 'Distribuer maintenant →',
      tips_hero_avg: '7,6 % du chiffre encaissé · taux moyen 8,2 %',
      tips_hero_delta: '↑ +32 % vs semaine',
      tips_section_prompt: 'PROMPT POURBOIRE',
      tips_prompt_auto: 'Prompt auto +10 %',
      tips_prompt_auto_sub: 'Affiché sur 78 % des tickets aujourd\'hui · taux d\'acceptation 64 %',
      tips_section_server: 'PAR SERVEUR',
      tips_server_sofia: 'Sofia Belkadi',
      tips_server_sofia_rate: 'taux 11,2 %',
      tips_server_fatima: 'Fatima Khalki',
      tips_server_fatima_rate: 'taux 8,8 %',
      tips_server_hamid: 'Hamid Jelloul',
      tips_server_hamid_rate: 'taux 7,4 %',
      tips_server_youssef: 'Youssef Amrani',
      tips_server_youssef_rate: 'taux 5,1 %',
      tips_section_period: 'PAR PÉRIODE',
      tips_period_breakfast: 'Petit-déj 8h-11h',
      tips_period_breakfast_rate: '1,8 % de taux',
      tips_period_lunch: 'Déjeuner 12h-15h',
      tips_period_lunch_rate: '7,4 % de taux',
      tips_period_snack: 'Goûter 15h-18h',
      tips_period_snack_rate: '4,2 % de taux',
      tips_period_dinner: 'Dîner 19h-23h',
      tips_period_dinner_rate: '11,8 % de taux',
      tips_insight: '<b style="color:var(--mint);">Insight :</b> Le taux du soir est <b>~3×</b> celui du midi. Activer un prompt « +15 % » spécifique après 20h pourrait ajouter <b>~280 MAD/soir</b>.',
      marge_title: 'Marge brute',
      marge_subtitle: 'Chiffre d\'affaires moins coût matière · 30 jours',
      marge_foot_cogs: 'Voir le coût matière →',
      marge_hero_cogs: 'Coût matière 28,6 % du CA · objectif ≤ 30 %',
      marge_hero_delta: '↑ +1,8 pt vs 30 jours préc.',
      marge_section_category: 'MARGE PAR CATÉGORIE',
      marge_cat_hot_drinks: 'Boissons chaudes',
      marge_cat_hot_drinks_sub: '28 % du CA',
      marge_cat_cold_drinks: 'Boissons fraîches',
      marge_cat_cold_drinks_sub: '17 % du CA',
      marge_cat_pastries: 'Pâtisseries maison',
      marge_cat_pastries_sub: '21 % du CA',
      marge_cat_dishes: 'Plats & salades',
      marge_cat_dishes_sub: '34 % du CA',
      marge_section_watch: 'À SURVEILLER',
      marge_watch_juice: 'Jus pressés',
      marge_watch_juice_sub: 'coût matière en hausse · +6 pts',
      marge_watch_lunch: 'Formule déjeuner',
      marge_watch_lunch_sub: 'marge sous l\'objectif',
      marge_insight: '<b style="color:var(--mint);">Insight :</b> Les boissons chaudes portent la marge, <b>+3 pts</b> possibles en déplaçant la mise en avant menu des plats vers le café et la pâtisserie.',
      success_title: 'Taux de succès',
      success_subtitle: 'Conformité réseau et passerelle Bank Al-Maghrib',
      success_foot_failures: 'Voir les échecs →',
      success_hero_attempts: '184 tentatives · 183 succès · 1 échec',
      success_hero_delta: '↑ +0,2 pt vs hier',
      success_section_benchmark: 'BENCHMARK MARCHÉ',
      success_bench_you: 'Café Atlas (vous)',
      success_bench_avg: 'Cafés Casa moyenne',
      success_bench_cmi: 'CMI traditionnel',
      success_bench_pci: 'Standard PCI-DSS',
      success_section_failure: 'UNIQUE ÉCHEC AUJOURD\'HUI',
      success_failure_card: 'Mastercard •• 7821 · 13:42',
      success_failure_reason: 'Code 51 · fonds insuffisants · BNP Paribas FR',
      success_failure_status: 'ÉCHEC',
      success_failure_recovery: 'Client a réessayé avec une autre carte 18 secondes plus tard · succès. Aucune perte.',
      success_section_health: 'SANTÉ TECHNIQUE',
      success_health_latency: 'Latence moyenne autorisation',
      success_health_latency_sub: 'p95 = 2,1 s',
      success_health_gateway: 'Disponibilité passerelle',
      success_health_gateway_sub: 'BAM + acquéreur',
      success_health_terminals: 'Terminaux en ligne',
      success_health_terminals_sub: '3 / 3 PAX A920',
      success_health_4g: 'Connectivité 4G secours',
      success_health_4g_sub: 'utilisée 0 fois',
      ratio_title: 'Ratio carte / espèces',
      ratio_subtitle: 'Mix de paiement · 24 dernières heures',
      ratio_foot_disable_cash: 'Désactiver l\'espèces →',
      ratio_hero_gain: 'Carte gagne 4 pts vs semaine dernière · +12 pts depuis lancement',
      ratio_hero_delta: '↑ +4 pts carte',
      ratio_section_means: 'DÉTAIL DES MOYENS',
      ratio_means_cash: 'Espèces',
      ratio_section_hidden_cost: 'COÛT CACHÉ DE L\'ESPÈCES',
      ratio_cost_bank: 'Tournée banque hebdo',
      ratio_cost_bank_sub: '~ 45 min de gérance · vendredi',
      ratio_cost_errors: 'Erreurs de caisse moy.',
      ratio_cost_errors_sub: '0,4 % du volume cash',
      ratio_cost_risk: 'Risque vol / perte',
      ratio_cost_risk_sub: 'absent en mode 100 % carte',
      ratio_cost_total: 'Total annuel évitable',
      ratio_cost_total_sub: '180 + 11 300 + risque',
      ratio_insight: '<b style="color:var(--mint);">Insight :</b> Si vous passez à 80 % carte (vs 68 % aujourd\'hui) avec un prompt « payez par carte = café offert le 10ᵉ », vous économisez <b>~12 800 MAD/an</b> de manipulation cash.',
      regulars_title: 'Clients réguliers',
      regulars_subtitle: 'Identifiés par carte tokenisée ou Kiwi Wallet',
      regulars_foot_loyalty: 'Lancer programme fidélité →',
      regulars_hero_base: '26 % de la base · taux de rétention 30 jours = 72 %',
      regulars_hero_delta: '↑ +9 nouveaux cette semaine',
      regulars_section_top5: 'TOP 5 RÉGULIERS · CE MOIS',
      regulars_top5_1_sub: '12 visites · 18 cafés · 6 tajines',
      regulars_top5_2_sub: '10 visites · membre depuis 2024',
      regulars_top5_3_sub: '9 visites · toujours T6',
      regulars_top5_4: 'Nawal Khalifi',
      regulars_top5_4_sub: '8 visites · payeur Kiwi Wallet',
      regulars_top5_5: 'Youssef Amrani (employé)',
      regulars_top5_5_sub: '8 visites · pause déj.',
      regulars_section_cohorts: 'COHORTES DE FRÉQUENCE',
      regulars_cohorts_1: '1ʳᵉ visite ce mois',
      regulars_cohorts_2: '2-3 visites',
      regulars_cohorts_3: '4-7 visites',
      regulars_cohorts_4: '8+ visites (hard core)',
      regulars_section_reactivate: 'CLIENTS À RÉACTIVER',
      regulars_reactivate_text: '<b>14 réguliers</b> n\'ont pas commandé depuis 6 semaines. Un message WhatsApp « on vous a manqué · −15 % la semaine prochaine » a converti <b>43 %</b> des relances le mois dernier.',
      regulars_insight: '<b style="color:var(--mint);">Insight :</b> Vos 19 hard-core représentent <b>34 % du chiffre</b> alors qu\'ils ne sont que 10 % de la base. Un programme de fidélité (10ᵉ café offert) coûterait <b>~280 MAD/mois</b> et garderait ce groupe à très haute valeur.',
      default_title: 'Métrique',
      default_body: '<p style="color:var(--n-600);">Analyse détaillée disponible ici.</p>'
    },
    en: {
      tx_title: 'Transactions',
      tx_subtitle: 'Friday, April 24 · service in progress',
      tx_foot_close: 'Close',
      tx_foot_journal: 'View full log →',
      tx_hero_pic: 'Peak at 1pm · 24 transactions in the hour',
      tx_hero_delta: '↑ +24 vs yesterday (+15%)',
      tx_section_repartition: 'HOURLY BREAKDOWN',
      tx_section_server: 'BY SERVER',
      tx_server_sofia: 'Sofia Belkadi',
      tx_server_sofia_role: 'barista · counter',
      tx_server_fatima: 'Fatima Khalki',
      tx_server_fatima_role: 'waitress · floor',
      tx_server_hamid: 'Hamid Jelloul',
      tx_server_hamid_role: 'waiter · terrace',
      tx_server_youssef: 'Youssef Amrani',
      tx_server_youssef_role: 'waiter · 5pm-11pm',
      tx_server_auto: 'Self-service checkout',
      tx_server_auto_role: 'contactless',
      tx_insight: '<b style="color:var(--mint);">Insight:</b> Sofia converts 54% more than the floor average. Assigning her tables T1-T3 tonight could add ~2,400 MAD to the service.',
      panier_title: 'Average Basket',
      panier_subtitle: 'Last 24 hours · all channels',
      panier_foot_ia: 'Activate AI recommendations →',
      panier_hero_median: 'Median 95 MAD · max 1,240 MAD (birthday T8)',
      panier_hero_delta: '≈ stable vs yesterday',
      panier_section_distribution: 'TICKET DISTRIBUTION',
      panier_section_segmentation: 'SEGMENTATION',
      panier_segment_regulars: 'Regular customers',
      panier_segment_regulars_sub: '47 customers · average ticket',
      panier_segment_occasional: 'Occasional customers',
      panier_segment_occasional_sub: '108 customers · average ticket',
      panier_segment_tourists: 'Tourists (foreign card)',
      panier_segment_tourists_sub: '27 customers · average ticket',
      panier_insight: '<b style="color:var(--mint);">Insight:</b> Your regulars spend <b>+45%</b> vs occasional customers. End-of-order AI recommendations ("+1 tea for 12 MAD") can lift the average ticket by <b>~12%</b>.',
      tips_title: 'Tips',
      tips_subtitle: 'Today\'s total · to be distributed at end of service',
      tips_foot_distribute: 'Distribute now →',
      tips_hero_avg: '7.6% of cashed revenue · average rate 8.2%',
      tips_hero_delta: '↑ +32% vs week',
      tips_section_prompt: 'TIP PROMPT',
      tips_prompt_auto: 'Auto prompt +10%',
      tips_prompt_auto_sub: 'Shown on 78% of tickets today · 64% acceptance rate',
      tips_section_server: 'BY SERVER',
      tips_server_sofia: 'Sofia Belkadi',
      tips_server_sofia_rate: '11.2% rate',
      tips_server_fatima: 'Fatima Khalki',
      tips_server_fatima_rate: '8.8% rate',
      tips_server_hamid: 'Hamid Jelloul',
      tips_server_hamid_rate: '7.4% rate',
      tips_server_youssef: 'Youssef Amrani',
      tips_server_youssef_rate: '5.1% rate',
      tips_section_period: 'BY PERIOD',
      tips_period_breakfast: 'Breakfast 8am-11am',
      tips_period_breakfast_rate: '1.8% rate',
      tips_period_lunch: 'Lunch 12pm-3pm',
      tips_period_lunch_rate: '7.4% rate',
      tips_period_snack: 'Afternoon 3pm-6pm',
      tips_period_snack_rate: '4.2% rate',
      tips_period_dinner: 'Dinner 7pm-11pm',
      tips_period_dinner_rate: '11.8% rate',
      tips_insight: '<b style="color:var(--mint);">Insight:</b> The evening rate is <b>~3×</b> the lunch rate. Activating a specific "+15%" prompt after 8pm could add <b>~280 MAD/evening</b>.',
      marge_title: 'Gross Margin',
      marge_subtitle: 'Revenue minus cost of goods · 30 days',
      marge_foot_cogs: 'View cost of goods →',
      marge_hero_cogs: 'Cost of goods 28.6% of revenue · target ≤ 30%',
      marge_hero_delta: '↑ +1.8 pt vs previous 30 days',
      marge_section_category: 'MARGIN BY CATEGORY',
      marge_cat_hot_drinks: 'Hot drinks',
      marge_cat_hot_drinks_sub: '28% of revenue',
      marge_cat_cold_drinks: 'Cold drinks',
      marge_cat_cold_drinks_sub: '17% of revenue',
      marge_cat_pastries: 'House pastries',
      marge_cat_pastries_sub: '21% of revenue',
      marge_cat_dishes: 'Dishes & salads',
      marge_cat_dishes_sub: '34% of revenue',
      marge_section_watch: 'TO WATCH',
      marge_watch_juice: 'Fresh juices',
      marge_watch_juice_sub: 'cost of goods rising · +6 pts',
      marge_watch_lunch: 'Lunch special',
      marge_watch_lunch_sub: 'margin below target',
      marge_insight: '<b style="color:var(--mint);">Insight:</b> Hot drinks are driving the margin, <b>+3 pts</b> possible by shifting menu promotion from dishes to coffee and pastry.',
      success_title: 'Success Rate',
      success_subtitle: 'Network compliance and Bank Al-Maghrib gateway',
      success_foot_failures: 'View failures →',
      success_hero_attempts: '184 attempts · 183 successes · 1 failure',
      success_hero_delta: '↑ +0.2 pt vs yesterday',
      success_section_benchmark: 'MARKET BENCHMARK',
      success_bench_you: 'Café Atlas (you)',
      success_bench_avg: 'Avg. Casablanca cafés',
      success_bench_cmi: 'Traditional CMI',
      success_bench_pci: 'PCI-DSS Standard',
      success_section_failure: 'TODAY\'S ONLY FAILURE',
      success_failure_card: 'Mastercard •• 7821 · 1:42pm',
      success_failure_reason: 'Code 51 · insufficient funds · BNP Paribas FR',
      success_failure_status: 'FAILED',
      success_failure_recovery: 'Customer retried with another card 18 seconds later · success. No loss.',
      success_section_health: 'TECHNICAL HEALTH',
      success_health_latency: 'Average authorization latency',
      success_health_latency_sub: 'p95 = 2.1 s',
      success_health_gateway: 'Gateway availability',
      success_health_gateway_sub: 'BAM + acquirer',
      success_health_terminals: 'Terminals online',
      success_health_terminals_sub: '3 / 3 PAX A920',
      success_health_4g: '4G backup connectivity',
      success_health_4g_sub: 'used 0 times',
      ratio_title: 'Card / Cash Ratio',
      ratio_subtitle: 'Payment mix · last 24 hours',
      ratio_foot_disable_cash: 'Disable cash →',
      ratio_hero_gain: 'Card gains 4 pts vs last week · +12 pts since launch',
      ratio_hero_delta: '↑ +4 pts card',
      ratio_section_means: 'MEANS OF PAYMENT DETAILS',
      ratio_means_cash: 'Cash',
      ratio_section_hidden_cost: 'HIDDEN COST OF CASH',
      ratio_cost_bank: 'Weekly bank run',
      ratio_cost_bank_sub: '~ 45 min of management time · Friday',
      ratio_cost_errors: 'Avg. cash register errors',
      ratio_cost_errors_sub: '0.4% of cash volume',
      ratio_cost_risk: 'Theft / loss risk',
      ratio_cost_risk_sub: 'absent in 100% card mode',
      ratio_cost_total: 'Total avoidable annual cost',
      ratio_cost_total_sub: '180 + 11,300 + risk',
      ratio_insight: '<b style="color:var(--mint);">Insight:</b> If you move to 80% card (vs 68% today) with a "pay by card = 10th coffee free" prompt, you save <b>~12,800 MAD/year</b> in cash handling.',
      regulars_title: 'Regular Customers',
      regulars_subtitle: 'Identified by tokenized card or Kiwi Wallet',
      regulars_foot_loyalty: 'Launch loyalty program →',
      regulars_hero_base: '26% of customer base · 30-day retention rate = 72%',
      regulars_hero_delta: '↑ +9 new this week',
      regulars_section_top5: 'TOP 5 REGULARS · THIS MONTH',
      regulars_top5_1_sub: '12 visits · 18 coffees · 6 tajines',
      regulars_top5_2_sub: '10 visits · member since 2024',
      regulars_top5_3_sub: '9 visits · always T6',
      regulars_top5_4: 'Nawal Khalifi',
      regulars_top5_4_sub: '8 visits · Kiwi Wallet payer',
      regulars_top5_5: 'Youssef Amrani (employee)',
      regulars_top5_5_sub: '8 visits · lunch break',
      regulars_section_cohorts: 'FREQUENCY COHORTS',
      regulars_cohorts_1: '1st visit this month',
      regulars_cohorts_2: '2-3 visits',
      regulars_cohorts_3: '4-7 visits',
      regulars_cohorts_4: '8+ visits (hard core)',
      regulars_section_reactivate: 'CUSTOMERS TO REACTIVATE',
      regulars_reactivate_text: '<b>14 regulars</b> haven\'t ordered in 6 weeks. A WhatsApp message "we missed you · -15% next week" converted <b>43%</b> of reactivations last month.',
      regulars_insight: '<b style="color:var(--mint);">Insight:</b> Your 19 hard-core regulars represent <b>34% of revenue</b> while being only 10% of the base. A loyalty program (10th coffee free) would cost <b>~280 MAD/month</b> and retain this high-value group.',
      default_title: 'Metric',
      default_body: '<p style="color:var(--n-600);">Detailed analysis available here.</p>'
    },
    ar: {
      tx_title: 'المعاملات',
      tx_subtitle: 'الجمعة 24 أبريل · الخدمة جارية',
      tx_foot_close: 'إغلاق',
      tx_foot_journal: 'عرض السجل الكامل →',
      tx_hero_pic: 'ذروة في الساعة 13:00 · 24 معاملة في الساعة',
      tx_hero_delta: '↑ <bdi dir="ltr">+24</bdi> مقابل أمس <bdi dir="ltr">(+15%)</bdi>',
      tx_section_repartition: 'التوزيع بالساعة',
      tx_section_server: 'حسب النادل',
      tx_server_sofia: 'صوفيا بلقاضي',
      tx_server_sofia_role: 'باريستا · الكاونتر',
      tx_server_fatima: 'فاطمة خالقي',
      tx_server_fatima_role: 'نادلة · الصالة',
      tx_server_hamid: 'حميد جلول',
      tx_server_hamid_role: 'نادل · التراس',
      tx_server_youssef: 'يوسف العمراني',
      tx_server_youssef_role: 'نادل · 17:00-23:00',
      tx_server_auto: 'الدفع الذاتي',
      tx_server_auto_role: 'بدون تلامس',
      tx_insight: '<b style="color:var(--mint);">رؤية:</b> صوفيا تحول 54٪ أكثر من متوسط الصالة. تعيينها للطاولات T1-T3 هذا المساء قد يضيف ~2,400 درهم للخدمة.',
      panier_title: 'متوسط السلة',
      panier_subtitle: 'آخر 24 ساعة · جميع القنوات',
      panier_foot_ia: 'تفعيل توصيات الذكاء الاصطناعي →',
      panier_hero_median: 'الوسيط 95 درهم · الأقصى 1,240 درهم (عيد ميلاد T8)',
      panier_hero_delta: '≈ مستقر مقابل أمس',
      panier_section_distribution: 'توزيع التذاكر',
      panier_section_segmentation: 'تجزئة',
      panier_segment_regulars: 'العملاء المنتظمون',
      panier_segment_regulars_sub: '47 عميل · متوسط التذكرة',
      panier_segment_occasional: 'العملاء العرضيون',
      panier_segment_occasional_sub: '108 عميل · متوسط التذكرة',
      panier_segment_tourists: 'السياح (بطاقة أجنبية)',
      panier_segment_tourists_sub: '27 عميل · متوسط التذكرة',
      panier_insight: '<b style="color:var(--mint);">رؤية:</b> ينفق عملاؤك المنتظمون <b>+45%</b> أكثر من العملاء العرضيين. توصيات الذكاء الاصطناعي في نهاية الطلب ("+1 شاي مقابل 12 درهم") يمكن أن ترفع متوسط التذكرة بنسبة <b>~12%</b>.',
      tips_title: 'الإكراميات',
      tips_subtitle: 'الإجمالي اليومي · للتوزيع في نهاية الخدمة',
      tips_foot_distribute: 'التوزيع الآن →',
      tips_hero_avg: '7,6% من الإيرادات المحصلة · متوسط المعدل 8,2%',
      tips_hero_delta: '↑ <bdi dir="ltr">+32%</bdi> مقابل الأسبوع',
      tips_section_prompt: 'طلب الإكرامية',
      tips_prompt_auto: 'طلب تلقائي +10%',
      tips_prompt_auto_sub: 'معروض على 78% من التذاكر اليوم · معدل القبول 64%',
      tips_section_server: 'حسب النادل',
      tips_server_sofia: 'صوفيا بلقاضي',
      tips_server_sofia_rate: 'معدل 11,2%',
      tips_server_fatima: 'فاطمة خالقي',
      tips_server_fatima_rate: 'معدل 8,8%',
      tips_server_hamid: 'حميد جلول',
      tips_server_hamid_rate: 'معدل 7,4%',
      tips_server_youssef: 'يوسف العمراني',
      tips_server_youssef_rate: 'معدل 5,1%',
      tips_section_period: 'حسب الفترة',
      tips_period_breakfast: 'الفطور 8ص-11ص',
      tips_period_breakfast_rate: 'معدل 1,8%',
      tips_period_lunch: 'الغداء 12م-3م',
      tips_period_lunch_rate: 'معدل 7,4%',
      tips_period_snack: 'العصر 3م-6م',
      tips_period_snack_rate: 'معدل 4,2%',
      tips_period_dinner: 'العشاء 7م-11م',
      tips_period_dinner_rate: 'معدل 11,8%',
      tips_insight: '<b style="color:var(--mint);">رؤية:</b> معدل المساء هو <b>~3 أضعاف</b> معدل الغداء. تفعيل طلب "+15%" خاص بعد الساعة 8 مساءً يمكن أن يضيف <b>~280 درهم/مساء</b>.',
      marge_title: 'الهامش الإجمالي',
      marge_subtitle: 'الإيرادات ناقص تكلفة المواد · 30 يومًا',
      marge_foot_cogs: 'عرض تكلفة المواد →',
      marge_hero_cogs: 'تكلفة المواد 28,6% من الإيرادات · الهدف ≤ 30%',
      marge_hero_delta: '↑ <bdi dir="ltr">+1,8</bdi> نقطة مقابل 30 يومًا سابقًا',
      marge_section_category: 'الهامش حسب الفئة',
      marge_cat_hot_drinks: 'المشروبات الساخنة',
      marge_cat_hot_drinks_sub: '28% من الإيرادات',
      marge_cat_cold_drinks: 'المشروبات الباردة',
      marge_cat_cold_drinks_sub: '17% من الإيرادات',
      marge_cat_pastries: 'المعجنات المنزلية',
      marge_cat_pastries_sub: '21% من الإيرادات',
      marge_cat_dishes: 'الأطباق والسلطات',
      marge_cat_dishes_sub: '34% من الإيرادات',
      marge_section_watch: 'للمراقبة',
      marge_watch_juice: 'العصائر الطازجة',
      marge_watch_juice_sub: 'ارتفاع تكلفة المواد · +6 نقاط',
      marge_watch_lunch: 'وجبة الغداء',
      marge_watch_lunch_sub: 'الهامش تحت الهدف',
      marge_insight: '<b style="color:var(--mint);">رؤية:</b> المشروبات الساخنة تدعم الهامش - <b>+3 نقاط</b> ممكنة عن طريق تحويل التركيز في القائمة من الأطباق إلى القهوة والمعجنات.',
      success_title: 'معدل النجاح',
      success_subtitle: 'امتثال الشبكة وبوابة بنك المغرب',
      success_foot_failures: 'عرض الإخفاقات →',
      success_hero_attempts: '184 محاولة · 183 نجاح · 1 فشل',
      success_hero_delta: '↑ <bdi dir="ltr">+0,2</bdi> نقطة مقابل أمس',
      success_section_benchmark: 'مقارنة بالسوق',
      success_bench_you: 'مقهى أطلس (أنتم)',
      success_bench_avg: 'متوسط مقاهي الدار البيضاء',
      success_bench_cmi: 'CMI التقليدي',
      success_bench_pci: 'معيار PCI-DSS',
      success_section_failure: 'الفشل الوحيد اليوم',
      success_failure_card: 'ماستركارد •• 7821 · 13:42',
      success_failure_reason: 'الرمز 51 · أموال غير كافية · BNP Paribas FR',
      success_failure_status: 'فشل',
      success_failure_recovery: 'أعاد العميل المحاولة ببطاقة أخرى بعد 18 ثانية · نجاح. لا خسارة.',
      success_section_health: 'الصحة التقنية',
      success_health_latency: 'متوسط زمن استجابة التفويض',
      success_health_latency_sub: 'p95 = 2,1 ث',
      success_health_gateway: 'توفر البوابة',
      success_health_gateway_sub: 'بنك المغرب + المستحوذ',
      success_health_terminals: 'الأجهزة الطرفية متصلة',
      success_health_terminals_sub: '3 / 3 PAX A920',
      success_health_4g: 'اتصال 4G احتياطي',
      success_health_4g_sub: 'استخدم 0 مرات',
      ratio_title: 'نسبة البطاقة / النقد',
      ratio_subtitle: 'مزيج الدفع · آخر 24 ساعة',
      ratio_foot_disable_cash: 'تعطيل النقد →',
      ratio_hero_gain: 'البطاقة تكسب 4 نقاط مقابل الأسبوع الماضي · +12 نقطة منذ الإطلاق',
      ratio_hero_delta: '↑ <bdi dir="ltr">+4</bdi> نقاط بطاقة',
      ratio_section_means: 'تفاصيل وسائل الدفع',
      ratio_means_cash: 'نقداً',
      ratio_section_hidden_cost: 'التكلفة الخفية للنقد',
      ratio_cost_bank: 'جولة البنك الأسبوعية',
      ratio_cost_bank_sub: '~ 45 دقيقة من وقت المدير · الجمعة',
      ratio_cost_errors: 'متوسط أخطاء الصندوق',
      ratio_cost_errors_sub: '0,4% من حجم النقد',
      ratio_cost_risk: 'مخاطر السرقة / الخسارة',
      ratio_cost_risk_sub: 'غير موجود في وضع البطاقة 100%',
      ratio_cost_total: 'إجمالي التكلفة السنوية التي يمكن تجنبها',
      ratio_cost_total_sub: '180 + 11 300 + المخاطر',
      ratio_insight: '<b style="color:var(--mint);">رؤية:</b> إذا انتقلت إلى 80٪ بطاقة (مقابل 68٪ اليوم) مع طلب "ادفع بالبطاقة = قهوة مجانية في المرة العاشرة" ، فإنك توفر <b>~12,800 درهم/سنويًا</b> من التعامل النقدي.',
      regulars_title: 'العملاء المنتظمون',
      regulars_subtitle: 'مُعرَّفون بالبطاقة المرمزة أو محفظة كيوي',
      regulars_foot_loyalty: 'إطلاق برنامج الولاء →',
      regulars_hero_base: '26٪ من قاعدة العملاء · معدل الاحتفاظ لمدة 30 يومًا = 72٪',
      regulars_hero_delta: '↑ <bdi dir="ltr">+9</bdi> جدد هذا الأسبوع',
      regulars_section_top5: 'أفضل 5 عملاء منتظمين · هذا الشهر',
      regulars_top5_1_sub: '12 زيارة · 18 قهوة · 6 طواجن',
      regulars_top5_2_sub: '10 زيارات · عضو منذ 2024',
      regulars_top5_3_sub: '9 زيارات · دائما T6',
      regulars_top5_4: 'نوال خليفي',
      regulars_top5_4_sub: '8 زيارات · يدفع عبر محفظة كيوي',
      regulars_top5_5: 'يوسف العمراني (موظف)',
      regulars_top5_5_sub: '8 زيارات · استراحة الغداء',
      regulars_section_cohorts: 'مجموعات التردد',
      regulars_cohorts_1: 'الزيارة الأولى هذا الشهر',
      regulars_cohorts_2: '2-3 زيارات',
      regulars_cohorts_3: '4-7 زيارات',
      regulars_cohorts_4: '8+ زيارات (أساسيون)',
      regulars_section_reactivate: 'عملاء لإعادة التنشيط',
      regulars_reactivate_text: '<b>14 عميلًا منتظمًا</b> لم يطلبوا منذ 6 أسابيع. رسالة واتساب "لقد اشتقنا إليك · -15٪ الأسبوع المقبل" حولت <b>43٪</b> من عمليات إعادة التنشيط الشهر الماضي.',
      regulars_insight: '<b style="color:var(--mint);">رؤية:</b> يمثل عملاؤك الأساسيون الـ 19 نسبة <b>34٪ من الإيرادات</b> بينما يمثلون 10٪ فقط من القاعدة. سيكلف برنامج الولاء (القهوة العاشرة مجانًا) <b>~280 درهمًا/شهريًا</b> ويحتفظ بهذه المجموعة ذات القيمة العالية.',
      default_title: 'مقياس',
      default_body: '<p style="color:var(--n-600);">تحليل مفصل متاح هنا.</p>'
    }
  };

  const kpiData = {
    /* ════════ Transactions ════════ */
    'tx': {
      title: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_title,
      subtitle: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_subtitle,
      foot: kpiFootBtns((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_foot_close, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_foot_journal),
      body: `
        ${kpiHero('182', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_hero_pic, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_hero_delta)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_section_repartition, `
          <div style="background:var(--paper-soft); border-radius:12px; padding:14px 16px;">
            <div style="display:flex; align-items:end; gap:4px; height:80px;">
              ${[4,6,9,12,18,24,21,13,10,9,13,18,25].map(n => {
                const peak = n >= 18;
                return `<div style="flex:1; background:${peak ? 'var(--atlas)' : '#B9E5CC'}; height:${(n/25)*100}%; border-radius:3px 3px 0 0; min-height:5px; transition:opacity 200ms;" title="${n} tx"></div>`;
              }).join('')}
            </div>
            <div style="display:flex; gap:4px; margin-top:8px; font-family:var(--mono); font-size:11px; color:var(--n-500);">
              ${['8h','9h','10h','11h','12h','13h','14h','15h','16h','17h','18h','19h','20h'].map(t => `<span style="flex:1; text-align:center;">${t}</span>`).join('')}
            </div>
          </div>
        `)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_section_server, [
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_sofia, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_sofia_role, '54 tx · 23 800 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_fatima, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_fatima_role, '42 tx · 18 200 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_hamid, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_hamid_role, '38 tx · 16 500 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_youssef, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_youssef_role, '25 tx · 11 200 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_auto, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_auto_role, '23 tx · 4 800 MAD'],
        ].map(([n, role, v]) => kpiRow(n, v, role)).join(''))}
        ${kpiInsight((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_insight)}
      `
    },

    /* ════════ Panier moyen ════════ */
    'panier': {
      title: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_title,
      subtitle: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_subtitle,
      foot: kpiFootBtns((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_foot_close, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_foot_ia),
      body: `
        ${kpiHero('134 <span style="font-size:18px; color:var(--n-500); font-weight:500;">MAD</span>', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_hero_median, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_hero_delta, 'neutral')}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_section_distribution, `
          <div style="background:var(--paper-soft); border-radius:12px; padding:14px 16px;">
            ${[
              ['< 50 MAD',   38, '#B9E5CC'],
              ['50-100',     54, '#7FD4A4'],
              ['100-200',    58, 'var(--atlas)'],
              ['200-400',    24, '#B9E5CC'],
              ['> 400',       8, 'var(--mint-soft)'],
            ].map(([lbl, n, c]) => `
              <div style="display:grid; grid-template-columns:80px 1fr 36px; gap:10px; align-items:center; padding:5px 0; font-size:12.5px;">
                <div style="color:var(--n-600);">${lbl}</div>
                <div style="height:8px; background:var(--surface); border-radius:4px; overflow:hidden;"><div style="width:${(n/58)*100}%; height:100%; background:${c}; border-radius:4px;"></div></div>
                <div style="font-family:var(--mono); text-align:end; font-weight:500;">${n}</div>
              </div>
            `).join('')}
          </div>
        `)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_section_segmentation, [
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_segment_regulars, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_segment_regulars_sub, '186 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_segment_occasional, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_segment_occasional_sub, '128 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_segment_tourists, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_segment_tourists_sub, '184 MAD'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiInsight((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_insight)}
      `
    },

    /* ════════ Pourboires ════════ */
    'tips': {
      title: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_title,
      subtitle: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_subtitle,
      foot: kpiFootBtns((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_foot_close, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_foot_distribute),
      body: `
        ${kpiHero('1 867 <span style="font-size:18px; color:var(--n-500); font-weight:500;">MAD</span>', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_hero_avg, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_hero_delta)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_section_prompt, `
          <div style="background:var(--paper-soft); border-radius:12px; padding:14px 16px; display:flex; justify-content:space-between; align-items:center; gap:14px;">
            <div>
              <div style="font-weight:500; font-size:13.5px;">${(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_prompt_auto}</div>
              <div style="font-size:11.5px; color:var(--n-500); margin-top:3px;">${(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_prompt_auto_sub}</div>
            </div>
            <div style="width:38px; height:22px; background:var(--atlas); border-radius:999px; position:relative;">
              <div style="position:absolute; top:2px; right:2px; width:18px; height:18px; background:var(--surface); border-radius:50%;"></div>
            </div>
          </div>
        `)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_section_server, [
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_server_sofia, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_server_sofia_rate, '+654 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_server_fatima, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_server_fatima_rate, '+560 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_server_hamid, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_server_hamid_rate, '+467 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_server_youssef, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_server_youssef_rate, '+186 MAD'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_section_period, [
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_period_breakfast, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_period_breakfast_rate, '+120 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_period_lunch, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_period_lunch_rate, '+820 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_period_snack, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_period_snack_rate, '+92 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_period_dinner, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_period_dinner_rate, '+835 MAD'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiInsight((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_insight)}
      `
    },

    /* ════════ Marge brute ════════ */
    'marge': {
      title: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_title,
      subtitle: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_subtitle,
      foot: kpiFootBtns((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_foot_close, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_foot_cogs),
      body: `
        ${kpiHero('71,4 <span style="font-size:18px; color:var(--n-500); font-weight:500;">%</span>', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_hero_cogs, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_hero_delta)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_section_category, [
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_cat_hot_drinks, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_cat_hot_drinks_sub, '82 %'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_cat_cold_drinks, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_cat_cold_drinks_sub, '74 %'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_cat_pastries, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_cat_pastries_sub, '66 %'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_cat_dishes, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_cat_dishes_sub, '58 %'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_section_watch, [
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_watch_juice, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_watch_juice_sub, '61 %'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_watch_lunch, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_watch_lunch_sub, '54 %'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiInsight((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_insight)}
      `
    },

    /* ════════ Taux de succès ════════ */
    'success': {
      title: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_title,
      subtitle: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_subtitle,
      foot: kpiFootBtns((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_foot_close, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_foot_failures),
      body: `
        ${kpiHero('99,32 <span style="font-size:18px; color:var(--n-500); font-weight:500;">%</span>', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_hero_attempts, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_hero_delta)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_section_benchmark, `
          <div style="background:var(--paper-soft); border-radius:12px; padding:14px 16px;">
            ${[
              [(() => { const r = (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_bench_you; const b = (window.KiwiMe && window.KiwiMe.business || '').trim(); return b ? r.replace(/^[^(]+/, b + ' ') : r; })(),   99.32, 'var(--atlas)'],
              [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_bench_avg,  99.00, '#7FD4A4'],
              [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_bench_cmi,    98.10, '#A8A49A'],
              [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_bench_pci,    97.50, 'var(--n-300)'],
            ].map(([lbl, pct, c]) => `
              <div style="display:grid; grid-template-columns:160px 1fr 50px; gap:10px; align-items:center; padding:6px 0; font-size:12.5px;">
                <div style="color:var(--n-600);">${lbl}</div>
                <div style="height:8px; background:var(--surface); border-radius:4px; overflow:hidden;"><div style="width:${(pct - 97) / 2.5 * 100}%; height:100%; background:${c}; border-radius:4px;"></div></div>
                <div style="font-family:var(--mono); text-align:end; font-weight:500;">${(window.KiwiNumber?.number(pct, 2) ?? new Intl.NumberFormat(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits:2,maximumFractionDigits:2}).format(pct))} %</div>
              </div>
            `).join('')}
          </div>
        `)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_section_failure, `
          <div style="background:color-mix(in srgb, var(--danger) 10%, var(--surface)); border:1px solid color-mix(in srgb, var(--danger) 30%, transparent); border-radius:12px; padding:14px 16px;">
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:8px;">
              <div>
                <div style="font-weight:500; font-size:13.5px;">${(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_failure_card}</div>
                <div style="font-size:11.5px; color:#9B2F22; margin-top:3px;">${(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_failure_reason}</div>
              </div>
              <span style="background:var(--surface); color:#9B2F22; padding:2px 8px; border-radius:999px; font-size:11px; font-family:var(--mono); font-weight:600;">${(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_failure_status}</span>
            </div>
            <div style="font-size:12px; color:var(--n-700);">${(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_failure_recovery}</div>
          </div>
        `)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_section_health, [
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_health_latency, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_health_latency_sub, '1,4 s'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_health_gateway, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_health_gateway_sub, '100,00 %'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_health_terminals, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_health_terminals_sub, '✓'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_health_4g, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_health_4g_sub, '✓'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
      `
    },

    /* ════════ Ratio carte / cash ════════ */
    'ratio': {
      title: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_title,
      subtitle: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_subtitle,
      foot: kpiFootBtns((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_foot_close, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_foot_disable_cash),
      body: `
        ${kpiHero('68 / 32 <span style="font-size:18px; color:var(--n-500); font-weight:500;">%</span>', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_hero_gain, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_hero_delta)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_section_means, `
          <div style="background:var(--paper-soft); border-radius:12px; padding:14px 16px;">
            ${[
              ['Visa',          48, 'var(--atlas)',  '11 700 MAD'],
              ['Mastercard',    24, '#7DF2B0',       '5 850 MAD'],
              ['Kiwi Tap',      18, 'var(--riad)',   '4 388 MAD'],
              ['Kiwi Wallet QR',10, '#D99A2B',       '2 438 MAD'],
              [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_means_cash,       32, '#A8A49A',       '7 800 MAD'],
            ].map(([lbl, pct, c, mad]) => `
              <div style="display:grid; grid-template-columns:120px 1fr 50px 100px; gap:10px; align-items:center; padding:6px 0; font-size:12.5px;">
                <div style="display:flex; align-items:center; gap:8px; color:var(--n-700);"><i style="width:10px; height:10px; border-radius:3px; background:${c}; display:inline-block;"></i>${lbl}</div>
                <div style="height:8px; background:var(--surface); border-radius:4px; overflow:hidden;"><div style="width:${pct/48*100}%; height:100%; background:${c}; border-radius:4px;"></div></div>
                <bdi dir="ltr" style="font-family:var(--mono); text-align:end; font-weight:500;">${pct} %</bdi>
                <bdi dir="ltr" style="font-family:var(--mono); text-align:end; color:var(--n-500); font-size:11.5px;">${mad}</bdi>
              </div>
            `).join('')}
          </div>
        `)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_section_hidden_cost, [
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_cost_bank, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_cost_bank_sub, '180 MAD/sem'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_cost_errors, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_cost_errors_sub, '~ 31 MAD/jour'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_cost_risk, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_cost_risk_sub, '·'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_cost_total, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_cost_total_sub, '≈ 21 000 MAD'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiInsight((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_insight)}
      `
    },

    /* ════════ Clients réguliers ════════ */
    'regulars': {
      title: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_title,
      subtitle: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_subtitle,
      foot: kpiFootBtns((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_foot_close, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_foot_loyalty),
      body: `
        ${kpiHero('47 <span style="font-size:18px; color:var(--n-500); font-weight:500;">/ 182</span>', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_hero_base, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_hero_delta)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_section_top5, [
          ['Karim Bensouda', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_top5_1_sub, '2 380 MAD'],
          ['Sara Lahlou', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_top5_2_sub, '1 920 MAD'],
          ['Hicham Cherki', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_top5_3_sub, '1 740 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_top5_4, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_top5_4_sub, '1 480 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_top5_5, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_top5_5_sub, '420 MAD'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_section_cohorts, `
          <div style="background:var(--paper-soft); border-radius:12px; padding:14px 16px;">
            ${[
              [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_cohorts_1,  68,  '#B9E5CC'],
              [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_cohorts_2,         42,  '#7FD4A4'],
              [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_cohorts_3,         28,  'var(--atlas)'],
              [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_cohorts_4, 19, 'var(--riad)'],
            ].map(([lbl, n, c]) => `
              <div style="display:grid; grid-template-columns:160px 1fr 36px; gap:10px; align-items:center; padding:5px 0; font-size:12.5px;">
                <div style="color:var(--n-700);">${lbl}</div>
                <div style="height:8px; background:var(--surface); border-radius:4px; overflow:hidden;"><div style="width:${n/68*100}%; height:100%; background:${c}; border-radius:4px;"></div></div>
                <div style="font-family:var(--mono); text-align:end; font-weight:500;">${n}</div>
              </div>
            `).join('')}
          </div>
        `)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_section_reactivate, `
          <div style="padding:14px 16px; background:color-mix(in srgb, var(--warn-ink) 12%, var(--surface)); border:1px solid color-mix(in srgb, var(--warn-ink) 32%, transparent); border-radius:12px; font-size:13px; color:var(--warn-ink); line-height:1.5;">
            ${(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_reactivate_text}
          </div>
        `)}
        ${kpiInsight((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_insight)}
      `
    },

    'default': { title: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).default_title, body: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).default_body }
  };


  const aiResponses = (AI_RESPONSES_STR[kiwiLang()] || AI_RESPONSES_STR.fr);
/* <</split:helpers>> */
    return { KPI_DESC, KPI_LONG, aiResponses, kpiData, kpiHero, kpiInsight, kpiSection, materialSymbol, methodsKey, methodsSaved, morningPush, settingsRow, txData };
  };
})();
