/* Boutique en ligne · « Aperçu » et « Réglages », the merchant's own shop
 * admin (Kiwi Commerce).
 *
 * Aperçu: the live shop in a frame, its link, QR code and WhatsApp share,
 * the month's numbers and what is left to set up. Réglages: the store
 * document `storefront` (functions/api/shop/_settings.js), which the
 * storefront reads with the live catalogue: delivery fee and free-delivery
 * threshold, multi-piece offers, promo codes, contact, shop wording and the
 * button colour. The server cleans every field again; this form only helps.
 *
 * The first half of this file; the page, its state and every handler
 * follow in the second IIFE.
 */
(() => {
  'use strict';
  const L = (fr, en, ar) => { const l = window.KiwiI18n?.getLang?.(); return l === 'en' ? en : l === 'ar' ? ar : fr; };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d) => window.KiwiNumber?.format(n, { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }) ?? String(Math.round(n));
  const mad = (cents) => num((Number(cents) || 0) / 100) + ' MAD';
  const DAY = 86400000;

  /* Material Symbols, Outlined 400 (assets/icons/material/). */
  const P = {
    copy: 'M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z',
    open: 'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h560v-280h80v280q0 33-23.5 56.5T760-120H200Zm188-212-56-56 372-372H560v-80h280v280h-80v-144L388-332Z',
    share: 'M680-80q-50 0-85-35t-35-85q0-6 3-28L282-392q-16 15-37 23.5t-45 8.5q-50 0-85-35t-35-85q0-50 35-85t85-35q24 0 45 8.5t37 23.5l281-164q-2-7-2.5-13.5T560-760q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35q-24 0-45-8.5T598-672L317-508q2 7 2.5 13.5t.5 14.5q0 8-.5 14.5T317-452l281 164q16-15 37-23.5t45-8.5q50 0 85 35t35 85q0 50-35 85t-85 35Zm0-80q17 0 28.5-11.5T720-200q0-17-11.5-28.5T680-240q-17 0-28.5 11.5T640-200q0 17 11.5 28.5T680-160ZM200-440q17 0 28.5-11.5T240-480q0-17-11.5-28.5T200-520q-17 0-28.5 11.5T160-480q0 17 11.5 28.5T200-440Zm508.5-291.5Q720-743 720-760t-11.5-28.5Q697-800 680-800t-28.5 11.5Q640-777 640-760t11.5 28.5Q663-720 680-720t28.5-11.5ZM680-200ZM200-480Zm480-280Z',
    download: 'M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z',
    done: 'm424-296 282-282-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z',
    todo: 'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Z',
    add: 'M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z',
    del: 'M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z',
    store: 'M841-518v318q0 33-23.5 56.5T761-120H201q-33 0-56.5-23.5T121-200v-318q-23-21-35.5-54t-.5-72l42-136q8-26 28.5-43t47.5-17h556q27 0 47 16.5t29 43.5l42 136q12 39-.5 71T841-518Zm-272-42q27 0 41-18.5t11-41.5l-22-140h-78v148q0 21 14 36.5t34 15.5Zm-180 0q23 0 37.5-15.5T441-612v-148h-78l-22 140q-4 24 10.5 42t37.5 18Zm-178 0q18 0 31.5-13t16.5-33l22-154h-78l-40 134q-6 20 6.5 43t41.5 23Zm540 0q29 0 42-23t6-43l-42-134h-76l22 154q3 20 16.5 33t31.5 13ZM201-200h560v-282q-5 2-6.5 2H751q-27 0-47.5-9T663-518q-18 18-41 28t-49 10q-27 0-50.5-10T481-518q-17 18-39.5 28T393-480q-29 0-52.5-10T299-518q-21 21-41.5 29.5T211-480h-4.5q-2.5 0-5.5-2v282Zm560 0H201h560Z',
  };
  const ic = (k, cls) => `<svg class="ws-i${cls ? ' ' + cls : ''}" viewBox="0 -960 960 960" aria-hidden="true" fill="currentColor"><path d="${P[k]}"/></svg>`;

  /* Button colours a boutique tends to pick; any other comes from the picker. */
  const ACCENTS = [
    ['', () => L('Noir', 'Black', 'أسود')], ['#6D1A2A', () => L('Bordeaux', 'Burgundy', 'عنابي')],
    ['#1F4D3A', () => L('Vert sapin', 'Pine green', 'أخضر داكن')], ['#1C2A4A', () => L('Bleu nuit', 'Midnight blue', 'أزرق ليلي')],
    ['#8A5A3C', () => L('Camel', 'Camel', 'جملي')], ['#B5476B', () => L('Rose ancien', 'Dusty rose', 'وردي')],
  ];

  function css() {
    if (document.getElementById('ws-css')) return;
    const s = document.createElement('style');
    s.id = 'ws-css';
    s.textContent = `
.ws-i{width:18px;height:18px;flex:none}
.ws-hero{display:grid;gap:14px}
@media(min-width:1100px){.ws-hero{grid-template-columns:minmax(0,1fr) 300px}}
.ws-card{border:1px solid var(--line,rgba(10,15,13,.12));border-radius:18px;background:var(--paper,#F7F5F0);padding:18px;min-width:0}
.ws-card h3{margin:0 0 4px;font-size:15px;font-weight:600}
.ws-sub{margin:0;color:var(--ink-3,#667);font-size:13px;line-height:1.5}
.ws-stage{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:end;padding:14px;border-radius:14px;background:linear-gradient(160deg,rgba(11,110,79,.08),rgba(10,15,13,.04));overflow:hidden}
.ws-browser{border-radius:10px;overflow:hidden;background:#FDFCF9;box-shadow:0 1px 0 rgba(10,15,13,.06),0 18px 40px -18px rgba(5,59,44,.35);min-width:0}
.ws-bar{display:flex;align-items:center;gap:6px;height:30px;padding:0 10px;background:rgba(10,15,13,.05);border-bottom:1px solid rgba(10,15,13,.08)}
.ws-bar i{width:8px;height:8px;border-radius:50%;background:rgba(10,15,13,.18)}
.ws-bar span{flex:1;margin-left:8px;height:20px;border-radius:6px;background:#FDFCF9;font-size:11.5px;color:var(--ink-2,#3a4440);display:flex;align-items:center;padding:0 10px;overflow:hidden;white-space:nowrap}
.ws-view{position:relative;aspect-ratio:16/10;overflow:hidden;background:#efefec}
.ws-view iframe{position:absolute;left:0;top:0;width:1280px;height:800px;border:0;transform-origin:0 0;transform:scale(var(--ws-s,.4));pointer-events:none}
.ws-phone{display:none;width:132px;border-radius:22px;padding:6px;background:#0A0F0D;box-shadow:0 18px 40px -16px rgba(5,59,44,.5)}
.ws-phone .ws-view{aspect-ratio:390/780;border-radius:16px}
.ws-phone iframe{width:390px;height:780px}
@media(min-width:760px){.ws-phone{display:block}}
.ws-open{position:absolute;inset:0;z-index:1;border-radius:14px}
.ws-open:focus-visible{outline:2px solid var(--atlas,#0B6E4F);outline-offset:-2px}
.ws-nourl{display:grid;place-items:center;gap:8px;text-align:center;padding:48px 18px;color:var(--ink-2,#3a4440)}
.ws-nourl .ws-i{width:36px;height:36px;color:var(--atlas,#0B6E4F)}
.ws-share{display:grid;gap:12px;align-content:start}
.ws-qr{display:grid;place-items:center;padding:12px;border-radius:14px;background:#FDFCF9;border:1px solid var(--line,rgba(10,15,13,.1))}
.ws-qr svg{width:100%;max-width:168px;height:auto}
.ws-link{display:flex;align-items:center;gap:6px;padding:4px 4px 4px 12px;border-radius:12px;background:var(--surface-2,rgba(10,15,13,.05));font-size:13px;min-width:0}
.ws-link span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
.ws-acts{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ws-acts .kb{display:inline-flex;align-items:center;justify-content:center;gap:6px}
.ws-acts .kb:first-child{grid-column:1/-1}
.ws-grid2{display:grid;gap:14px}
@media(min-width:1000px){.ws-grid2{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.ws-steps{list-style:none;margin:12px 0 0;padding:0;display:grid}
.ws-steps li{display:grid;grid-template-columns:22px 1fr auto;gap:12px;align-items:center;padding:11px 0;border-top:1px solid var(--line,rgba(10,15,13,.08));font-size:14px}
.ws-steps li .ws-i{width:22px;height:22px;color:var(--ink-3,#99a)}
.ws-steps li.ok .ws-i{color:var(--atlas,#0B6E4F)}
.ws-steps li small{display:block;color:var(--ink-3,#667);font-size:12px;margin-top:1px}
.ws-steps li.ok b{font-weight:500;color:var(--ink-2,#3a4440)}
.ws-meter{height:6px;border-radius:3px;background:var(--surface-2,rgba(10,15,13,.07));overflow:hidden;margin-top:12px}
.ws-meter i{display:block;height:100%;background:var(--atlas,#0B6E4F);border-radius:3px;transition:width .5s cubic-bezier(.34,1.45,.5,1)}
.ws-recent{display:grid;margin-top:8px}
.ws-recent button{display:grid;grid-template-columns:1fr auto;gap:2px 12px;text-align:start;border:0;background:none;font:inherit;padding:11px 0;border-top:1px solid var(--line,rgba(10,15,13,.08));cursor:pointer;color:inherit}
.ws-recent button:hover b{color:var(--atlas,#0B6E4F)}
.ws-recent small{grid-column:1/-1;color:var(--ink-3,#667);font-size:12px}
.ws-recent em{font-style:normal;font-weight:600;font-variant-numeric:tabular-nums}
.ws-form{display:grid;gap:14px}
@media(min-width:1100px){.ws-set{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;align-items:start}.ws-side{position:sticky;top:84px}}
.ws-sec{display:grid;gap:12px}
.ws-row{display:grid;gap:12px}
@media(min-width:640px){.ws-row.two{grid-template-columns:1fr 1fr}}
.ws-f{display:grid;gap:6px;font-size:13px}
.ws-f>span{font-weight:600}
.ws-f small{color:var(--ink-3,#667);font-weight:400}
.ws-f input,.ws-f textarea{min-height:44px;padding:10px 12px;border-radius:10px;border:1px solid var(--line,rgba(10,15,13,.18));background:#FDFCF9;font:inherit;font-size:14px;color:inherit;width:100%}
.ws-f textarea{min-height:64px;resize:vertical}
.ws-f input:focus,.ws-f textarea:focus{outline:2px solid var(--atlas,#0B6E4F);outline-offset:1px;border-color:transparent}
.ws-unit{display:flex;align-items:center;border-radius:10px;border:1px solid var(--line,rgba(10,15,13,.18));background:#FDFCF9}
.ws-unit:focus-within{outline:2px solid var(--atlas,#0B6E4F);outline-offset:1px}
.ws-unit input{border:0;outline:none!important;background:transparent;min-width:0}
.ws-unit em{font-style:normal;padding:0 12px;color:var(--ink-3,#667);font-size:13px;white-space:nowrap}
.ws-sw{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ws-sw label{position:relative;cursor:pointer}
.ws-sw input[type=radio]{position:absolute;opacity:0;width:1px;height:1px}
.ws-sw label span{display:block;width:34px;height:34px;border-radius:50%;background:var(--c);box-shadow:inset 0 0 0 1px rgba(10,15,13,.15),0 0 0 3px var(--paper,#F7F5F0),0 0 0 4px transparent;transition:box-shadow .2s}
.ws-sw input:checked+span{box-shadow:inset 0 0 0 1px rgba(10,15,13,.15),0 0 0 3px var(--paper,#F7F5F0),0 0 0 5px var(--atlas,#0B6E4F)}
.ws-sw input:focus-visible+span{outline:2px solid var(--atlas,#0B6E4F);outline-offset:6px}
.ws-sw .ws-pick{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-2,#3a4440);margin-left:4px}
.ws-sw .ws-pick input{width:34px;height:34px;padding:0;border:0;border-radius:50%;background:none;cursor:pointer}
.ws-cp{display:grid;gap:8px}
.ws-cp-row{display:grid;grid-template-columns:minmax(0,1fr) 110px 44px;gap:8px;align-items:center}
.ws-cp-row input{min-height:44px;padding:10px 12px;border-radius:10px;border:1px solid var(--line,rgba(10,15,13,.18));background:#FDFCF9;font:inherit;font-size:14px;width:100%}
.ws-cp-row input[data-ws-code]{text-transform:uppercase;font-family:var(--mono-code,'JetBrains Mono',monospace);font-size:13px;letter-spacing:.02em}
.ws-cp-row .kb{min-height:44px;padding:0;display:grid;place-items:center}
.ws-addcp{justify-self:start;display:inline-flex;align-items:center;gap:6px}
.ws-prev{display:grid;gap:12px}
.ws-pv{border-radius:14px;overflow:hidden;background:#efefec;border:1px solid var(--line,rgba(10,15,13,.1))}
.ws-pv-ann{background:#000;color:#f8f8f6;font-size:10.5px;text-align:center;padding:6px 10px;line-height:1.35}
.ws-pv-body{padding:14px;display:grid;gap:10px}
.ws-pv-name{font-size:30px;line-height:.9;font-weight:600;letter-spacing:-.02em;font-stretch:75%;color:#000;overflow-wrap:anywhere}
.ws-pv-tag{font-size:12px;color:#3d3d3a;line-height:1.45}
.ws-pv-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}
.ws-pv-tiles i{aspect-ratio:4/5;border-radius:3px;background:var(--c)}
.ws-pv-btn{height:38px;border-radius:3px;display:grid;place-items:center;font-size:12.5px;font-weight:600;background:var(--a,#000);color:var(--o,#fff)}
.ws-pv-tot{font-size:12px;color:#3d3d3a;display:grid;gap:3px}
.ws-pv-tot div{display:flex;justify-content:space-between}
.ws-save{position:sticky;bottom:12px;z-index:5;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:10px 10px 10px 16px;border-radius:14px;background:var(--riad,#053B2C);color:#F7F5F0;box-shadow:0 14px 34px -14px rgba(5,59,44,.6);transform:translateY(8px);opacity:0;pointer-events:none;transition:opacity .25s,transform .31s cubic-bezier(.34,1.45,.5,1)}
.ws-save.on{opacity:1;transform:none;pointer-events:auto}
.ws-save p{margin:0;font-size:13.5px}
.wo-page .ws-save button.kb.ghost{color:#F7F5F0;background:transparent;border:1px solid rgba(247,245,240,.4)}.wo-page .ws-save button.kb.ghost:hover{background:rgba(247,245,240,.1)}
.ws-err{color:#a3271b;font-size:12.5px}
`;
    document.head.appendChild(s);
  }

  /* ── Aperçu ─────────────────────────────────────────────────────── */
  function stats(orders) {
    const now = Date.now();
    const recent = orders.filter((o) => now - (Number(o.createdTs) || 0) < 30 * DAY);
    const conf = recent.filter((o) => o.status === 'confirmed');
    const decl = recent.filter((o) => o.status === 'declined');
    const cash = conf.reduce((s, o) => s + (Number(o.totalCents) || 0), 0);
    return {
      count: recent.length, cash,
      rate: conf.length + decl.length ? Math.round(100 * conf.length / (conf.length + decl.length)) : null,
      basket: conf.length ? Math.round(cash / conf.length) : 0,
      pending: orders.filter((o) => o.status === 'pending' || o.status === 'confirming'),
    };
  }
  function host(url) { return String(url || '').replace(/^https:\/\//, ''); }

  function overview(ctx) {
    const s = ctx.settings || {};
    const url = s.url || '';
    const st = stats(ctx.orders || []);
    const prods = ctx.products || [];
    const online = prods.filter((p) => p.online !== false);
    const withPhoto = online.filter((p) => p.photo).length;
    const steps = [
      { ok: ctx.enabled, t: L('Boutique activée par Kiwi', 'Shop switched on by Kiwi', 'تفعيل المتجر من Kiwi'), d: ctx.enabled ? '' : L('Demandez l’activation à l’équipe Kiwi.', 'Ask the Kiwi team to switch it on.', 'اطلب التفعيل من فريق Kiwi.') },
      { ok: !!url, t: L('Adresse de la boutique', 'Shop address', 'عنوان المتجر'), d: url ? host(url) : L('Ajoutez-la dans Réglages.', 'Add it in Settings.', 'أضفه في الإعدادات.'), go: url ? '' : 'settings' },
      { ok: !!s.updatedTs, t: L('Livraison et offres réglées', 'Delivery and offers set', 'ضبط التوصيل والعروض'), d: s.updatedTs ? L('Frais', 'Fee', 'الرسوم') + ' ' + num(s.shipping?.feeMAD || 0) + ' MAD' : L('Frais de livraison, livraison offerte, packs.', 'Delivery fee, free delivery, packs.', 'رسوم التوصيل والتوصيل المجاني والعروض.'), go: s.updatedTs ? '' : 'settings' },
      { ok: !!s.whatsapp, t: L('Contact WhatsApp', 'WhatsApp contact', 'التواصل عبر واتساب'), d: s.whatsapp ? '+' + s.whatsapp : L('Les clients pourront vous écrire après la commande.', 'Customers can message you after ordering.', 'يمكن للعملاء مراسلتك بعد الطلب.'), go: s.whatsapp ? '' : 'settings' },
      { ok: online.length > 0 && withPhoto === online.length, t: L('Photos des pièces', 'Product photos', 'صور القطع'), d: num(withPhoto) + ' / ' + num(online.length) + ' ' + L('pièces en ligne ont une photo', 'online pieces have a photo', 'قطع معروضة لديها صورة'), go: withPhoto === online.length ? '' : 'products' },
      { ok: online.length > 0 && (ctx.withText || 0) >= online.length, t: L('Texte de chaque pièce', 'Text for each piece', 'نص لكل قطعة'), d: num(ctx.withText || 0) + ' / ' + num(online.length) + ' ' + L('pièces décrites (matière, coupe, tenue)', 'pieces described (fabric, fit, wear)', 'قطع موصوفة (الخامة، القصّة)'), go: (ctx.withText || 0) >= online.length ? '' : 'products' },
      { ok: !ctx.clashes, t: L('Noms et couleurs d’accord', 'Names match colours', 'الأسماء توافق الألوان'), d: ctx.clashes ? num(ctx.clashes) + ' ' + L('pièce(s) dont le nom contredit la couleur', 'piece(s) whose name contradicts the colour', 'قطعة اسمها يخالف لونها') : '', go: ctx.clashes ? 'products' : '' },
      { ok: (ctx.orders || []).length > 0, t: L('Première commande', 'First order', 'أول طلب'), d: (ctx.orders || []).length ? '' : L('Partagez le lien sur Instagram et WhatsApp.', 'Share the link on Instagram and WhatsApp.', 'شارك الرابط على إنستغرام وواتساب.') },
    ];
    const done = steps.filter((x) => x.ok).length;
    const qr = url && window.KiwiQR ? window.KiwiQR.svg(url, { size: 168, margin: 2, ecl: 'M' }) : '';
    const frame = url
      ? `<div class="ws-stage"><a class="ws-open" href="${esc(url)}" target="_blank" rel="noopener" aria-label="${esc(L('Ouvrir la boutique dans un nouvel onglet', 'Open the shop in a new tab', 'افتح المتجر في علامة تبويب جديدة'))}"></a>
          <div class="ws-browser"><div class="ws-bar"><i></i><i></i><i></i><span>${esc(host(url))}</span></div>
            <div class="ws-view" data-ws-view="1280"><iframe src="${esc(url)}" title="${esc(L('Aperçu de la boutique', 'Shop preview', 'معاينة المتجر'))}" loading="lazy" tabindex="-1" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer"></iframe></div></div>
          <div class="ws-phone"><div class="ws-view" data-ws-view="390"><iframe src="${esc(url)}" title="${esc(L('Aperçu sur téléphone', 'Phone preview', 'معاينة على الهاتف'))}" loading="lazy" tabindex="-1" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer"></iframe></div></div>
        </div>`
      : `<div class="ws-nourl">${ic('store')}<b>${esc(L('Votre boutique n’a pas encore d’adresse', 'Your shop has no address yet', 'ليس لمتجرك عنوان بعد'))}</b><p class="ws-sub">${esc(L('L’équipe Kiwi la crée avec vous. Vous pouvez aussi la saisir dans Réglages.', 'The Kiwi team sets it up with you. You can also enter it in Settings.', 'يُنشئه فريق Kiwi معك. يمكنك أيضًا إدخاله في الإعدادات.'))}</p><button type="button" class="kb ghost" data-action="wo-tab" data-arg="settings">${esc(L('Ouvrir les réglages', 'Open settings', 'افتح الإعدادات'))}</button></div>`;
    const recent = st.pending.slice(0, 4).map((o) => `<button type="button" data-action="wo-tab" data-arg="orders"><b>${esc(o.customer?.name || o.number)}</b><em>${esc(mad(o.totalCents))}</em><small>${esc(o.number)} · ${esc(o.customer?.city || '')} · ${esc((o.lines || []).reduce((n, l) => n + (Number(l.quantity) || 0), 0))} ${esc(L('pièce(s)', 'piece(s)', 'قطعة'))}</small></button>`).join('');
    return `<div class="ws-hero">
        <section class="ws-card" aria-label="${esc(L('Votre boutique', 'Your shop', 'متجرك'))}">${frame}</section>
        <section class="ws-card ws-share" aria-labelledby="ws-share-t">
          <div><h3 id="ws-share-t">${esc(L('Partager la boutique', 'Share the shop', 'شارك المتجر'))}</h3><p class="ws-sub">${esc(L('Dans votre bio Instagram, en statut WhatsApp, et en caisse avec le QR code.', 'In your Instagram bio, as a WhatsApp status, and at the till with the QR code.', 'في سيرة إنستغرام، كحالة واتساب، وعند الصندوق برمز QR.'))}</p></div>
          ${url ? `<div class="ws-qr" data-ws-qr>${qr}</div>
          <div class="ws-link"><span>${esc(host(url))}</span><button type="button" class="kb ghost sm" data-action="wo-copy-link" aria-label="${esc(L('Copier le lien', 'Copy the link', 'نسخ الرابط'))}">${ic('copy')}</button></div>
          <div class="ws-acts">
            <a class="kb atlas" href="${esc(url)}" target="_blank" rel="noopener">${ic('open')}${esc(L('Voir ma boutique', 'View my shop', 'عرض متجري'))}</a>
            <button type="button" class="kb ghost" data-action="wo-share-wa">${ic('share')}WhatsApp</button>
            <button type="button" class="kb ghost" data-action="wo-qr-download">${ic('download')}${esc(L('QR code', 'QR code', 'رمز QR'))}</button>
          </div>` : `<p class="ws-sub">${esc(L('Le lien et le QR code apparaîtront ici.', 'The link and QR code will show here.', 'سيظهر الرابط ورمز QR هنا.'))}</p>`}
        </section>
      </div>
      <div class="kx-kpi-strip ws-kpis">
        <div class="kx-kpi"><div class="l">${esc(L('À confirmer', 'To confirm', 'بانتظار التأكيد'))}</div><div class="v">${esc(num(st.pending.length))}</div><div class="d">${esc(mad(st.pending.reduce((s, o) => s + (Number(o.totalCents) || 0), 0)))}</div></div>
        <div class="kx-kpi"><div class="l">${esc(L('Commandes, 30 jours', 'Orders, 30 days', 'الطلبات، 30 يومًا'))}</div><div class="v">${esc(num(st.count))}</div><div class="d">${esc(st.rate == null ? L('Pas encore de décision', 'No decision yet', 'لا قرار بعد') : L('Confirmées à', 'Confirmed at', 'مؤكدة بنسبة') + ' ' + st.rate + ' %')}</div></div>
        <div class="kx-kpi"><div class="l">${esc(L('Ventes confirmées, 30 jours', 'Confirmed sales, 30 days', 'المبيعات المؤكدة، 30 يومًا'))}</div><div class="v">${esc(mad(st.cash))}</div><div class="d">${esc(L('Encaissées à la livraison', 'Collected on delivery', 'تُحصَّل عند التسليم'))}</div></div>
        <div class="kx-kpi"><div class="l">${esc(L('Panier moyen', 'Average basket', 'متوسط السلة'))}</div><div class="v">${esc(st.basket ? mad(st.basket) : '0 MAD')}</div><div class="d">${esc(L('Commandes confirmées', 'Confirmed orders', 'الطلبات المؤكدة'))}</div></div>
      </div>
      <div class="ws-grid2">
        <section class="ws-card" aria-labelledby="ws-steps-t"><h3 id="ws-steps-t">${esc(L('Pour bien vendre en ligne', 'To sell well online', 'للبيع الجيد عبر الإنترنت'))}</h3>
          <p class="ws-sub">${esc(num(done))} / ${esc(num(steps.length))} ${esc(L('étapes faites', 'steps done', 'خطوات منجزة'))}</p>
          <div class="ws-meter" role="progressbar" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${done}"><i style="width:${Math.round(100 * done / steps.length)}%"></i></div>
          <ul class="ws-steps">${steps.map((x) => `<li class="${x.ok ? 'ok' : ''}">${ic(x.ok ? 'done' : 'todo')}<div><b>${esc(x.t)}</b>${x.d ? `<small>${esc(x.d)}</small>` : ''}</div>${x.go ? `<button type="button" class="kb ghost sm" data-action="wo-tab" data-arg="${esc(x.go)}">${esc(L('Faire', 'Do it', 'نفّذ'))}</button>` : '<span></span>'}</li>`).join('')}</ul>
        </section>
        <section class="ws-card" aria-labelledby="ws-recent-t"><h3 id="ws-recent-t">${esc(L('À confirmer maintenant', 'To confirm now', 'للتأكيد الآن'))}</h3>
          ${recent ? `<p class="ws-sub">${esc(L('Appelez le client, puis confirmez : la commande passe en livraison.', 'Call the customer, then confirm: the order moves to deliveries.', 'اتصل بالعميل ثم أكّد: ينتقل الطلب إلى التوصيلات.'))}</p><div class="ws-recent">${recent}</div>`
            : `<p class="ws-sub">${esc(L('Aucune commande en attente. Les nouvelles commandes arrivent ici et dans les notifications.', 'No orders waiting. New orders show up here and in notifications.', 'لا طلبات في الانتظار. تظهر الطلبات الجديدة هنا وفي الإشعارات.'))}</p>`}
        </section>
      </div>`;
  }

  /* ── Réglages ───────────────────────────────────────────────────── */
  function inkOn(hex) {
    const h = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : '#000000';
    const lin = (i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const Lm = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
    return (Lm + 0.05) / 0.05 >= 1.05 / (Lm + 0.05) ? '#000000' : '#ffffff';
  }

  function settings(ctx) {
    const s = ctx.draft || {};
    const ship = s.shipping || {};
    const b = s.bundles || {};
    const coupons = Array.isArray(s.couponRows) ? s.couponRows : [];
    const custom = s.accent && !ACCENTS.some(([v]) => v.toUpperCase() === String(s.accent).toUpperCase());
    const f = (key, label, input, hint) => `<label class="ws-f"><span>${esc(label)}${hint ? ` <small>${esc(hint)}</small>` : ''}</span>${input}</label>`;
    const txt = (key, max, ph, val) => `<input data-ws="${key}" maxlength="${max}" value="${esc(val == null ? s[key] || '' : val)}" placeholder="${esc(ph || '')}">`;
    const unit = (key, val, u, min, max) => `<div class="ws-unit"><input data-ws="${key}" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${esc(val == null ? '' : val)}"><em>${esc(u)}</em></div>`;
    return `<form class="ws-set" data-ws-form novalidate>
      <div class="ws-form">
        <section class="ws-card ws-sec" aria-labelledby="ws-s1"><h3 id="ws-s1">${esc(L('Votre boutique', 'Your shop', 'متجرك'))}</h3>
          <div class="ws-row two">
            ${f('name', L('Nom affiché', 'Display name', 'الاسم المعروض'), txt('name', 60, ctx.shopName || ''), L('facultatif', 'optional', 'اختياري'))}
            ${f('url', L('Adresse de la boutique', 'Shop address', 'عنوان المتجر'), txt('url', 120, 'votre-boutique.kiwi-os.com', host(s.url)), L('fournie par Kiwi', 'provided by Kiwi', 'يوفّره Kiwi'))}
          </div>
          ${f('tagline', L('Phrase d’accueil', 'Welcome line', 'جملة الترحيب'), `<textarea data-ws="tagline" maxlength="140" rows="2" placeholder="${esc(L('Ex. Pièces choisies à Casablanca, livrées partout au Maroc.', 'E.g. Pieces picked in Casablanca, delivered all over Morocco.', 'مثال: قطع مختارة في الدار البيضاء، تُوصَل إلى كل المغرب.'))}">${esc(s.tagline || '')}</textarea>`, L('sous le nom, en page d’accueil', 'under the name, on the home page', 'تحت الاسم في الصفحة الرئيسية'))}
          ${f('announcement', L('Bandeau du haut', 'Top banner', 'الشريط العلوي'), txt('announcement', 120, L('Ex. Nouvelle collection en ligne ce vendredi', 'E.g. New collection online this Friday', 'مثال: تشكيلة جديدة يوم الجمعة')), L('vide : livraison et paiement', 'empty: delivery and payment', 'فارغ: التوصيل والدفع'))}
          <div class="ws-f"><span>${esc(L('Couleur des boutons', 'Button colour', 'لون الأزرار'))}</span>
            <div class="ws-sw" role="radiogroup" aria-label="${esc(L('Couleur des boutons', 'Button colour', 'لون الأزرار'))}">
              ${ACCENTS.map(([v, name]) => `<label title="${esc(name())}"><input type="radio" name="ws-accent" value="${esc(v)}" ${String(s.accent || '').toUpperCase() === v.toUpperCase() && !custom ? 'checked' : ''}><span style="--c:${esc(v || '#000000')}"></span><b class="kx-sr">${esc(name())}</b></label>`).join('')}
              <label class="ws-pick"><input type="radio" name="ws-accent" value="custom" ${custom ? 'checked' : ''} class="kx-sr"><input type="color" data-ws-color value="${esc(custom ? s.accent : '#0B6E4F')}" aria-label="${esc(L('Autre couleur', 'Other colour', 'لون آخر'))}">${esc(L('Autre', 'Other', 'آخر'))}</label>
            </div></div>
        </section>
        <section class="ws-card ws-sec" aria-labelledby="ws-s2"><h3 id="ws-s2">${esc(L('Livraison', 'Delivery', 'التوصيل'))}</h3>
          <p class="ws-sub">${esc(L('Payée par le client, ajoutée au total à encaisser. Ozon Express livre partout au Maroc.', 'Paid by the customer, added to the total to collect. Ozon Express delivers all over Morocco.', 'يدفعها العميل وتضاف إلى المبلغ المحصَّل. أوزون إكسبريس يوصل إلى كل المغرب.'))}</p>
          <div class="ws-row two">
            ${f('fee', L('Frais de livraison', 'Delivery fee', 'رسوم التوصيل'), unit('fee', ship.feeMAD, 'MAD', 0, 500))}
            ${f('free', L('Offerte à partir de', 'Free from', 'مجانية ابتداءً من'), unit('free', ship.freeFromMAD, 'MAD', 0, 100000), L('vide : jamais offerte', 'empty: never free', 'فارغ: غير مجانية أبدًا'))}
          </div>
        </section>
        <section class="ws-card ws-sec" aria-labelledby="ws-s3"><h3 id="ws-s3">${esc(L('Offres', 'Offers', 'العروض'))}</h3>
          <p class="ws-sub">${esc(L('Une remise quand le client prend la même pièce en 2 ou 3 exemplaires. 0 : pas d’offre.', 'A discount when the customer takes the same piece 2 or 3 times. 0: no offer.', 'خصم عندما يأخذ العميل نفس القطعة مرتين أو 3 مرات. 0: لا عرض.'))}</p>
          <div class="ws-row two">
            ${f('b2', L('2 pièces', '2 pieces', 'قطعتان'), unit('b2', b[2] ?? 0, '%', 0, 50))}
            ${f('b3', L('3 pièces et plus', '3 pieces or more', '3 قطع أو أكثر'), unit('b3', b[3] ?? 0, '%', 0, 50))}
          </div>
          <div class="ws-f"><span>${esc(L('Codes promo', 'Promo codes', 'رموز الخصم'))} <small>${esc(L('3 à 20 lettres ou chiffres, jusqu’à 20 codes', '3 to 20 letters or digits, up to 20 codes', 'من 3 إلى 20 حرفًا أو رقمًا، حتى 20 رمزًا'))}</small></span>
            <div class="ws-cp" data-ws-coupons>${coupons.map((c, i) => `<div class="ws-cp-row"><input data-ws-code maxlength="20" value="${esc(c.code)}" placeholder="RAMADAN" aria-label="${esc(L('Code', 'Code', 'الرمز'))}"><div class="ws-unit"><input data-ws-pct type="number" inputmode="numeric" min="1" max="90" value="${esc(c.pct)}" aria-label="${esc(L('Remise en pourcentage', 'Discount percent', 'نسبة الخصم'))}"><em>%</em></div><button type="button" class="kb ghost" data-action="wo-coupon-del" data-arg="${i}" aria-label="${esc(L('Supprimer ce code', 'Remove this code', 'احذف هذا الرمز'))}">${ic('del')}</button></div>`).join('')}</div>
            ${coupons.length < 20 ? `<button type="button" class="kb ghost sm ws-addcp" data-action="wo-coupon-add">${ic('add')}${esc(L('Ajouter un code', 'Add a code', 'أضف رمزًا'))}</button>` : ''}
          </div>
        </section>
        <section class="ws-card ws-sec" aria-labelledby="ws-s4"><h3 id="ws-s4">${esc(L('Contact', 'Contact', 'التواصل'))}</h3>
          <div class="ws-row two">
            ${f('whatsapp', 'WhatsApp', txt('whatsapp', 16, '212612345678'), L('avec l’indicatif 212', 'with the 212 prefix', 'مع الرمز 212'))}
            ${f('instagram', 'Instagram', txt('instagram', 31, 'votreboutique'), L('sans le @', 'without the @', 'بدون @'))}
          </div>
        </section>
      </div>
      <aside class="ws-side ws-prev" aria-label="${esc(L('Aperçu', 'Preview', 'معاينة'))}">
        <div class="ws-card"><h3>${esc(L('Aperçu', 'Preview', 'معاينة'))}</h3><p class="ws-sub">${esc(L('Ce que verra le client.', 'What the customer will see.', 'ما سيراه العميل.'))}</p></div>
        <div class="ws-pv" data-ws-preview></div>
      </aside>
      <div class="ws-save" data-ws-save><p data-ws-save-msg>${esc(L('Modifications non enregistrées', 'Unsaved changes', 'تغييرات غير محفوظة'))}</p><div style="display:flex;gap:8px"><button type="button" class="kb ghost" data-action="wo-settings-reset">${esc(L('Annuler', 'Discard', 'إلغاء'))}</button><button type="button" class="kb atlas" data-action="wo-settings-save" data-activation="write">${esc(L('Enregistrer', 'Save', 'حفظ'))}</button></div></div>
    </form>`;
  }

  /* The form's values, as the store document wants them. */
  function readForm(root, draft) {
    const v = (k) => (root.querySelector(`[data-ws="${k}"]`) || {}).value ?? '';
    const n = (k) => { const x = String(v(k)).trim(); return x === '' ? null : Math.round(Number(x)); };
    const pick = root.querySelector('input[name="ws-accent"]:checked');
    const accent = !pick ? (draft.accent || '') : pick.value === 'custom' ? (root.querySelector('[data-ws-color]') || {}).value || '' : pick.value;
    const rows = Array.from(root.querySelectorAll('.ws-cp-row')).map((r) => ({
      code: String((r.querySelector('[data-ws-code]') || {}).value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''),
      pct: String((r.querySelector('[data-ws-pct]') || {}).value || '').trim(),
    }));
    return {
      name: v('name').trim(), url: v('url').trim(), tagline: v('tagline').trim(), announcement: v('announcement').trim(),
      whatsapp: v('whatsapp').replace(/\D/g, ''), instagram: v('instagram').trim().replace(/^@/, ''), accent: String(accent).toUpperCase(),
      shipping: { feeMAD: n('fee') || 0, freeFromMAD: n('free') },
      bundles: { 2: n('b2') || 0, 3: n('b3') || 0 },
      couponRows: rows,
    };
  }

  function preview(el, d, shopName, tiles) {
    if (!el) return;
    const fee = Number(d.shipping?.feeMAD) || 0;
    const free = d.shipping?.freeFromMAD;
    const ann = d.announcement || (L('Paiement à la livraison, partout au Maroc', 'Cash on delivery, all over Morocco', 'الدفع عند الاستلام في كل المغرب') + (free != null && free > 0 ? '. ' + L('Livraison offerte dès', 'Free delivery from', 'توصيل مجاني ابتداءً من') + ' ' + num(free) + ' MAD.' : '.'));
    const a = /^#[0-9a-f]{6}$/i.test(d.accent || '') ? d.accent : '#000000';
    const b2 = Number(d.bundles?.[2]) || 0;
    el.innerHTML = `<div class="ws-pv-ann">${esc(ann)}</div><div class="ws-pv-body">
      <div class="ws-pv-name">${esc(d.name || shopName || '')}</div>
      ${d.tagline ? `<div class="ws-pv-tag">${esc(d.tagline)}</div>` : ''}
      <div class="ws-pv-tiles">${(tiles.length ? tiles : ['#1A1A1A', '#FFFFFF', '#1F5FA8']).slice(0, 3).map((c) => `<i style="--c:${esc(c)}"></i>`).join('')}</div>
      <div class="ws-pv-tot"><div><span>${esc(L('Livraison', 'Delivery', 'التوصيل'))}</span><span>${fee ? esc(num(fee)) + ' MAD' : esc(L('Offerte', 'Free', 'مجانية'))}</span></div>${b2 ? `<div><span>${esc(L('2 pièces', '2 pieces', 'قطعتان'))}</span><span>−${esc(b2)} %</span></div>` : ''}</div>
      <div class="ws-pv-btn" style="--a:${esc(a)};--o:${esc(inkOn(a))}">${esc(L('Commander, je paie à la livraison', 'Order, I pay on delivery', 'اطلب، أدفع عند الاستلام'))}</div></div>`;
  }

  /* Scale each live frame to its box. */
  function fitFrames(root) {
    const views = Array.from((root || document).querySelectorAll('[data-ws-view]'));
    const fit = () => views.forEach((v) => { if (v.isConnected) v.style.setProperty('--ws-s', String(v.clientWidth / Number(v.dataset.wsView))); });
    fit();
    if (window.ResizeObserver) { const ro = new ResizeObserver(fit); views.forEach((v) => ro.observe(v)); }
  }

  window.KiwiWebShop = { css, overview, settings, readForm, preview, fitFrames };
})();

/* Boutique en ligne (Kiwi Commerce): the merchant's own shop admin.
 * Aperçu (the live shop, its link and QR code, the month's numbers, what is
 * left to set up), Commandes, Articles en ligne, Réglages. Aperçu and
 * Réglages are drawn by window.KiwiWebShop, defined in the first half of this
 * file; the second half owns the page, its state and every handler.
 *
 * Orders arrive from the storefront through /api/shop/orders and wait here.
 * « Confirmer » makes them an ordinary delivery sale (/api/shop/decide): they
 * then live in Livraisons, with Ozon, like a delivery rung up at the till.
 * « Articles en ligne » is the switch the storefront reads: a piece switched
 * off here disappears from the shop at the next catalogue publish.
 *
 * Lazy section (assets/pages-pro.js › LAZY_SECTIONS): every handler listed
 * there is registered below, no more, no less. */
(() => {
  'use strict';
  if (!window.Kiwi) return;
  const { toast, modal, handlers } = window.Kiwi;
  const L = (fr, en, ar) => { const l = window.KiwiI18n?.getLang?.(); return l === 'en' ? en : l === 'ar' ? ar : fr; };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mad = (cents) => (window.KiwiNumber?.format((Number(cents) || 0) / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ?? ((Number(cents) || 0) / 100).toFixed(2)) + ' MAD';
  const when = (ts) => {
    try { return new Date(ts).toLocaleString(document.documentElement.lang || 'fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return ''; }
  };
  const slug = () => { try { return window.KiwiCloudDoc?.currentSlug?.() || ''; } catch (_) { return ''; } };
  const CAT = () => window.KiwiBoutiqueCatalog || null;

  const state = { tab: 'overview', filter: 'pending', orders: [], enabled: true, loaded: false, error: '', query: '', sig: '', token: '',
    settings: null, rev: 0, draft: null, dirty: false, saving: false };
  const WS = () => window.KiwiWebShop || null;
  const TABS = ['overview', 'orders', 'products', 'settings'];
  let poll = 0;

  const STATUS = {
    pending: () => L('À confirmer', 'To confirm', 'بانتظار التأكيد'),
    confirming: () => L('En cours', 'In progress', 'قيد المعالجة'),
    confirmed: () => L('Confirmée', 'Confirmed', 'مؤكَّد'),
    declined: () => L('Refusée', 'Declined', 'مرفوض'),
  };

  function css() {
    if (document.getElementById('wo-css')) return;
    const style = document.createElement('style');
    style.id = 'wo-css';
    style.textContent = `
.wo-page{display:grid;gap:18px}
.wo-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.wo-seg{display:inline-flex;gap:4px;padding:4px;border-radius:999px;background:var(--surface-2,rgba(10,15,13,.05))}
.wo-seg button{border:0;background:transparent;font:inherit;font-weight:600;font-size:13px;padding:8px 14px;border-radius:999px;color:var(--ink-2,#3a4440);cursor:pointer;min-height:36px}
.wo-seg button.on{background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D);box-shadow:0 1px 2px rgba(10,15,13,.12)}
.wo-list{display:grid;gap:12px}
.wo-card{border:1px solid var(--line,rgba(10,15,13,.12));border-radius:16px;padding:16px 18px;background:var(--paper,#F7F5F0);display:grid;gap:10px}
.wo-head{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:baseline;justify-content:space-between}
.wo-num{font-weight:700;font-size:15px;font-variant-numeric:tabular-nums}
.wo-meta{color:var(--ink-3,#667);font-size:12px}
.wo-pill{font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;background:var(--surface-2,rgba(10,15,13,.06));color:var(--ink-2,#3a4440)}
.wo-pill.pending{background:rgba(183,121,31,.14);color:#8a5a12}
.wo-pill.confirmed{background:rgba(11,110,79,.12);color:var(--atlas,#0B6E4F)}
.wo-who{display:grid;gap:2px;font-size:13px;line-height:1.45}
.wo-who b{font-size:14px}
.wo-lines{display:grid;gap:4px;font-size:13px;border-top:1px dashed var(--line,rgba(10,15,13,.14));padding-top:10px}
.wo-line{display:flex;justify-content:space-between;gap:12px}
.wo-tot{display:flex;justify-content:space-between;font-weight:700;font-size:14px;font-variant-numeric:tabular-nums}
.wo-acts{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.wo-note{font-size:13px;color:var(--ink-2,#3a4440);line-height:1.5;max-width:68ch}
.wo-prod{display:flex;align-items:center;gap:12px;padding:10px 4px;border-bottom:1px solid var(--line,rgba(10,15,13,.08))}
.wo-prod img,.wo-prod .wo-thumb{width:44px;height:56px;border-radius:8px;object-fit:cover;background:var(--surface-2,rgba(10,15,13,.06));flex:0 0 auto}
.wo-prod .wo-pn{flex:1;min-width:0;font-size:14px}
.wo-prod .wo-pn small{display:block;color:var(--ink-3,#667);font-size:12px}
@media (max-width:640px){.wo-page .ws-kpis{display:grid;grid-template-columns:1fr 1fr}.wo-page .ws-kpis .kx-kpi{border:0;padding:14px}.wo-page .ws-kpis .kx-kpi .v{font-size:24px}}
.wo-prod .wo-pn small.wo-clash{color:#8A5A00;margin-top:2px;line-height:1.35}
.wo-prod .wo-txt{flex:0 0 auto;min-height:36px;padding:0 12px;font-size:13px}
.ws-piece{display:grid;gap:12px}
.ws-piece label{display:grid;gap:2px;font-size:13.5px;font-weight:600}
.ws-piece label small{font-weight:400;font-size:12px;color:var(--ink-3,#667)}
.ws-piece textarea,.ws-piece input{width:100%;min-height:44px;padding:10px 12px;border-radius:10px;border:1px solid var(--line,rgba(10,15,13,.18));background:#FDFCF9;font:inherit;font-size:14px;color:inherit}
.ws-piece textarea{min-height:132px;resize:vertical;line-height:1.5}
.ws-piece .ws-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ws-piece .ws-2>div{display:grid;gap:6px}
@media (max-width:520px){.ws-piece .ws-2{grid-template-columns:1fr}.wo-prod{flex-wrap:wrap}.wo-prod .wo-txt{order:3}}
.wo-switch{display:inline-flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;min-height:44px}
.wo-switch input{width:20px;height:20px;accent-color:var(--atlas,#0B6E4F)}
.wo-search{min-height:40px;padding:0 12px;border-radius:10px;border:1px solid var(--line,rgba(10,15,13,.16));font:inherit;min-width:220px;background:var(--paper,#F7F5F0)}
.wo-token{font-family:var(--mono-code,'JetBrains Mono',monospace);font-size:12px;word-break:break-all;padding:10px 12px;border-radius:10px;background:var(--surface-2,rgba(10,15,13,.05))}
`;
    document.head.appendChild(style);
  }

  async function load() {
    const m = slug();
    try {
      const r = await fetch('/api/shop/orders?merchant=' + encodeURIComponent(m) + '&status=all', { credentials: 'same-origin' });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || String(r.status));
      state.orders = Array.isArray(j.orders) ? j.orders : [];
      state.enabled = j.enabled !== false;
      state.error = '';
    } catch (e) {
      state.error = String(e && e.message || e);
    }
    state.loaded = true;
  }

  /* The storefront document (functions/api/shop/_settings.js). */
  async function loadSettings() {
    try {
      const r = await fetch('/api/store?feature=storefront&merchant=' + encodeURIComponent(slug()), { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const j = await r.json().catch(() => null);
      if (r.ok && j && j.ok !== false) { state.settings = j.data && typeof j.data === 'object' ? j.data : {}; state.rev = Number(j.rev) || 0; }
      else if (!state.settings) state.settings = {};
    } catch (_) { if (!state.settings) state.settings = {}; }
    resetDraft();
  }
  function resetDraft() {
    const s = JSON.parse(JSON.stringify(state.settings || {}));
    s.shipping = s.shipping || { feeMAD: 19, freeFromMAD: 500 };
    s.bundles = s.bundles || { 2: 0, 3: 0 };
    s.couponRows = Object.entries(s.coupons || {}).map(([code, pct]) => ({ code, pct }));
    state.draft = s;
    state.dirty = false;
  }
  function productsList() {
    const C = CAT();
    try { return C && C.listProducts ? (C.listProducts({ includeArchived: false }) || []) : []; } catch (_) { return []; }
  }
  function shopName() {
    try { return window.KiwiVenues?.current?.()?.name || ''; } catch (_) { return ''; }
  }
  function paintPreview() {
    const W = WS(), root = document.querySelector('[data-ws-form]');
    if (!W || !root) return;
    const tiles = [];
    const C = CAT();
    productsList().filter((p) => p.online !== false).some((p) => {
      const vs = C && C.listVariants ? (C.listVariants(p.id) || []) : [];
      const hex = (vs.find((v) => v && /^#[0-9a-f]{6}$/i.test(v.colorHex || '') && Number(v.stock) > 0) || {}).colorHex;
      if (hex && !tiles.includes(hex)) tiles.push(hex);
      return tiles.length >= 3;
    });
    W.preview(root.querySelector('[data-ws-preview]'), W.readForm(root, state.draft), shopName(), tiles);
  }
  function wireSettings() {
    const root = document.querySelector('[data-ws-form]');
    if (!root) return;
    const mark = () => {
      state.draft = Object.assign(state.draft || {}, WS().readForm(root, state.draft));
      state.dirty = true;
      const bar = root.querySelector('[data-ws-save]'); if (bar) bar.classList.add('on');
      paintPreview();
    };
    root.addEventListener('input', (e) => {
      if (e.target.matches('[data-ws-color]')) { const r = root.querySelector('input[name="ws-accent"][value="custom"]'); if (r) r.checked = true; }
      mark();
    });
    root.addEventListener('change', mark);
    if (state.dirty) { const bar = root.querySelector('[data-ws-save]'); if (bar) bar.classList.add('on'); }
    paintPreview();
  }

  function counts() {
    const c = { pending: 0, confirmed: 0, declined: 0, pendingCents: 0 };
    state.orders.forEach((o) => {
      if (o.status === 'pending' || o.status === 'confirming') { c.pending++; c.pendingCents += o.totalCents; }
      else if (o.status === 'confirmed') c.confirmed++;
      else if (o.status === 'declined') c.declined++;
    });
    return c;
  }

  function orderCard(o) {
    const c = o.customer || {};
    const lines = (o.lines || []).map((l) => `<div class="wo-line"><span>${esc(l.quantity)} × ${esc(l.title)}${l.size && l.size !== 'TU' ? ' · ' + esc(l.size) : ''}${l.color ? ' · ' + esc(l.color) : ''}</span><span>${esc(mad(l.unitCents * l.quantity))}</span></div>`).join('');
    const extra = [
      o.discountCents ? `<div class="wo-line"><span>${esc(L('Remise', 'Discount', 'خصم'))}</span><span>−${esc(mad(o.discountCents))}</span></div>` : '',
      o.deliveryCents ? `<div class="wo-line"><span>${esc(L('Livraison', 'Delivery', 'التوصيل'))}</span><span>${esc(mad(o.deliveryCents))}</span></div>` : '',
    ].join('');
    const open = o.status === 'pending';
    const why = o.status === 'declined' && o.reason ? `<div class="wo-meta">${esc(L('Motif', 'Reason', 'السبب'))} : ${esc(o.reason)}</div>` : '';
    return `<article class="wo-card" data-wo-id="${esc(o.id)}">
      <div class="wo-head"><span class="wo-num">${esc(o.number)}</span><span class="wo-pill ${esc(o.status)}">${esc((STATUS[o.status] || STATUS.pending)())}</span><span class="wo-meta">${esc(when(o.createdTs))}</span></div>
      <div class="wo-who"><b>${esc(c.name)}</b><span>${esc(c.phone)} · ${esc(c.city)}</span><span>${esc(c.address)}</span>${c.note ? `<span class="wo-meta">${esc(c.note)}</span>` : ''}</div>
      <div class="wo-lines">${lines}${extra}<div class="wo-tot"><span>${esc(L('À encaisser à la livraison', 'To collect on delivery', 'المبلغ عند التسليم'))}</span><span>${esc(mad(o.totalCents))}</span></div></div>
      ${why}
      ${open ? `<div class="wo-acts"><button class="kb ghost" data-action="wo-decline" data-arg="${esc(o.id)}">${esc(L('Refuser', 'Decline', 'رفض'))}</button><button data-activation=write class="kb atlas" data-action="wo-confirm" data-arg="${esc(o.id)}">${esc(L('Confirmer la livraison', 'Confirm delivery', 'تأكيد التوصيل'))}</button></div>` : ''}
    </article>`;
  }

  function ordersBody() {
    if (state.error) {
      return `<p class="wo-note">${esc(L('Les commandes n’ont pas pu être lues. Vérifiez la connexion puis actualisez.', 'Orders could not be read. Check the connection, then refresh.', 'تعذّر قراءة الطلبات. تحقّق من الاتصال ثم حدّث.'))}</p>`;
    }
    const pick = state.orders.filter((o) => state.filter === 'pending' ? (o.status === 'pending' || o.status === 'confirming') : o.status === state.filter);
    if (!pick.length) {
      const empty = state.filter === 'pending'
        ? L('Aucune commande à confirmer. Les nouvelles commandes de la boutique en ligne arrivent ici.', 'No orders to confirm. New orders from the online shop land here.', 'لا توجد طلبات للتأكيد. تصل هنا الطلبات الجديدة من المتجر الإلكتروني.')
        : L('Rien dans cette liste pour le moment.', 'Nothing in this list yet.', 'لا شيء في هذه القائمة بعد.');
      return `<div class="kx-empty"><p>${esc(empty)}</p></div>`;
    }
    return `<div class="wo-list">${pick.map(orderCard).join('')}</div>`;
  }

  /* A colour word in the name that the piece's own colour contradicts
     (« Jean White » stored as brown): the shop paints the piece in its
     stored colour, so the merchant should know. */
  const WORDS = [
    [/\b(blanc|blanche|white|ecru|écru|ivoire)\b/i, (h) => h.l > 0.78, L('blanc', 'white', 'أبيض')],
    [/\b(noir|noire|black)\b/i, (h) => h.l < 0.25, L('noir', 'black', 'أسود')],
    [/\b(bleu|bleue|blue|marine|navy)\b/i, (h) => h.s > 0.12 && h.h >= 180 && h.h <= 265, L('bleu', 'blue', 'أزرق')],
    [/\b(rouge|red)\b/i, (h) => h.s > 0.25 && (h.h <= 20 || h.h >= 335), L('rouge', 'red', 'أحمر')],
    [/\b(vert|verte|green|kaki|khaki)\b/i, (h) => h.h >= 60 && h.h <= 170, L('vert', 'green', 'أخضر')],
    [/\b(gris|grise|grey|gray)\b/i, (h) => h.s < 0.18, L('gris', 'grey', 'رمادي')],
  ];
  function hsl(hex) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d) h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    return { h: (h + 360) % 360, s, l };
  }
  function mainHex(p, C) {
    const vs = C && C.listVariants ? (C.listVariants(p.id) || []) : [];
    const v = vs.find((x) => x && /^#[0-9a-f]{6}$/i.test(x.colorHex || '') && Number(x.stock) > 0) || vs.find((x) => x && /^#[0-9a-f]{6}$/i.test(x.colorHex || ''));
    return v ? v.colorHex : '';
  }
  function colourClash(p, C) {
    const vs = C && C.listVariants ? (C.listVariants(p.id) || []) : [];
    const hexes = [...new Set(vs.map((v) => v && v.colorHex).filter((h) => /^#[0-9a-f]{6}$/i.test(h || '')))];
    if (hexes.length !== 1) return '';
    const word = WORDS.find(([re]) => re.test(String(p.name || '')));
    if (!word || word[1](hsl(hexes[0]))) return '';
    return L('Le nom dit « ' + word[2] + ' », la couleur enregistrée ne l’est pas : la boutique affichera la couleur enregistrée.',
      'The name says “' + word[2] + '” but the stored colour is not: the shop will show the stored colour.',
      'الاسم يقول «' + word[2] + '» لكن اللون المسجّل مختلف: سيعرض المتجر اللون المسجّل.');
  }

  function productsBody() {
    const C = CAT();
    if (!C || !C.listProducts) return `<p class="wo-note">${esc(L('Le catalogue de la boutique n’est pas encore chargé.', 'The shop catalogue is not loaded yet.', 'لم يتم تحميل كتالوج المتجر بعد.'))}</p>`;
    const q = state.query.trim().toLowerCase();
    const list = (C.listProducts({ includeArchived: false }) || []).filter((p) => !q || String(p.name || '').toLowerCase().includes(q));
    const on = list.filter((p) => p.online !== false).length;
    const texts = (state.settings && state.settings.pieces) || {};
    const rows = list.map((p) => {
      const t = texts[p.id];
      const clash = colourClash(p, C);
      return `<div class="wo-prod">
        ${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy">` : `<span class="wo-thumb" aria-hidden="true"${mainHex(p, C) ? ` style="background:${mainHex(p, C)}"` : ''}></span>`}
        <div class="wo-pn">${esc(p.name)}<small>${esc(mad(Math.round((Number(p.priceMAD) || 0) * 100)))}${p.photo ? '' : ' · ' + esc(L('sans photo', 'no photo', 'بدون صورة'))}${t ? '' : ' · ' + esc(L('sans texte', 'no text', 'بدون نص'))}</small>${clash ? `<small class="wo-clash">${esc(clash)}</small>` : ''}</div>
        <button type="button" class="kb ghost wo-txt" data-action="wo-piece" data-arg="${esc(p.id)}">${esc(t ? L('Modifier le texte', 'Edit text', 'تعديل النص') : L('Décrire', 'Describe', 'وصف'))}</button>
        <label class="wo-switch"><input type="checkbox" data-action="wo-online" data-arg="${esc(p.id)}" ${p.online !== false ? 'checked' : ''}><span>${esc(L('En ligne', 'Online', 'متاح'))}</span></label>
      </div>`;
    }).join('');
    return `<p class="wo-note">${esc(L('Décochez une pièce pour la retirer de la boutique en ligne. Elle reste en vente au comptoir. Une photo ajoutée à la fiche article apparaît aussi sur la boutique.', 'Untick a piece to take it off the online shop. It stays on sale at the counter. A photo added to the product sheet also shows on the shop.', 'ألغِ تحديد قطعة لإزالتها من المتجر الإلكتروني. تبقى معروضة للبيع في المحل. تظهر الصورة المضافة إلى بطاقة المنتج في المتجر أيضًا.'))}</p>
      <div class="wo-bar"><input class="wo-search" type="search" data-wo-search value="${esc(state.query)}" placeholder="${esc(L('Chercher une pièce', 'Search a piece', 'ابحث عن قطعة'))}" aria-label="${esc(L('Chercher une pièce', 'Search a piece', 'ابحث عن قطعة'))}"><span class="wo-meta">${esc(on)} / ${esc(list.length)} ${esc(L('en ligne', 'online', 'متاحة'))}</span></div>
      <div>${rows || `<div class="kx-empty"><p>${esc(L('Aucune pièce ne correspond.', 'No piece matches.', 'لا توجد قطعة مطابقة.'))}</p></div>`}</div>
      <div class="wo-card"><b>${esc(L('Relier la boutique en ligne', 'Connect the online shop', 'ربط المتجر الإلكتروني'))}</b>
        <p class="wo-note">${esc(L('La boutique en ligne a besoin d’une clé pour déposer ses commandes ici. Créez-la une fois et transmettez-la à l’équipe Kiwi.', 'The online shop needs a key to send its orders here. Create it once and pass it to the Kiwi team.', 'يحتاج المتجر الإلكتروني إلى مفتاح لإرسال طلباته هنا. أنشئه مرة واحدة وسلّمه لفريق Kiwi.'))}</p>
        ${state.token ? `<div class="wo-token" data-wo-token>${esc(state.token)}</div><p class="wo-meta">${esc(L('Cette clé ne sera plus affichée. Copiez-la maintenant.', 'This key will not be shown again. Copy it now.', 'لن يظهر هذا المفتاح مرة أخرى. انسخه الآن.'))}</p>`
          : `<div class="wo-acts" style="justify-content:flex-start"><button class="kb ghost" data-action="wo-connect">${esc(L('Créer la clé', 'Create the key', 'إنشاء المفتاح'))}</button></div>`}
      </div>`;
  }

  function render() {
    css();
    const c = counts();
    const seg = (key, label, n) => `<button type="button" data-lens-item class="${state.filter === key ? 'on' : ''}" data-action="wo-filter" data-arg="${key}" aria-pressed="${state.filter === key}">${esc(label)}${n != null ? ' (' + esc(n) + ')' : ''}</button>`;
    const tab = (key, label) => `<button type="button" data-lens-item class="${state.tab === key ? 'on' : ''}" data-action="wo-tab" data-arg="${key}" aria-pressed="${state.tab === key}">${esc(label)}</button>`;
    const off = state.loaded && !state.enabled
      ? `<p class="wo-note">${esc(L('La boutique en ligne n’est pas activée pour ce magasin. Elle n’accepte aucune commande tant que Kiwi ne l’a pas activée.', 'The online shop is not switched on for this store. It accepts no orders until Kiwi switches it on.', 'المتجر الإلكتروني غير مفعّل لهذا المحل. لا يقبل أي طلب حتى تقوم Kiwi بتفعيله.'))}</p>` : '';
    const W = WS();
    if (W) W.css();
    let main = '';
    if (state.tab === 'overview') {
      const list = productsList(), C = CAT(), texts = (state.settings && state.settings.pieces) || {};
      const live = list.filter((p) => p.online !== false);
      main = W ? W.overview({ orders: state.orders, enabled: state.enabled, settings: state.settings || {}, products: list,
        withText: live.filter((p) => texts[p.id]).length, clashes: live.filter((p) => colourClash(p, C)).length }) : '';
    } else if (state.tab === 'settings') {
      main = W && state.draft ? W.settings({ draft: state.draft, shopName: shopName() }) : `<p class="wo-note">${esc(L('Chargement des réglages…', 'Loading settings…', 'جارٍ تحميل الإعدادات…'))}</p>`;
    } else if (state.tab === 'orders') {
      main = `<div class="wo-bar"><div class="wo-seg" data-lens-demo>${seg('pending', L('À confirmer', 'To confirm', 'بانتظار التأكيد'), c.pending)}${seg('confirmed', L('Confirmées', 'Confirmed', 'مؤكَّدة'), c.confirmed)}${seg('declined', L('Refusées', 'Declined', 'مرفوضة'), c.declined)}</div><button class="kb ghost" data-action="wo-refresh">${esc(L('Actualiser', 'Refresh', 'تحديث'))}</button></div>${ordersBody()}`;
    } else {
      main = productsBody();
    }
    window.Kiwi.appPage('weborders', {
      title: L('Boutique en ligne', 'Online shop', 'المتجر الإلكتروني'),
      subtitle: L('Commandes à livrer, paiement à la livraison', 'Orders to deliver, cash on delivery', 'طلبات للتوصيل، الدفع عند الاستلام'),
      body: `<div class="wo-page" data-wo-page>
        ${off}
        <div class="wo-bar"><div class="wo-seg" data-lens-demo role="group" aria-label="${esc(L('Sections de la boutique en ligne', 'Online shop sections', 'أقسام المتجر الإلكتروني'))}">${tab('overview', L('Aperçu', 'Overview', 'نظرة عامة'))}${tab('orders', L('Commandes', 'Orders', 'الطلبات') + (c.pending ? ' (' + c.pending + ')' : ''))}${tab('products', L('Articles', 'Pieces', 'القطع'))}${tab('settings', L('Réglages', 'Settings', 'الإعدادات'))}</div></div>
        ${main}
      </div>`,
    });
    if (state.tab === 'overview' && W) W.fitFrames(document.querySelector('[data-wo-page]'));
    if (state.tab === 'settings') wireSettings();
    const search = document.querySelector('[data-wo-search]');
    if (search) search.addEventListener('input', () => {
      state.query = search.value;
      const at = search.selectionStart;
      render();
      const again = document.querySelector('[data-wo-search]');
      if (again) { again.focus(); try { again.setSelectionRange(at, at); } catch (_) {} }
    });
    state.sig = JSON.stringify(state.orders.map((o) => [o.id, o.status]));
  }

  /* Re-read every 30 s while the page is on screen. The page is only redrawn
     when an order changed, never under an open dialog, never while typing. */
  function startPoll() {
    clearInterval(poll);
    poll = setInterval(async () => {
      if (!document.querySelector('[data-wo-page]')) { clearInterval(poll); return; }
      if (document.hidden || document.querySelector('.kiwi-backdrop') || (state.tab !== 'orders' && state.tab !== 'overview')) return;
      const before = state.sig;
      await load();
      if (JSON.stringify(state.orders.map((o) => [o.id, o.status])) !== before) render();
    }, 30000);
  }

  async function decide(id, action, extra) {
    const r = await fetch('/api/shop/decide', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ merchant: slug(), id, action }, extra || {})),
    });
    const j = await r.json().catch(() => null);
    return { status: r.status, j: j || {} };
  }

  handlers['nav-weborders'] = async () => {
    state.loaded = false;
    render();
    await Promise.all([load(), loadSettings()]);
    render();
    startPoll();
  };
  handlers['wo-tab'] = (el, arg) => {
    const k = typeof el === 'string' ? el : arg;
    if (state.tab === 'settings' && k !== 'settings' && state.dirty
      && !window.confirm(L('Quitter sans enregistrer les réglages ?', 'Leave without saving the settings?', 'المغادرة دون حفظ الإعدادات؟'))) return;
    if (state.tab === 'settings' && k !== 'settings') resetDraft();
    state.tab = TABS.includes(k) ? k : 'overview';
    render();
  };
  handlers['wo-filter'] = (el, arg) => { const k = typeof el === 'string' ? el : arg; state.filter = ['pending', 'confirmed', 'declined'].includes(k) ? k : 'pending'; render(); };
  handlers['wo-refresh'] = async () => { await load(); render(); };

  handlers['wo-confirm'] = async (el, arg) => {
    const id = typeof el === 'string' ? el : arg;
    const btn = el && el.closest ? el : null;
    if (btn) btn.disabled = true;
    let out = await decide(id, 'confirm');
    if (out.status === 409 && out.j.error === 'short') {
      const list = (out.j.short || []).map((s) => `<li>${esc(s.title)}${s.size ? ' · ' + esc(s.size) : ''} : ${esc(s.inStock)} ${esc(L('en stock', 'in stock', 'في المخزون'))}, ${esc(s.wanted)} ${esc(L('demandé(s)', 'ordered', 'مطلوب'))}</li>`).join('');
      const go = await new Promise((resolve) => {
        const m = modal({
          title: L('Stock insuffisant', 'Not enough stock', 'المخزون غير كافٍ'),
          body: `<p class="wo-note">${esc(L('Kiwi ne compte pas assez de pièces pour cette commande :', 'Kiwi does not count enough pieces for this order:', 'لا يحسب Kiwi قطعًا كافية لهذا الطلب:'))}</p><ul>${list}</ul><p class="wo-note">${esc(L('Confirmez seulement si vous avez bien la pièce en boutique.', 'Confirm only if you really have the piece in the shop.', 'أكّد فقط إذا كانت القطعة متوفرة فعلًا في المحل.'))}</p>`,
          foot: `<button class="kb ghost" data-dismiss>${esc(L('Annuler', 'Cancel', 'إلغاء'))}</button><button class="kb atlas" data-wo-force>${esc(L('Confirmer quand même', 'Confirm anyway', 'تأكيد على أي حال'))}</button>`,
        });
        if (!m || !m.el) { resolve(false); return; }
        m.el.addEventListener('click', (e) => {
          if (e.target.closest('[data-wo-force]')) { resolve(true); try { m.close(); } catch (_) {} }
          else if (e.target === m.el || e.target.closest('[data-dismiss], .kiwi-modal-close')) resolve(false);
        });
        const onKey = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); resolve(false); } };
        document.addEventListener('keydown', onKey);
      });
      if (!go) { if (btn) btn.disabled = false; return; }
      out = await decide(id, 'confirm', { force: true });
    }
    if (out.status === 200 && out.j.ok) {
      toast(L('Commande confirmée', 'Order confirmed', 'تم تأكيد الطلب'), { type: 'success', desc: L('Elle est maintenant dans Livraisons.', 'It is now in Deliveries.', 'أصبح الآن ضمن التوصيلات.') });
    } else if (out.status === 409) {
      toast(L('Cette commande a déjà été traitée', 'This order was already handled', 'تمت معالجة هذا الطلب من قبل'), { type: 'error' });
    } else {
      toast(L('Confirmation impossible', 'Could not confirm', 'تعذّر التأكيد'), { type: 'error', desc: L('Rien n’a été enregistré. Réessayez dans un instant.', 'Nothing was recorded. Try again in a moment.', 'لم يُسجَّل شيء. أعد المحاولة بعد قليل.') });
    }
    await load(); render();
  };

  handlers['wo-decline'] = (el, arg) => {
    const id = typeof el === 'string' ? el : arg;
    const m = modal({
      title: L('Refuser la commande', 'Decline the order', 'رفض الطلب'),
      body: `<label class="wo-note" for="wo-reason">${esc(L('Motif (facultatif), gardé dans l’historique', 'Reason (optional), kept in the history', 'السبب (اختياري)، يُحفظ في السجل'))}</label><input id="wo-reason" class="wo-search" style="width:100%;margin-top:8px" maxlength="200" data-wo-reason>`,
      foot: `<button class="kb ghost" data-dismiss>${esc(L('Annuler', 'Cancel', 'إلغاء'))}</button><button class="kb atlas" data-wo-decline-go>${esc(L('Refuser', 'Decline', 'رفض'))}</button>`,
    });
    const go = m && m.el && m.el.querySelector('[data-wo-decline-go]');
    if (!go) return;
    go.addEventListener('click', async () => {
      go.disabled = true;
      const reason = (m.el.querySelector('[data-wo-reason]') || {}).value || '';
      const out = await decide(id, 'decline', { reason });
      try { m.close(); } catch (_) {}
      if (out.status === 200 && out.j.ok) toast(L('Commande refusée', 'Order declined', 'تم رفض الطلب'), { type: 'success' });
      else toast(L('Cette commande a déjà été traitée', 'This order was already handled', 'تمت معالجة هذا الطلب من قبل'), { type: 'error' });
      await load(); render();
    });
  };

  handlers['wo-online'] = (el, arg) => {
    const id = typeof el === 'string' ? el : arg;
    const C = CAT();
    if (!C || !C.updateProduct || !C.listProducts) return;
    /* The click router cancels the native toggle (preventDefault), so the
       new value comes from the catalogue, not from the checkbox. */
    const p = (C.listProducts({ includeArchived: false }) || []).find((x) => x.id === id);
    if (!p) return;
    const next = p.online === false;
    C.updateProduct(id, { online: next });
    toast(next ? L('Pièce en ligne', 'Piece online', 'القطعة معروضة') : L('Pièce retirée de la boutique en ligne', 'Piece taken off the online shop', 'أُزيلت القطعة من المتجر الإلكتروني'), { type: 'success' });
    render();
  };

  handlers['wo-connect'] = async () => {
    try {
      const r = await fetch('/api/channel/keys', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant: slug(), channel: 'storefront', label: L('Boutique en ligne', 'Online shop', 'المتجر الإلكتروني') }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.token) throw new Error((j && j.error) || String(r.status));
      state.token = j.token;
      render();
    } catch (e) {
      toast(L('Clé non créée', 'Key not created', 'لم يُنشأ المفتاح'), { type: 'error', desc: /^too-many-keys$/.test(String(e && e.message)) ? L('Ce magasin a déjà trop de clés. Supprimez-en une dans Intégrations.', 'This store already has too many keys. Remove one in Integrations.', 'لدى هذا المحل مفاتيح كثيرة. احذف واحدًا من التكاملات.') : L('Réessayez dans un instant.', 'Try again in a moment.', 'أعد المحاولة بعد قليل.') });
    }
  };

  /* ── Aperçu: share the shop ── */
  const shopUrl = () => (state.settings && state.settings.url) || '';
  handlers['wo-copy-link'] = async () => {
    const url = shopUrl(); if (!url) return;
    try { await navigator.clipboard.writeText(url); toast(L('Lien copié', 'Link copied', 'تم نسخ الرابط'), { type: 'success' }); }
    catch (_) { toast(url); }
  };
  handlers['wo-share-wa'] = () => {
    const url = shopUrl(); if (!url) return;
    const text = L('Découvrez notre boutique en ligne, paiement à la livraison : ', 'Discover our online shop, cash on delivery: ', 'اكتشفوا متجرنا الإلكتروني، الدفع عند الاستلام: ') + url;
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  };
  handlers['wo-qr-download'] = () => {
    const url = shopUrl();
    if (!url || !window.KiwiQR) return;
    const svg = window.KiwiQR.svg(url, { size: 1024, margin: 4, ecl: 'Q' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    a.download = 'qr-boutique-' + (slug() || 'kiwi') + '.svg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  /* One writer for the storefront document: the settings form and the piece
     texts both send the whole document with the revision they read. */
  async function postDoc(data) {
    let r = null, j = null;
    try {
      r = await fetch('/api/store', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ feature: 'storefront', merchant: slug(), data, baseRev: state.rev }) });
      j = await r.json().catch(() => null);
    } catch (_) { r = null; }
    const ok = !!(r && r.ok && j && j.ok !== false);
    const keepDraft = state.tab === 'settings' && state.dirty ? state.draft : null;
    if (ok) { state.rev = Number(j.rev) || state.rev + 1; await loadSettings(); if (keepDraft) { state.draft = keepDraft; state.dirty = true; } }
    return { ok, status: r ? r.status : 0, error: j && j.error };
  }
  async function saveError(out) {
    if (out.status === 409 && out.error === 'stale') {
      toast(L('Réglages modifiés ailleurs', 'Settings changed elsewhere', 'تم تعديل الإعدادات من مكان آخر'), { type: 'error', desc: L('Rechargés : refaites votre modification.', 'Reloaded: make your change again.', 'أُعيد التحميل: أعد تعديلك.') });
      await loadSettings(); render(); return;
    }
    if (out.status === 403) { toast(L('Seul le propriétaire peut modifier ces réglages', 'Only the owner can change these settings', 'يمكن للمالك فقط تعديل هذه الإعدادات'), { type: 'error' }); return; }
    toast(L('Réglages non enregistrés', 'Settings not saved', 'لم تُحفظ الإعدادات'), { type: 'error', desc: L('Réessayez dans un instant.', 'Try again in a moment.', 'أعد المحاولة بعد قليل.') });
  }

  /* ── Réglages ── */
  const formRoot = () => document.querySelector('[data-ws-form]');
  const syncDraft = () => { const root = formRoot(); if (root && WS()) state.draft = Object.assign(state.draft || {}, WS().readForm(root, state.draft)); };
  handlers['wo-coupon-add'] = () => {
    syncDraft();
    const rows = state.draft.couponRows || (state.draft.couponRows = []);
    if (rows.length < 20) rows.push({ code: '', pct: 10 });
    state.dirty = true;
    render();
    const last = document.querySelectorAll('[data-ws-code]');
    if (last.length) last[last.length - 1].focus();
  };
  handlers['wo-coupon-del'] = (el, arg) => {
    syncDraft();
    const i = Number(typeof el === 'string' ? el : arg);
    (state.draft.couponRows || []).splice(i, 1);
    state.dirty = true;
    render();
  };
  handlers['wo-settings-reset'] = () => { resetDraft(); render(); };
  handlers['wo-settings-save'] = async (el) => {
    if (state.saving) return;
    syncDraft();
    const d = state.draft || {};
    const bad = (d.couponRows || []).filter((r) => r.code || r.pct).find((r) => !/^[A-Z0-9]{3,20}$/.test(r.code) || !(Number(r.pct) >= 1 && Number(r.pct) <= 90));
    if (bad) { toast(L('Code promo à corriger', 'Promo code to fix', 'رمز خصم يحتاج تصحيحًا'), { type: 'error', desc: L('3 à 20 lettres ou chiffres, remise de 1 à 90 %.', '3 to 20 letters or digits, discount from 1 to 90 %.', 'من 3 إلى 20 حرفًا أو رقمًا، وخصم من 1 إلى 90 %.') }); return; }
    const coupons = {};
    (d.couponRows || []).forEach((r) => { if (r.code) coupons[r.code] = Math.round(Number(r.pct)); });
    const data = {
      name: d.name || '', url: d.url || '', tagline: d.tagline || '', announcement: d.announcement || '',
      whatsapp: d.whatsapp || '', instagram: d.instagram || '', accent: d.accent || '',
      shipping: d.shipping || { feeMAD: 0, freeFromMAD: null }, bundles: d.bundles || { 2: 0, 3: 0 }, coupons,
      pieces: (state.settings && state.settings.pieces) || {},
    };
    state.saving = true;
    const btn = el && el.closest ? el : null;
    if (btn) btn.disabled = true;
    state.dirty = false;
    const out = await postDoc(data);
    state.saving = false;
    if (btn) btn.disabled = false;
    if (out.ok) {
      resetDraft();
      toast(L('Réglages enregistrés', 'Settings saved', 'تم حفظ الإعدادات'), { type: 'success', desc: L('La boutique les affiche d’ici une minute.', 'The shop shows them within a minute.', 'يعرضها المتجر خلال دقيقة.') });
      render();
      return;
    }
    state.dirty = true;
    saveError(out);
  };

  /* ── Articles: what the shop says about one piece ── */
  handlers['wo-piece'] = (el, arg) => {
    const id = typeof el === 'string' ? el : arg;
    const C = CAT();
    const p = C && C.listProducts ? (C.listProducts({ includeArchived: false }) || []).find((x) => x.id === id) : null;
    if (!p) return;
    const t = ((state.settings && state.settings.pieces) || {})[id] || {};
    const m = modal({
      title: esc(p.name),
      body: `<div class="ws-piece">
        <label for="wp-about">${esc(L('Texte de la pièce', 'About this piece', 'نص القطعة'))}<small>${esc(L('ce que le client lit sous le prix : la tenue, le tissu, comment elle taille, l’entretien', 'what the customer reads under the price: how it wears, the fabric, how it fits, care', 'ما يقرؤه الزبون تحت السعر: القماش والمقاس والعناية'))}</small></label>
        <textarea id="wp-about" rows="6" maxlength="600" data-wp="about">${esc(t.about || '')}</textarea>
        <div class="ws-2"><div><label for="wp-fabric">${esc(L('Matière', 'Fabric', 'الخامة'))}</label><input id="wp-fabric" maxlength="60" data-wp="fabric" value="${esc(t.fabric || '')}" placeholder="${esc(L('Coton, lin, laine…', 'Cotton, linen, wool…', 'قطن، كتان، صوف…'))}"></div>
        <div><label for="wp-fit">${esc(L('Coupe', 'Fit', 'القَصّة'))}</label><input id="wp-fit" maxlength="60" data-wp="fit" value="${esc(t.fit || '')}" placeholder="${esc(L('Droite, ample, ajustée…', 'Straight, loose, slim…', 'مستقيمة، واسعة، ضيقة…'))}"></div></div>
      </div>`,
      foot: `<button class="kb ghost" data-dismiss>${esc(L('Annuler', 'Cancel', 'إلغاء'))}</button><button class="kb atlas" data-wp-save data-activation="write">${esc(L('Enregistrer', 'Save', 'حفظ'))}</button>`,
    });
    const go = m && m.el && m.el.querySelector('[data-wp-save]');
    if (!go) return;
    go.addEventListener('click', async () => {
      go.disabled = true;
      const val = (k) => ((m.el.querySelector('[data-wp="' + k + '"]') || {}).value || '').trim();
      const pieces = Object.assign({}, (state.settings && state.settings.pieces) || {});
      const entry = { about: val('about'), fabric: val('fabric'), fit: val('fit') };
      if (entry.about || entry.fabric || entry.fit) pieces[id] = entry; else delete pieces[id];
      const out = await postDoc(Object.assign({}, state.settings || {}, { pieces }));
      go.disabled = false;
      if (out.ok) {
        try { m.close(); } catch (_) {}
        toast(L('Texte enregistré', 'Text saved', 'تم حفظ النص'), { type: 'success', desc: L('La fiche de la boutique le montre d’ici une minute.', 'The shop page shows it within a minute.', 'تعرضه صفحة المتجر خلال دقيقة.') });
        render();
      } else saveError(out);
    });
  };
})();
