/* ═══ Section 2 boutique B · promos / returns ═══ */
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Boutique vertical — sidebar handlers (set B)
 * ─────────────────────────────────────────────────────────────────────────── *
 *
 * Two production-grade sidebar handlers wired to the merchant dashboard click
 * delegation router (`Kiwi.handlers[name]`). Designed for the Maison Mansour
 * Gueliz boutique persona.
 *
 *   · `nav-promos`   · Promotions & offres (drawer width 1040)
 *   · `nav-returns`  · Retours & échanges  (drawer width  980)
 *
 * Plus a handful of auxiliary action handlers wired through `data-action`:
 *   · `promo-pause`           · `promo-end`         · `promo-edit`
 *   · `promo-segment`         · `promo-schedule`    · `promo-archive-detail`
 *   · `ret-detail`            · `ret-approve`       · `ret-refuse`
 *   · `ret-exchange`          · `ret-block`         · `ret-policy-save`
 *   · `ret-refund-original`   · `ret-refund-credit` · `ret-refund-whatsapp`
 *
 * Paired CSS lives in `/tmp/kiwi-s2-boutique-spa-css.css` (`.b-promo-*`,
 * `.b-ret-*`, `.kx-toggle`, `.p-grid-*`).
 *
 * Conventions
 *  · Brand only: var(--atlas) / --riad / --mint / --paper-soft.
 *  · French numbers ("1 245,50 MAD"), JetBrains Mono for tabular numerals.
 *  · No emojis in titles or CTAs (per CLAUDE.md §3).
 *  · No new accents — semantic states reuse --success / --warning / --danger.
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  if (!window.Kiwi) return;
  const { toast, modal, drawer, handlers } = window.Kiwi;
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  /* fr / en / ar pick for the returns page (the language helper of the inventory IIFE is not in reach here). */
  const _rL = (fr, en, ar) => { const l = window.KiwiI18n?.getLang?.(); return l === 'en' ? en : l === 'ar' ? ar : fr; };

  /* ═══════════════════ Inline SVG icon set ═══════════════════ */
  /* Material Symbols (Outlined, 400) recopiées depuis assets/icons/material/.
   * Forme native : viewBox 0 -960 960 960, tracé plein piloté par `color`. */
  const msym = (d, px) =>
    `<svg width="${px}" height="${px}" viewBox="0 -960 960 960" fill="currentColor"><path d="${d}"/></svg>`;
  /* redeem.svg */
  const D_REDEEM = 'M160-280v80h640v-80H160Zm0-440h88q-5-9-6.5-19t-1.5-21q0-50 35-85t85-35q30 0 55.5 15.5T460-826l20 26 20-26q18-24 44-39t56-15q50 0 85 35t35 85q0 11-1.5 21t-6.5 19h88q33 0 56.5 23.5T880-640v440q0 33-23.5 56.5T800-120H160q-33 0-56.5-23.5T80-200v-440q0-33 23.5-56.5T160-720Zm0 320h640v-240H596l84 114-64 46-136-184-136 184-64-46 82-114H160v240Zm228.5-331.5Q400-743 400-760t-11.5-28.5Q377-800 360-800t-28.5 11.5Q320-777 320-760t11.5 28.5Q343-720 360-720t28.5-11.5ZM600-720q17 0 28.5-11.5T640-760q0-17-11.5-28.5T600-800q-17 0-28.5 11.5T560-760q0 17 11.5 28.5T600-720Z';

  const SVG = {
    discount: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
    /* Les trois canaux de remboursement se disaient avec deux dessins pour trois
     * sens : le « $ » servait à la fois la carte et les espèces, et les chevrons
     * de code servaient le bon d'achat. Un canal, une icône — Material Symbols,
     * recopiées depuis assets/icons/material/ (nom du fichier en commentaire). */
    voucher:  msym(D_REDEEM, 18),
    voucherSm: msym(D_REDEEM, 13),  /* pied de modale : la rangée est en 13 */
    /* search.svg, download.svg */
    search:   msym('M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z', 16),
    download: msym('M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z', 15),
    bundle:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    tax:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    bell:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
    plus:     '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    pause:    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
    edit:     '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    stop:     '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
    chev:     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>',
    box:      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>',
    block:    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
    check:    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x:        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    swap:     '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>',
    /* Seul usage : la tuile « Notifier WhatsApp », à côté de card et voucher en 18.
     * Marque tierce — elle reste au trait, elle ne peut pas venir de Material. */
    wa:       '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>',
    card:     '<svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor"><path d="M880-720v480q0 33-23.5 56.5T800-160H160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720Zm-720 80h640v-80H160v80Zm0 160v240h640v-240H160Zm0 240v-480 480Z"/></svg>',  /* credit_card.svg */
    cash:     '<svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor"><path d="M560-440q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35ZM280-320q-33 0-56.5-23.5T200-400v-320q0-33 23.5-56.5T280-800h560q33 0 56.5 23.5T920-720v320q0 33-23.5 56.5T840-320H280Zm80-80h400q0-33 23.5-56.5T840-480v-160q-33 0-56.5-23.5T760-720H360q0 33-23.5 56.5T280-640v160q33 0 56.5 23.5T360-400Zm440 240H120q-33 0-56.5-23.5T40-240v-440h80v440h680v80ZM280-400v-320 320Z"/></svg>',  /* payments.svg */
    flag:     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
    cal:      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  };

  /* ═══════════════════ Number formatters ═══════════════════ */
  const fmtMAD = (n, dec = 2) => (window.KiwiNumber?.format(n, { minimumFractionDigits: dec, maximumFractionDigits: dec }) ?? n.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
  const fmtInt = (n) => (window.KiwiNumber?.format(n, {}) ?? n.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}));

  /* ═══════════════════ NAV-PROMOS ═══════════════════════════════════════════
   * Promotions & offres pour Maison Mansour Gueliz.
   * Width 1040 — wide-format drawer with active campaigns table, segment chips,
   * KPI summary, schedule wizard CTA and past campaigns archive.
   * ─────────────────────────────────────────────────────────────────────────── */
  handlers['nav-promos'] = () => {
    const active = [
      { id: 'P-2811', name: 'Soldes d\'été −30 %',           type: 'discount', kind: '−30 %',     value: '−30 %',         redem: 312, uplift: '+18,4 %', aov: '+9 %',  expiry: '12 j',   live: true },
      { id: 'P-2812', name: 'Code MAROC10',                  type: 'code',     kind: 'Code',       value: '−10 %',         redem:  87, uplift: '+11,2 %', aov: '+4 %',  expiry: '21 j',   live: true },
      { id: 'P-2813', name: 'Lot 3-pour-2 babouches',        type: 'bundle',   kind: 'Lot',        value: '3 pour 2',      redem:  46, uplift: '+22,8 %', aov: '+31 %', expiry: '6 j',    live: true },
      { id: 'P-2814', name: 'Tax-free Touristes UE',         type: 'tax',      kind: 'Segment',    value: 'TVA −20 %',     redem: 184, uplift: '+34,1 %', aov: '+24 %', expiry: 'Permanent', live: true },
      { id: 'P-2815', name: 'Black Friday avant-première',   type: 'discount', kind: '−25 %',     value: '−25 %',         redem:   0, uplift: '·', aov: '·',     expiry: 'J−18',   scheduled: true },
    ];

    const segments = [
      { id: 'all',     n: 'Tous',                count: '4 102', on: true  },
      { id: 'eu',      n: 'Touristes UE',        count: '892',   on: true  },
      { id: 'us',      n: 'Touristes US',        count: '316',   on: false },
      { id: 'dia',     n: 'Diaspora FR / ES',     count: '244',   on: false },
      { id: 'loyal',   n: 'Clients fidèles',     count: '198',   on: true  },
      { id: 'never',   n: 'Jamais venus',        count: '2 452', on: false },
    ];

    const archive = [
      { name: 'Aïd Adha −20 %',           period: 'Juin 2025',     redem: 421, uplift: '+27,6 %', revenue: '184 320 MAD', verdict: 'Réussite' },
      { name: 'Tax-free Tourists 2025',   period: 'Été 2025',      redem: 612, uplift: '+38,9 %', revenue: '298 470 MAD', verdict: 'Excellent' },
      { name: 'Pre-Ramadan Special',      period: 'Mars 2025',     redem: 188, uplift: '+8,4 %',  revenue: ' 62 940 MAD', verdict: 'Tiède' },
      { name: 'Code DIASPORA12',          period: 'Déc 2024',      redem: 109, uplift: '+14,2 %', revenue: ' 48 105 MAD', verdict: 'Réussite' },
    ];

    const totalRedem = active.reduce((a, c) => a + c.redem, 0);
    const totalUplift = 47820;

    window.Kiwi.appPage('promos', {
      title: 'Promotions',
      subtitle: 'Maison Mansour · Gueliz · 4 campagnes en direct · 1 planifiée',
      body: `
        <div class="p-hero" style="background: linear-gradient(135deg, var(--brand-deep), var(--atlas));">
          <div class="l">UPLIFT REVENUE · CAMPAGNES ACTIVES</div>
          <div class="big">+${fmtInt(totalUplift)} <span style="font-size:18px; opacity:0.7;">MAD</span></div>
          <div class="sub">${fmtInt(totalRedem)} échanges aujourd'hui · ${active.filter(a => a.live).length} promos en cours · Tax-free Touristes UE = top performer</div>
        </div>

        <div class="p-grid-3" style="margin-bottom: 18px;">
          <div class="p-card" style="margin-bottom: 0;">
            <div style="font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase;">UPLIFT TOTAL</div>
            <div style="font-size: 26px; font-weight: 600; font-family: var(--mono); font-feature-settings: 'tnum' 1; margin-top: 4px; letter-spacing: -0.02em;">+${fmtInt(totalUplift)} <span style="font-size: 13px; color: var(--n-500); font-weight: 500;">MAD</span></div>
            <div style="font-size: 12px; color: var(--n-500); margin-top: 4px;">vs panier sans promo · 30 j glissants</div>
          </div>
          <div class="p-card" style="margin-bottom: 0;">
            <div style="font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase;">ÉCHANGES AUJOURD'HUI</div>
            <div style="font-size: 26px; font-weight: 600; font-family: var(--mono); font-feature-settings: 'tnum' 1; margin-top: 4px; letter-spacing: -0.02em;">${fmtInt(totalRedem)}</div>
            <div style="font-size: 12px; color: var(--n-500); margin-top: 4px;">+${fmtInt(48)} vs hier · 14,8 % du trafic</div>
          </div>
          <div class="p-card" style="margin-bottom: 0;">
            <div style="font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase;">MEILLEURE CAMPAGNE</div>
            <div style="font-size: 17px; font-weight: 600; margin-top: 4px; letter-spacing: -0.015em;">Tax-free Touristes UE</div>
            <div style="font-size: 12px; color: var(--atlas); margin-top: 4px; font-weight: 500;">+34,1 % uplift · 184 redem.</div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 12px; flex-wrap: wrap;">
          <div>
            <div style="font-size: 11px; color: var(--n-500); letter-spacing: 0.1em; font-family: var(--mono); text-transform: uppercase;">CAMPAGNES ACTIVES</div>
            <div style="font-size: 12px; color: var(--n-500); margin-top: 4px;">Cliquez une ligne pour modifier · les chiffres se mettent à jour toutes les 60 s.</div>
          </div>
          <button class="kb atlas" data-action="promo-schedule">${SVG.plus}<span>Planifier une promo</span></button>
        </div>

        <table class="p-table" style="margin-bottom: 22px;">
          <thead>
            <tr>
              <th>NOM</th>
              <th>TYPE</th>
              <th class="right">VALEUR</th>
              <th class="right">REDEMPTIONS</th>
              <th class="right">UPLIFT</th>
              <th class="right">AOV</th>
              <th>EXPIRE</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${active.map(p => `
              <tr data-action="promo-edit" data-arg="${p.id}">
                <td>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="width: 28px; height: 28px; border-radius: 8px; background: ${p.scheduled ? 'rgba(217,154,43,0.16)' : 'var(--mint-soft)'}; color: ${p.scheduled ? '#8A6210' : 'var(--atlas)'}; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">${SVG[p.type]}</span>
                    <b style="font-weight: 600;">${p.name}</b>
                  </div>
                </td>
                <td><span class="chip ${p.scheduled ? 'pend' : 'ok'}" style="font-family: var(--mono); font-size: 11px; letter-spacing: 0.04em;">${p.kind.toUpperCase()}</span></td>
                <td class="mono right">${p.value}</td>
                <td class="mono right">${p.redem === 0 ? '·' : fmtInt(p.redem)}</td>
                <td class="mono right" style="color: ${p.uplift.startsWith('+') ? 'var(--atlas)' : 'var(--n-500)'}; font-weight: 600;">${p.uplift}</td>
                <td class="mono right" style="color: var(--n-500);">${p.aov}</td>
                <td><span class="chip ${p.expiry === 'Permanent' ? 'neutral' : p.scheduled ? 'pend' : 'ok'}" style="font-family: var(--mono); font-size: 11px;">${p.expiry}</span></td>
                <td style="text-align: right;">
                  <button class="kb ghost" style="padding: 5px 10px; font-size: 11.5px;" data-action="${p.scheduled ? 'promo-edit' : 'promo-pause'}" data-arg="${p.id}" data-bubble="stop">
                    ${p.scheduled ? SVG.edit : SVG.pause}
                    ${p.scheduled ? 'Modifier' : 'Pauser'}
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="p-card" style="margin-bottom: 18px;">
          <div class="head">
            <h4>Cibler par segment client</h4>
            <span class="meta">${segments.filter(s => s.on).length} / ${segments.length} ACTIFS</span>
          </div>
          <div style="font-size: 12.5px; color: var(--n-500); margin: 0 0 12px; line-height: 1.45;">Les promos s'affichent uniquement aux segments cochés. Cliquez pour activer ou désactiver.</div>
          <div class="b-promo-segments">
            ${segments.map(s => `
              <button class="b-promo-seg ${s.on ? 'on' : ''}" data-action="promo-segment" data-arg="${s.id}">
                ${s.on ? SVG.check : ''}
                <span>${s.n}</span>
                <span style="opacity: 0.6; font-family: var(--mono); font-size: 11px;">${s.count}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div style="font-size: 11px; color: var(--n-500); letter-spacing: 0.1em; font-family: var(--mono); text-transform: uppercase; margin-bottom: 10px;">ARCHIVE · 12 DERNIERS MOIS</div>
        <table class="p-table" style="margin-bottom: 6px;">
          <thead>
            <tr>
              <th>CAMPAGNE</th>
              <th>PÉRIODE</th>
              <th class="right">REDEMPTIONS</th>
              <th class="right">UPLIFT</th>
              <th class="right">REVENUE</th>
              <th>VERDICT</th>
            </tr>
          </thead>
          <tbody>
            ${archive.map(a => `
              <tr data-action="promo-archive-detail" data-arg="${a.name}">
                <td><b style="font-weight: 600;">${a.name}</b></td>
                <td style="color: var(--n-500); font-size: 12.5px;">${a.period}</td>
                <td class="mono right">${fmtInt(a.redem)}</td>
                <td class="mono right" style="color: var(--atlas); font-weight: 600;">${a.uplift}</td>
                <td class="mono right">${a.revenue}</td>
                <td><span class="chip ${a.verdict === 'Excellent' ? 'ok' : a.verdict === 'Tiède' ? 'neutral' : 'ok'}" style="font-size: 11px;">${a.verdict}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `,
    });
  };

  /* ═══════════════════ AUX · promo handlers ═══════════════════════════════ */
  handlers['promo-schedule'] = () => {
    let step = 1;
    const state = { type: '', value: '', audience: 'all', start: '01/05/2026', end: '15/05/2026' };

    const render = () => {
      const stepDots = `<div class="wiz-steps">${[1,2,3,4].map(i => `<div class="wiz-step ${i < step ? 'done' : i === step ? 'active' : ''}"></div>`).join('')}</div>`;
      let body, foot;
      if (step === 1) {
        body = `
          ${stepDots}
          <div style="margin-bottom: 8px; font-size: 14px; font-weight: 500;">Quel type de promotion ?</div>
          <div style="display: grid; gap: 10px;">
            ${[
              ['discount', 'Réduction directe', 'Pourcentage ou montant fixe sur tout le panier ou une catégorie.'],
              ['code',     'Code promo', 'Le client saisit un code à la caisse pour activer la remise.'],
              ['bundle',   'Lot / 3-pour-2', 'Achetez X, payez Y. Idéal pour vider du stock saisonnier.'],
              ['tax',      'Tax-free segment', 'TVA détaxée pour touristes UE/US/CH avec passeport.'],
            ].map(([id, t, d]) => `
              <div class="wiz-choice ${state.type === id ? 'selected' : ''}" data-pick="${id}">
                <div class="wc-ic">${SVG[id]}</div>
                <div><div class="wc-t">${t}</div><div class="wc-d">${d}</div></div>
              </div>
            `).join('')}
          </div>
        `;
        foot = `<button class="kb ghost" data-cancel>Annuler</button><button class="kb atlas" data-next>Suivant ${SVG.chev}</button>`;
      } else if (step === 2) {
        body = `
          ${stepDots}
          <div style="margin-bottom: 14px; font-size: 14px; font-weight: 500;">Quelle valeur ?</div>
          <div class="kf-group">
            <label class="kf-label">Valeur de la remise</label>
            <input class="kf-input" id="promoVal" placeholder="ex. 25 % ou 200 MAD" value="${state.value}"/>
            <div class="kf-help">Saisissez un pourcentage ("25 %") ou un montant fixe ("200 MAD").</div>
          </div>
          <div class="kf-row">
            <div class="kf-group">
              <label class="kf-label">Plancher panier</label>
              <input class="kf-input" placeholder="500 MAD"/>
            </div>
            <div class="kf-group">
              <label class="kf-label">Plafond remise</label>
              <input class="kf-input" placeholder="Aucun"/>
            </div>
          </div>
        `;
        foot = `<button class="kb ghost" data-back>Retour</button><button class="kb atlas" data-next>Suivant ${SVG.chev}</button>`;
      } else if (step === 3) {
        body = `
          ${stepDots}
          <div style="margin-bottom: 14px; font-size: 14px; font-weight: 500;">À qui s'adresse la promo ?</div>
          <div style="display: grid; gap: 8px;">
            ${[
              ['all',   'Tous les clients',     'Visible pour chaque visiteur de la boutique.'],
              ['eu',    'Touristes UE',         'Détectés par carte d\'origine. ~892 visiteurs / mois.'],
              ['us',    'Touristes US',         'Détectés par carte d\'origine. ~316 visiteurs / mois.'],
              ['dia',   'Diaspora FR / ES',      'Clients récurrents avec adresse hors Maroc.'],
              ['loyal', 'Clients fidèles',      '198 clients · 5+ achats sur 12 mois.'],
              ['never', 'Jamais venus',         'Anciens clients sans achat depuis 12+ mois.'],
            ].map(([id, t, d]) => `
              <div class="wiz-choice ${state.audience === id ? 'selected' : ''}" data-aud="${id}">
                <div class="wc-ic">${SVG.bell}</div>
                <div><div class="wc-t">${t}</div><div class="wc-d">${d}</div></div>
              </div>
            `).join('')}
          </div>
        `;
        foot = `<button class="kb ghost" data-back>Retour</button><button class="kb atlas" data-next>Suivant ${SVG.chev}</button>`;
      } else {
        const audLabel = { all: 'Tous les clients', eu: 'Touristes UE', us: 'Touristes US', dia: 'Diaspora FR/ES', loyal: 'Clients fidèles', never: 'Jamais venus' }[state.audience];
        const typLabel = { discount: 'Réduction directe', code: 'Code promo', bundle: 'Lot 3-pour-2', tax: 'Tax-free segment' }[state.type];
        body = `
          ${stepDots}
          <div style="margin-bottom: 14px; font-size: 14px; font-weight: 500;">Période et aperçu</div>
          <div class="kf-row">
            <div class="kf-group"><label class="kf-label">Date de début</label><input class="kf-input" value="${state.start}"/></div>
            <div class="kf-group"><label class="kf-label">Date de fin</label><input class="kf-input" value="${state.end}"/></div>
          </div>
          <div style="background: var(--paper-soft); border: 1px solid var(--n-200); border-radius: 14px; padding: 18px; margin-top: 10px;">
            <div style="font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase; margin-bottom: 8px;">APERÇU CAMPAGNE</div>
            <dl class="tx-detail-grid" style="margin: 0;">
              <dt>Type</dt><dd>${typLabel || '·'}</dd>
              <dt>Valeur</dt><dd>${state.value || '·'}</dd>
              <dt>Audience</dt><dd>${audLabel}</dd>
              <dt>Période</dt><dd>${state.start} → ${state.end}</dd>
              <dt>Estim. uplift</dt><dd style="color: var(--atlas);">+12 à +28 % AOV</dd>
            </dl>
          </div>
        `;
        foot = `<button class="kb ghost" data-back>Retour</button><button class="kb atlas" data-go>${SVG.check} Planifier la promo</button>`;
      }
      return { body, foot };
    };

    const open = () => {
      const { body, foot } = render();
      const m = modal({ title: 'Planifier une promotion', desc: 'Boutique Maison Mansour · Gueliz', body, foot, width: 580 });

      m.el.querySelectorAll('[data-pick]').forEach(el => {
        el.onclick = () => { state.type = el.dataset.pick; m.close(); step = 1; setTimeout(open, 220); };
      });
      m.el.querySelectorAll('[data-aud]').forEach(el => {
        el.onclick = () => { state.audience = el.dataset.aud; m.el.querySelectorAll('[data-aud]').forEach(o => o.classList.remove('selected')); el.classList.add('selected'); };
      });
      m.el.querySelector('[data-next]')?.addEventListener('click', () => {
        if (step === 1 && !state.type) { toast('Choisissez d\'abord un type', { type: 'warn', duration: 2200 }); return; }
        if (step === 2) { state.value = m.el.querySelector('#promoVal')?.value || ''; if (!state.value) { toast('Saisissez une valeur', { type: 'warn', duration: 2200 }); return; } }
        step++;
        m.close();
        setTimeout(open, 220);
      });
      m.el.querySelector('[data-back]')?.addEventListener('click', () => { step--; m.close(); setTimeout(open, 220); });
      m.el.querySelector('[data-cancel]')?.addEventListener('click', m.close);
      m.el.querySelector('[data-go]')?.addEventListener('click', () => {
        m.close();
        toast('Promo planifiée · démarre le ' + state.start, { type: 'success', desc: 'Notification envoyée à l\'équipe POS Maison Mansour.', duration: 4000 });
      });
    };
    open();
  };

  handlers['promo-pause'] = (el, id) => {
    modal({
      tag: 'CONFIRMATION',
      title: 'Mettre en pause cette promo ?',
      desc: `Aucun client ne pourra plus l'utiliser tant qu'elle n'est pas réactivée. ID interne : ${id || '·'}.`,
      width: 460,
      foot: `<button class="kb ghost" data-cancel>Annuler</button><button class="kb danger" data-confirm>${SVG.pause} Pauser la promo</button>`,
    }).el.addEventListener('click', (e) => {
      if (e.target.closest('[data-cancel]')) e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
      if (e.target.closest('[data-confirm]')) {
        e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
        toast('Promo mise en pause', { type: 'warn', desc: 'Vous pouvez la réactiver à tout moment depuis la liste.', duration: 3500 });
      }
    });
  };

  handlers['promo-end'] = () => toast('Promo clôturée définitivement', { type: 'info', duration: 2800 });

  handlers['promo-edit'] = (_el, id) => toast('Édition · ' + (id || 'campagne'), { type: 'info', desc: 'Les modifications s\'appliquent immédiatement aux prochains paniers.', duration: 2600 });

  handlers['promo-segment'] = (id) => {
    const btn = document.querySelector(`[data-action="promo-segment"][data-arg="${id}"]`);
    if (!btn) return;
    btn.classList.toggle('on');
    const isOn = btn.classList.contains('on');
    const name = btn.querySelector('span')?.textContent || id;
    toast(`Segment "${name}" ${isOn ? 'activé' : 'désactivé'}`, { type: isOn ? 'success' : 'info', duration: 1800 });
  };

  handlers['promo-archive-detail'] = (name) => {
    modal({
      tag: 'ARCHIVE',
      title: name,
      desc: 'Récapitulatif de campagne · ouvert depuis l\'archive.',
      width: 560,
      body: `
        <div class="kx-stat-3">
          <div class="stat"><div class="l">REDEMPTIONS</div><div class="v">421</div><div class="sub">+38 % vs prévu</div></div>
          <div class="stat"><div class="l">UPLIFT</div><div class="v">+27,6 %</div><div class="sub">vs panier baseline</div></div>
          <div class="stat"><div class="l">REVENUE</div><div class="v">184 320</div><div class="sub">MAD bruts</div></div>
        </div>
        <div style="font-size: 13px; color: var(--n-600); line-height: 1.6;">
          La campagne a sur-performé sur les Touristes UE (+34 % AOV) et a sous-performé sur la Diaspora.
          Recommandation : la dupliquer pour Aïd 2026 en ciblant uniquement Touristes UE + Clients fidèles.
        </div>
      `,
      foot: `<button class="kb ghost" data-cancel>Fermer</button><button class="kb atlas" data-go>${SVG.plus} Dupliquer la campagne</button>`,
    }).el.addEventListener('click', (e) => {
      if (e.target.closest('[data-cancel]')) e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
      if (e.target.closest('[data-go]')) {
        e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
        toast('Campagne dupliquée · brouillon créé', { type: 'success', duration: 2800 });
      }
    });
  };

  /* ═══════════════════ NAV-RETURNS ═══════════════════════════════════════════
   * Retours & échanges. Width 980. Pending list, return-policy editor, fraud
   * watch, refund issuance row.
   * ─────────────────────────────────────────────────────────────────────────── */
  let liveReturns = [];
  /* Les lignes que la page affiche : « Exporter » écrit exactement celles-là. */
  let _rxRows = [];
  /* Retours & échanges · même grammaire que l'inventaire : la page prend la
     largeur, les chiffres en tête, puis des tableaux à lignes fines. */
  function _rxCss() {
    if (document.getElementById('rx-css')) return;
    const st = document.createElement('style');
    st.id = 'rx-css';
    st.textContent = `
      .rx-kpis .kx-kpi .l { text-transform: none; letter-spacing: 0; font-family: var(--sans); font-size: 12.5px; font-weight: 500; }
      .rx-panel { margin-bottom: 18px; border: 1px solid var(--n-200, #e7e3da); border-radius: 16px; background: var(--surface, #fff); overflow: hidden; }
      html[data-theme="dark"] .rx-panel { background: var(--paper-soft); }
      .rx-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px 20px; flex-wrap: wrap; padding: 16px 18px 14px; }
      .rx-head h3 { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: -.01em; }
      .rx-head p { margin: 4px 0 0; font-size: 12.5px; line-height: 1.45; color: var(--n-500, #77807b); }
      .rx-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .rx-search { display: flex; align-items: center; gap: 8px; min-width: 240px; height: 38px; padding: 0 12px; border: 1px solid var(--n-200, #e7e3da);
        border-radius: 11px; background: var(--paper-soft, #f3f1ea); color: var(--n-500, #77807b); }
      .rx-search input { flex: 1; min-width: 0; height: auto; padding: 0; border: 0 !important; outline: 0; box-shadow: none !important; background: transparent !important; font: inherit; font-size: 13px; color: var(--ink, #0A0F0D); }
      .rx-search:focus-within { border-color: var(--atlas, #0B6E4F); }
      .rx-row { display: grid; align-items: center; gap: 16px; padding: 12px 18px; border-top: 1px solid var(--n-100, #efece5);
        grid-template-columns: 150px minmax(200px, 2fr) minmax(140px, 1.2fr) 130px 210px; }
      .rx-row[hidden] { display: none; }
      .rx-row[data-action] { cursor: pointer; }
      .rx-row[data-action]:hover { background: color-mix(in srgb, var(--atlas, #0B6E4F) 4%, transparent); }
      .rx-th { padding-top: 9px; padding-bottom: 9px; font-size: 12px; font-weight: 500; color: var(--n-500, #77807b); background: var(--paper-soft, #f3f1ea); }
      html[data-theme="dark"] .rx-th { background: var(--paper-muted); }
      .rx-th .r { text-align: right; }
      .rx-row > span { min-width: 0; }
      .rx-row b { display: block; font-weight: 600; font-size: 13.5px; letter-spacing: -.005em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .rx-row small { display: block; margin-top: 3px; font-size: 12px; line-height: 1.35; color: var(--n-500, #77807b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .rx-when b { font-variant-numeric: tabular-nums; }
      .rx-when small { font-family: var(--mono); font-size: 11px; }
      .rx-who { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .rx-amt { text-align: right; font-weight: 600; font-size: 13.5px; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .rx-amt small { font-weight: 400; }
      .rx-state { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
      .rx-tag { display: inline-flex; align-items: center; padding: 4px 9px; border-radius: 999px; font: 500 11.5px/1 var(--sans); white-space: nowrap;
        color: var(--atlas, #0B6E4F); background: color-mix(in srgb, var(--atlas, #0B6E4F) 10%, transparent); }
      .rx-tag.exch { color: #3D6B8C; background: rgba(61, 107, 140, .12); }
      .rx-tag.pend { color: #8A6210; background: rgba(217, 154, 43, .16); }
      .rx-tag.out { color: #9B2F22; background: rgba(155, 47, 34, .10); }
      .rx-tag.muted { color: var(--n-500, #77807b); background: var(--paper-soft, #f3f1ea); }
      html[data-theme="dark"] .rx-tag { color: #7DF2B0; background: rgba(125, 242, 176, .12); }
      html[data-theme="dark"] .rx-tag.out { color: #F0B3A4; background: rgba(240, 179, 164, .14); }
      .rx-mini { display: inline-flex; align-items: center; justify-content: center; min-width: 30px; height: 30px; padding: 0 8px; border: 1px solid var(--n-200, #e7e3da);
        border-radius: 9px; background: var(--surface, #fff); color: var(--ink, #0A0F0D); font: 500 12px/1 var(--sans); cursor: pointer; }
      .rx-mini:hover { border-color: var(--n-400, #a9aea9); }
      .rx-mini.danger { color: #9B2F22; }
      html[data-theme="dark"] .rx-mini { background: transparent; color: var(--paper, #F7F5F0); }
      .rx-empty { padding: 26px 18px 30px; border-top: 1px solid var(--n-100, #efece5); font-size: 13px; color: var(--n-500, #77807b); }
      .rx-page .p-grid-2 { margin-top: 0 !important; }
      @media (max-width: 900px) {
        .rx-th { display: none; }
        .rx-row { grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; padding: 12px 16px; }
        .rx-row .rx-what { grid-column: 1; grid-row: 1; }
        .rx-row .rx-amt { grid-column: 2; grid-row: 1; }
        .rx-row .rx-when { grid-column: 1 / -1; grid-row: 2; display: flex; gap: 8px; align-items: baseline; }
        .rx-row .rx-when b { font-weight: 500; font-size: 12px; color: var(--n-500, #77807b); }
        .rx-row .rx-when small { margin: 0; }
        .rx-row .rx-who { grid-column: 1 / -1; grid-row: 3; font-size: 12px; color: var(--n-500, #77807b); }
        .rx-row .rx-state { grid-column: 1 / -1; grid-row: 4; justify-content: flex-start; margin-top: 6px; }
        .rx-row .rx-state:empty { display: none; }
        .rx-row .rx-who small { display: inline; margin-left: 6px; }
        .rx-search { min-width: 0; flex: 1 1 220px; }
        .rx-tools { width: 100%; }
      }
      @media (max-width: 520px) {
        .rx-kpis.kx-kpi-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .rx-kpis .kx-kpi { padding: 14px; }
        .rx-kpis .kx-kpi .v { font-size: clamp(20px, 6vw, 26px); }
      }
    `;
    document.head.appendChild(st);
  }
  let liveReturnsCloud = null;
  let liveReturnsSlug = '';
  let liveCredits = [];
  let liveCreditsLoadedSlug = '';
  let liveCreditsOwnerSlug = '';   // le commerce à qui appartient la liste en mémoire
  let liveCreditsLoading = false;
  function realReturnsStore() {
    try { return !!window.KiwiEnv?.isReal?.() || !!window.KiwiVenue?.isCustom?.(); } catch (_) { return false; }
  }
  function bindLiveReturns() {
    if (!realReturnsStore() || !window.KiwiCloudDoc) return;
    const slug = window.KiwiCloudDoc.currentSlug();
    if (slug !== liveReturnsSlug) { liveReturnsSlug = slug; liveReturns = []; }
    if (!liveReturnsCloud) {
      liveReturnsCloud = window.KiwiCloudDoc.attach({
        feature: 'returns', slug: () => window.KiwiCloudDoc.currentSlug(),
        read: () => ({ list: liveReturns }),
        write: (doc) => {
          liveReturns = Array.isArray(doc && doc.list) ? doc.list : [];
          if (document.querySelector('[data-live-returns]')) handlers['nav-returns']();
        },
        isEmpty: (doc) => !doc || !Array.isArray(doc.list) || !doc.list.length,
      });
    }
    liveReturnsCloud.bind();
  }
  function loadLiveCredits() {
    if (!realReturnsStore() || typeof fetch !== 'function') return;
    const currentSlug = () => window.KiwiCloudDoc?.currentSlug?.() || window.KiwiVenue?.getCurrentVenueData?.()?.slug || '';
    const slug = currentSlug();
    /* Le registre affiché est celui du commerce chargé en dernier : changer de
       boutique le vide tout de suite (les avoirs d'une autre ne s'affichent pas
       le temps de la réponse), et une réponse qui arrive après un nouveau
       changement est jetée. */
    if (slug && liveCreditsOwnerSlug && liveCreditsOwnerSlug !== slug) { liveCredits = []; liveCreditsLoadedSlug = ''; }
    if (slug) liveCreditsOwnerSlug = slug;
    if (liveCreditsLoading) return;
    if (!slug || liveCreditsLoadedSlug === slug) return;
    liveCreditsLoading = true;
    fetch('/api/store-credits?merchant=' + encodeURIComponent(slug), { headers: { Accept: 'application/json' } })
      .then((response) => response && response.ok ? response.json() : null)
      .then((data) => {
        if (currentSlug() !== slug) return;
        liveCredits = data && Array.isArray(data.credits) ? data.credits : [];
        liveCreditsLoadedSlug = slug;
      }).catch(() => {}).finally(() => {
        liveCreditsLoading = false;
        if (document.querySelector('[data-live-returns]')) handlers['nav-returns']();
      });
  }
  async function mutateLiveCredit(payload) {
    const slug = window.KiwiCloudDoc?.currentSlug?.() || window.KiwiVenue?.getCurrentVenueData?.()?.slug || '';
    const response = await fetch('/api/store-credits', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...payload, merchant: slug }),
    });
    let data = null; try { data = await response.json(); } catch (_) {}
    if (!response.ok || !data || data.error) throw new Error((data && data.error) || `http-${response.status}`);
    // Paint the server-confirmed value immediately. The reconciliation fetch
    // can overlap an earlier cloud-document refresh; relying on that fetch
    // alone occasionally left the register showing the old balance even
    // though the correction had been accepted and journaled.
    if (data.credit && data.credit.code) {
      const index = liveCredits.findIndex((credit) => credit && credit.code === data.credit.code);
      if (index >= 0) liveCredits[index] = data.credit;
      else liveCredits.unshift(data.credit);
    }
    liveCreditsLoadedSlug = '';
    loadLiveCredits();
    if (document.querySelector('[data-live-returns]')) handlers['nav-returns']();
    return data;
  }
  handlers['credit-adjust'] = (el) => {
    const code = el.dataset.code || '';
    const m = modal({
      tag: _rL('AUTORISATION PROPRIÉTAIRE', 'OWNER AUTHORISATION', 'تفويض المالك'), title: _rL(`Corriger ${code}`, `Correct ${code}`, `تصحيح ${code}`),
      desc: _rL('La correction est ajoutée au journal permanent avec votre motif.', 'The correction is added to the permanent log with your reason.', 'يُضاف التصحيح إلى السجل الدائم مع سببك.'), width: 500,
      body: `<div class="kf-group"><label class="kf-label">${_rL('Variation du solde (MAD)', 'Balance change (MAD)', 'تغيّر الرصيد (MAD)')}</label><input class="kf-input" type="number" step="0.01" data-credit-delta placeholder="${_rL('Ex. -50 ou 50', 'E.g. -50 or 50', 'مثال: -50 أو 50')}" /></div><div class="kf-group"><label class="kf-label">${_rL('Motif obligatoire', 'Reason (required)', 'السبب (إلزامي)')}</label><input class="kf-input" maxlength="500" data-credit-reason placeholder="${_rL('Pourquoi ce solde doit être corrigé', 'Why this balance needs correcting', 'سبب تصحيح هذا الرصيد')}" /></div>`,
      foot: `<button class="kb ghost" data-cancel>${_rL('Annuler', 'Cancel', 'إلغاء')}</button><button class="kb atlas" data-action="credit-adjust-confirm" data-code="${esc(code)}">${_rL('Confirmer la correction', 'Confirm correction', 'تأكيد التصحيح')}</button>`,
    });
    m.el.querySelector('[data-cancel]')?.addEventListener('click', () => m.el.querySelector('.kiwi-modal-close')?.click());
  };
  handlers['credit-adjust-confirm'] = async (el) => {
    const root = el.closest('.kiwi-backdrop') || document;
    const delta = Number(root.querySelector('[data-credit-delta]')?.value || 0);
    const reason = String(root.querySelector('[data-credit-reason]')?.value || '').trim();
    if (!delta || !reason) { toast(_rL('Montant et motif obligatoires', 'Amount and reason are required', 'المبلغ والسبب إلزاميان'), { type: 'warning' }); return; }
    el.disabled = true;
    try {
      await mutateLiveCredit({ action: 'adjust', id: `credit-adjust-${Date.now().toString(36)}`, code: el.dataset.code, deltaCents: Math.round(delta * 100), reason });
      root.querySelector('.kiwi-modal-close')?.click(); toast(_rL('Solde corrigé et journalisé', 'Balance corrected and logged', 'تم تصحيح الرصيد وتسجيله'), { type: 'success' });
    } catch (error) { el.disabled = false; toast(_rL('Correction refusée', 'Correction refused', 'تم رفض التصحيح'), { type: 'error', desc: error.message === 'manager-required' ? _rL('Compte propriétaire ou responsable requis.', 'Owner or manager account required.', 'يلزم حساب المالك أو المسؤول.') : _rL('Vérifiez le solde et réessayez.', 'Check the balance and try again.', 'تحقق من الرصيد وأعد المحاولة.') }); }
  };
  handlers['credit-cancel'] = async (el) => {
    const code = el.dataset.code || '';
    if (!window.confirm(_rL(`Annuler définitivement l’avoir ${code} ? Cette action sera journalisée.`, `Cancel store credit ${code} permanently? This action will be logged.`, `إلغاء رصيد المتجر ${code} نهائيًا؟ سيتم تسجيل هذا الإجراء.`))) return;
    el.disabled = true;
    try {
      await mutateLiveCredit({ action: 'cancel', id: `credit-cancel-${Date.now().toString(36)}`, code, reason: 'Annulation depuis le registre propriétaire' });
      toast(_rL('Avoir annulé', 'Store credit cancelled', 'تم إلغاء رصيد المتجر'), { type: 'success' });
    } catch (error) { el.disabled = false; toast(_rL('Annulation refusée', 'Cancellation refused', 'تم رفض الإلغاء'), { type: 'error', desc: error.message === 'manager-required' ? _rL('Compte propriétaire ou responsable requis.', 'Owner or manager account required.', 'يلزم حساب المالك أو المسؤول.') : _rL('Cet avoir ne peut plus être annulé.', 'This store credit can no longer be cancelled.', 'لم يعد بالإمكان إلغاء رصيد المتجر هذا.') }); }
  };
  handlers['nav-returns'] = () => {
    const real = realReturnsStore();
    bindLiveReturns();
    loadLiveCredits();
    const demoPending = [
      { id: 'R-7821', d: '24/04', name: 'Caftan brodé taille S',         amt: 2450,  reason: 'Taille',                client: 'Anna M. (DE)',     status: 'pend',  emoji: 'C' },
      { id: 'R-7822', d: '23/04', name: 'Babouches cuir caramel',         amt: 380,   reason: 'Défaut · couture',      client: 'Sophie L. (FR)',   status: 'pend',  emoji: 'B' },
      { id: 'R-7823', d: '23/04', name: 'Tapis berbère 1,2 × 1,8 m',     amt: 4200,  reason: 'Cadeau non désiré',     client: 'Karen B. (US)',    status: 'pend',  emoji: 'T' },
      { id: 'R-7824', d: '22/04', name: 'Théière argentée gravée',       amt: 950,   reason: 'N\'a pas plu',          client: 'Carmen R. (ES)',   status: 'ok',    emoji: 'TH' },
      { id: 'R-7825', d: '22/04', name: 'Coussin tissé Kilim',            amt: 290,   reason: 'Défaut · tache',        client: 'Hassan J. (MA)',   status: 'pend',  emoji: 'CO' },
      { id: 'R-7826', d: '21/04', name: 'Bracelet argent berbère',       amt: 1200,  reason: 'Taille',                client: 'Karima O. (MA)',   status: 'neutral', emoji: 'BR' },
    ];
    const pending = real ? liveReturns.flatMap((ret) => {
      const items = Array.isArray(ret && ret.items) ? ret.items : [];
      return items.map((item, i) => ({
        id: String(ret.id || 'RET') + (items.length > 1 ? '-' + (i + 1) : ''),
        d: new Date(Number(ret.ts) || Date.now()).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
        name: `${Number(item.qty) || 1} × ${item.name || _rL('Article', 'Item', 'منتج')}${item.size ? ' · ' + item.size : ''}`,
        amt: Number(item.amount) || Number(ret.amount) || 0,
        reason: ret.reason || (ret.kind === 'echange' ? _rL('Échange', 'Exchange', 'استبدال') : _rL('Avoir', 'Store credit', 'رصيد المتجر')),
        /* Le type de retour est une donnée, pas une chaîne d'affichage. La
           pastille se lisait sur le motif : un échange dont le motif n'était pas
           littéralement « Echange » s'affichait « Retourné ». On garde le kind. */
        kind: ret.kind || 'avoir',
        client: ret.client || _rL('Cliente de passage', 'Walk-in customer', 'زبون عابر'), status: 'ok', emoji: '', actor: ret.actor || _rL('Caisse', 'Till', 'الصندوق'),
      }));
    }).sort((a, b) => String(b.id).localeCompare(String(a.id))) : demoPending;

    const flagged = real ? [] : [
      { name: 'Diana K. (US)',  reason: _rL('4 retours en 28 j · 2 sur articles soldés', '4 returns in 28 days · 2 on sale items', '4 مرتجعات في 28 يومًا · 2 منها على أصناف مخفّضة'), amt: '4 280 MAD', risk: _rL('Élevé', 'High', 'مرتفعة') },
      { name: 'Sofia A. (FR)',  reason: _rL('3 retours en 30 j · pattern post-Instagram', '3 returns in 30 days · after Instagram posts', '3 مرتجعات في 30 يومًا · بعد منشورات إنستغرام'), amt: '2 940 MAD', risk: _rL('Modéré', 'Moderate', 'متوسطة') },
    ];
    const creditRows = real ? liveCredits : [];

    _rxCss();
    _rxRows = pending;
    const sumAmt = pending.reduce((t, r) => t + (Number(r.amt) || 0), 0);
    const nExch = pending.filter((r) => r.kind === 'echange' || r.status === 'neutral').length;
    const activeCredits = creditRows.filter((c) => c.status === 'active');
    const creditBalance = activeCredits.reduce((t, c) => t + (Number(c.balanceCents) || 0), 0) / 100;
    const nPend = pending.filter((r) => r.status === 'pend').length;
    const _nn = { retour: ['retour', 'return', 'مرتجع', 'مرتجعات'], echange: ['échange', 'exchange', 'استبدال', 'عمليات استبدال'], bon: ['bon', 'voucher', 'قسيمة', 'قسائم'], demande: ['demande', 'request', 'طلب', 'طلبات'] };
    const plural = (n, k) => { const w = _nn[k]; const l = window.KiwiI18n?.getLang?.(); return l === 'en' ? `${n} ${w[1]}${n === 1 ? '' : 's'}` : l === 'ar' ? `${n} ${n === 1 ? w[2] : w[3]}` : `${n} ${n > 1 ? w[0] + 's' : w[0]}`; };
    const statusChip = (r) => {
      if (real && _rL('fr', 'en', 'ar') !== 'fr') return r.kind === 'echange' ? `<span class="rx-tag exch">${_rL('', 'Exchanged', 'تم الاستبدال')}</span>` : `<span class="rx-tag">${_rL('', 'Returned', 'تم الإرجاع')}</span>`;
      if (real) return r.kind === 'echange' ? '<span class="rx-tag exch">Échangé</span>' : '<span class="rx-tag">Retourné</span>';
      return r.status === 'pend' ? `<span class="rx-tag pend">${_rL('En attente', 'Pending', 'قيد الانتظار')}</span>` : r.status === 'ok' ? `<span class="rx-tag">${_rL('Approuvé', 'Approved', 'تمت الموافقة')}</span>`
        : r.status === 'ref' ? `<span class="rx-tag out">${_rL('Refusé', 'Refused', 'مرفوض')}</span>` : `<span class="rx-tag exch">${_rL('Échangé', 'Exchanged', 'تم الاستبدال')}</span>`;
    };
    /* Un retour de 14,50 MAD s'affichait « 15 » (0 décimale) : entiers sans
       décimales, sinon deux. */
    const fmtAmt = (n) => fmtMAD(n, Math.round(Number(n || 0) * 100) % 100 === 0 ? 0 : 2);
    const retRow = (r) => `
      <div class="rx-row" data-ret-row data-ret-search="${esc([r.id, r.name, r.reason, r.client, r.actor].join(' ').toLowerCase())}" ${real ? '' : `data-action="ret-detail" data-arg="${esc(r.id)}"`}>
        <span class="rx-when"><b>${esc(r.d)}</b><small title="${esc(r.id)}">${esc(r.id)}</small></span>
        <span class="rx-what"><b>${esc(r.name)}</b><small>${esc(r.reason)}</small></span>
        <span class="rx-who">${esc(r.client)}${real ? `<small>${esc(r.actor)}</small>` : ''}</span>
        <span class="rx-amt">${fmtAmt(r.amt)} MAD</span>
        <span class="rx-state">${statusChip(r)}${r.status === 'pend' ? `
          <button class="rx-mini" data-action="ret-approve" data-arg="${esc(r.id)}" data-bubble="stop" title="${_rL('Approuver', 'Approve', 'موافقة')}" aria-label="${_rL('Approuver', 'Approve', 'موافقة')}">${SVG.check}</button>
          <button class="rx-mini danger" data-action="ret-refuse" data-arg="${esc(r.id)}" data-bubble="stop" title="${_rL('Refuser', 'Refuse', 'رفض')}" aria-label="${_rL('Refuser', 'Refuse', 'رفض')}">${SVG.x}</button>
          <button class="rx-mini" data-action="ret-exchange" data-arg="${esc(r.id)}" data-bubble="stop" title="${_rL('Échanger', 'Exchange', 'استبدال')}" aria-label="${_rL('Échanger', 'Exchange', 'استبدال')}">${SVG.swap}</button>` : ''}</span>
      </div>`;
    const creditRow = (credit) => {
      const issued = (credit.events || []).find((event) => event.action === 'issue') || {};
      const products = Array.isArray(issued.lines) && issued.lines.length
        ? issued.lines.map((line) => `${line.qty || 1}× ${line.name || _rL('Article', 'Item', 'منتج')}`).join(' · ') : (credit.reason || _rL('Retour', 'Return', 'مرتجع'));
      const search = [credit.code, credit.customerName, credit.originalRef, credit.originalSaleId, products].join(' ').toLowerCase();
      const tag = credit.status === 'active' ? `<span class="rx-tag">${_rL('Actif', 'Active', 'نشط')}</span>` : credit.status === 'consumed' ? `<span class="rx-tag muted">${_rL('Utilisé', 'Used', 'مستخدم')}</span>`
        : credit.status === 'cancelled' ? `<span class="rx-tag out">${_rL('Annulé', 'Cancelled', 'ملغى')}</span>` : `<span class="rx-tag muted">${esc(credit.status)}</span>`;
      return `<div class="rx-row rx-credit" data-credit-row data-credit-search="${esc(search)}">
        <span class="rx-when"><b>${esc(credit.code)}</b><small>${new Date(Number(credit.createdAt) || Date.now()).toLocaleDateString('fr-FR')}</small></span>
        <span class="rx-what"><b>${esc(credit.customerName || _rL('Porteur du bon', 'Voucher holder', 'حامل القسيمة'))}</b><small>${_rL('Vente', 'Sale', 'عملية البيع')} ${esc(credit.originalRef || credit.originalSaleId || '·')} · ${esc(products)}</small></span>
        <span class="rx-who">${esc(issued.actor || credit.issuedBy || _rL('Caisse', 'Till', 'الصندوق'))}<small>${_rL('expire le', 'expires', 'تنتهي في')} ${new Date(Number(credit.expiresAt) || Date.now()).toLocaleDateString('fr-FR')}</small></span>
        <span class="rx-amt">${fmtMAD(Number(credit.balanceCents || 0) / 100, 2)} MAD<small>${_rL('sur', 'of', 'من')} ${fmtMAD(Number(credit.amountCents || 0) / 100, 2)}</small></span>
        <span class="rx-state">${tag}
          ${credit.status !== 'cancelled' ? `<button class="rx-mini txt" data-action="credit-adjust" data-code="${esc(credit.code)}">${_rL('Corriger', 'Correct', 'تصحيح')}</button>` : ''}
          ${credit.status === 'active' ? `<button class="rx-mini txt danger" data-action="credit-cancel" data-code="${esc(credit.code)}">${_rL('Annuler', 'Cancel', 'إلغاء')}</button>` : ''}</span>
      </div>`;
    };

    window.Kiwi.appPage('returns', {
      title: _rL('Retours & échanges', 'Returns & exchanges', 'المرتجعات والاستبدال'),
      subtitle: real ? `${(window.KiwiVenue?.getCurrentVenueData?.() || {}).fullDisplay || _rL('Boutique', 'Shop', 'المتجر')} · ${_rL('enregistrés depuis la caisse', 'recorded from the till', 'مسجّلة من الصندوق')}` : _rL('Maison Mansour · Gueliz · 5 demandes en attente · 2 clients flaggés', 'Maison Mansour · Gueliz · 5 requests pending · 2 flagged customers', 'Maison Mansour · غيليز · 5 طلبات قيد الانتظار · زبونان مُبلَّغ عنهما'),
      body: `<div class="rx-page" data-live-returns>
        <div class="kx-kpi-strip rx-kpis">
          ${real ? `
          <div class="kx-kpi"><div class="l">${_rL('Articles retournés', 'Items returned', 'المنتجات المرتجعة')}</div><div class="v">${pending.length}</div><div class="d">${plural(pending.length - nExch, 'retour')} · ${plural(nExch, 'echange')}</div></div>
          <div class="kx-kpi"><div class="l">${_rL('Montant retourné', 'Amount returned', 'المبلغ المرتجع')}</div><div class="v">${fmtAmt(sumAmt)}<span class="u">MAD</span></div><div class="d">${_rL('Valeur des articles rendus', 'Value of items handed back', 'قيمة المنتجات المُعادة')}</div></div>
          <div class="kx-kpi"><div class="l">${_rL('Avoirs actifs', 'Active store credits', 'أرصدة المتجر النشطة')}</div><div class="v">${activeCredits.length}</div><div class="d">${plural(creditRows.length, 'bon')} ${_rL('émis au total', 'issued in total', 'صادرة في المجموع')}</div></div>
          <div class="kx-kpi"><div class="l">${_rL('Solde des avoirs', 'Store credit balance', 'رصيد المتجر')}</div><div class="v">${fmtAmt(creditBalance)}<span class="u">MAD</span></div><div class="d">${_rL('Encore utilisable en caisse', 'Still usable at the till', 'لا يزال قابلًا للاستخدام في الصندوق')}</div></div>` : `
          <div class="kx-kpi warn"><div class="l">${_rL('En attente', 'Pending', 'قيد الانتظار')}</div><div class="v">${nPend}</div><div class="d">${_rL('Fenêtre de retour 14 jours', '14-day return window', 'مهلة الإرجاع 14 يومًا')}</div></div>
          <div class="kx-kpi"><div class="l">${_rL('Montant concerné', 'Amount concerned', 'المبلغ المعني')}</div><div class="v">${fmtAmt(sumAmt)}<span class="u">MAD</span></div><div class="d">${plural(pending.length, 'demande')}</div></div>
          <div class="kx-kpi"><div class="l">${_rL('Taux de retour 30 j', '30-day return rate', 'معدل الإرجاع خلال 30 يومًا')}</div><div class="v">4,8 %</div><div class="d">${_rL('Taux d\'échange', 'Exchange rate', 'معدل الاستبدال')} 12,1 %</div></div>
          <div class="kx-kpi"><div class="l">${_rL('Clients signalés', 'Flagged customers', 'زبائن مُبلَّغ عنهم')}</div><div class="v">${flagged.length}</div><div class="d">${_rL('3 retours ou plus en 30 jours', '3 or more returns in 30 days', '3 مرتجعات أو أكثر خلال 30 يومًا')}</div></div>`}
        </div>

        <div class="rx-panel">
          <header class="rx-head">
            <div><h3>${real ? _rL('Articles retournés', 'Items returned', 'المنتجات المرتجعة') : _rL('Demandes de retour', 'Return requests', 'طلبات الإرجاع')}</h3><p>${real ? _rL('Article, motif, client et employé, tels qu’enregistrés à la caisse.', 'Item, reason, customer and employee, as recorded at the till.', 'المنتج والسبب والزبون والموظف كما سُجّلت في الصندوق.') : _rL('Approuvez, refusez ou échangez. Touchez une ligne pour l’historique client.', 'Approve, refuse or exchange. Tap a row for the customer history.', 'وافق أو ارفض أو استبدل. المس سطرًا لعرض سجل الزبون.')}</p></div>
            <div class="rx-tools">
              ${pending.length ? '<label class="rx-search"><span aria-hidden="true">' + SVG.search + '</span><input id="ret-search" placeholder="' + _rL('Article, client, motif…', 'Item, customer, reason…', 'المنتج أو الزبون أو السبب…') + '" aria-label="' + _rL('Rechercher un retour', 'Search returns', 'البحث في المرتجعات') + '" /></label>' : ''}
              ${pending.length ? `<button class="kb ghost" data-action="ret-export">${SVG.download || ''}${_rL('Exporter', 'Export', 'تصدير')}</button>` : ''}
              ${real ? '' : `<button class="kb ghost" data-action="ret-policy-jump">${SVG.edit} ${_rL('Politique', 'Policy', 'السياسة')}</button>`}
            </div>
          </header>
          ${pending.length ? `<div class="rx-table">
            <div class="rx-row rx-th" aria-hidden="true"><span>${_rL('Date', 'Date', 'التاريخ')}</span><span>${_rL('Article', 'Item', 'المنتج')}</span><span>${_rL('Client', 'Customer', 'الزبون')}</span><span class="r">${_rL('Montant', 'Amount', 'المبلغ')}</span><span class="r">${_rL('Statut', 'Status', 'الحالة')}</span></div>
            ${pending.map(retRow).join('')}
          </div>` : `<div class="rx-empty">${_rL('Aucun retour enregistré pour cette boutique. Les retours faits à la caisse apparaissent ici.', 'No returns recorded for this shop. Returns made at the till appear here.', 'لا توجد مرتجعات مسجّلة لهذا المتجر. تظهر هنا المرتجعات التي تتم في الصندوق.')}</div>`}
        </div>

        ${real ? `<div class="rx-panel" data-credit-register>
          <header class="rx-head">
            <div><h3>${_rL('Registre des avoirs', 'Store credit register', 'سجل أرصدة المتجر')}</h3><p>${_rL('Émission, utilisation, solde, échéance et employé, conservés dans le registre serveur.', 'Issue, use, balance, expiry and employee, kept in the server register.', 'الإصدار والاستخدام والرصيد وتاريخ الانتهاء والموظف، محفوظة في سجل الخادم.')}</p></div>
            <div class="rx-tools">${creditRows.length ? '<label class="rx-search"><span aria-hidden="true">' + SVG.search + '</span><input id="ret-credit-search" placeholder="' + _rL('Code, cliente ou vente d’origine…', 'Code, customer or original sale…', 'الرمز أو الزبون أو عملية البيع الأصلية…') + '" aria-label="' + _rL('Rechercher un avoir', 'Search store credits', 'البحث في أرصدة المتجر') + '" /></label>' : ''}</div>
          </header>
          <div id="ret-credit-rows">
            ${creditRows.length ? `<div class="rx-table"><div class="rx-row rx-th" aria-hidden="true"><span>${_rL('Bon', 'Voucher', 'القسيمة')}</span><span>${_rL('Client', 'Customer', 'الزبون')}</span><span>${_rL('Émis par', 'Issued by', 'صادرة عن')}</span><span class="r">${_rL('Solde', 'Balance', 'الرصيد')}</span><span class="r">${_rL('Statut', 'Status', 'الحالة')}</span></div>${creditRows.map(creditRow).join('')}</div>`
              : `<div class="rx-empty">${liveCreditsLoading ? _rL('Chargement du registre…', 'Loading the register…', 'جارٍ تحميل السجل…') : _rL('Aucun avoir émis pour cette boutique.', 'No store credit issued for this shop.', 'لم يُصدر أي رصيد متجر لهذا المتجر.')}</div>`}
          </div>
        </div>` : ''}

        ${real ? '' : `
        <div class="p-grid-2" style="margin-top: 18px;">
          <div class="p-card" style="margin-bottom: 0;">
            <div class="head">
              <h4>${_rL('Politique de retour', 'Return policy', 'سياسة الإرجاع')}</h4>
              <span class="meta">${_rL('MODIFIABLE', 'EDITABLE', 'قابلة للتعديل')}</span>
            </div>
            <div style="font-size: 12.5px; color: var(--n-500); margin-bottom: 12px; line-height: 1.45;">${_rL('Affichée sur le ticket et la fiche produit. Toute modification s\'applique aux nouvelles ventes uniquement.', 'Shown on the receipt and the product page. Any change applies to new sales only.', 'تظهر على الإيصال وصفحة المنتج. يسري أي تعديل على المبيعات الجديدة فقط.')}</div>
            <div class="b-ret-policy" id="retPolicy">
              <div class="field">
                <div class="lbl">${_rL('FENÊTRE DE RETOUR', 'RETURN WINDOW', 'مهلة الإرجاع')}</div>
                <input type="number" value="${real ? 7 : 14}" min="0" max="90" step="1"/>
                <div style="font-size: 11px; color: var(--n-500); margin-top: 4px;">${_rL('jours après l\'achat', 'days after purchase', 'أيام بعد الشراء')}</div>
              </div>
              <div class="field">
                <div class="lbl">${_rL('FRAIS DE RESTOCKING', 'RESTOCKING FEE', 'رسوم إعادة التخزين')}</div>
                <input type="number" value="0" min="0" max="50" step="1"/>
                <div style="font-size: 11px; color: var(--n-500); margin-top: 4px;">${_rL('pourcentage retenu', 'percentage withheld', 'النسبة المقتطعة')}</div>
              </div>
            </div>
            <div style="font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase; margin: 14px 0 8px;">${_rL('RÈGLES DE CONDITION', 'CONDITION RULES', 'قواعد الحالة')}</div>
            <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; color: var(--n-700); line-height: 1.7;">
              ${[
                _rL('Article non porté, non lavé, étiquette d\'origine présente', 'Item unworn, unwashed, original tag attached', 'منتج غير مرتدى وغير مغسول والبطاقة الأصلية موجودة'),
                _rL('Emballage et coffret-cadeau intacts', 'Packaging and gift box intact', 'التغليف وعلبة الهدية سليمان'),
                _rL('Articles soldés > 30 % : crédit boutique uniquement', 'Items on sale over 30% off: store credit only', 'منتجات مخفّضة بأكثر من 30 %: رصيد المتجر فقط'),
                _rL('Articles personnalisés (broderie, gravure) : non-retournables', 'Personalised items (embroidery, engraving): non-returnable', 'منتجات مخصّصة (تطريز أو نقش): غير قابلة للإرجاع'),
                _rL('Bijoux : sceau anti-fraude non rompu', 'Jewellery: anti-tamper seal unbroken', 'المجوهرات: ختم مكافحة التلاعب سليم'),
              ].map(rule => `<li style="display: flex; align-items: flex-start; gap: 9px; padding: 4px 0;"><span style="color: var(--atlas); flex-shrink: 0; margin-top: 4px;">${SVG.check}</span><span>${rule}</span></li>`).join('')}
            </ul>
            <button class="kb atlas" style="width: 100%; justify-content: center; margin-top: 12px;" data-action="ret-policy-save">${_rL('Enregistrer la politique', 'Save policy', 'حفظ السياسة')}</button>
          </div>

          <div class="p-card" style="margin-bottom: 0;">
            <div class="head">
              <h4>${_rL('Veille fraude', 'Fraud watch', 'مراقبة الاحتيال')}</h4>
              <span class="meta" style="color: var(--danger);">${flagged.length} ${_rL('CLIENTS FLAGGÉS', 'FLAGGED CUSTOMERS', 'زبائن مُبلَّغ عنهم')}</span>
            </div>
            <div style="font-size: 12.5px; color: var(--n-500); margin-bottom: 12px; line-height: 1.45;">${_rL('3 retours ou plus sur 30 jours glissants. Vous pouvez bloquer leurs futures demandes de retour.', '3 or more returns over a rolling 30 days. You can block their future return requests.', '3 مرتجعات أو أكثر خلال 30 يومًا متتالية. يمكنك حظر طلبات الإرجاع القادمة منهم.')}</div>
            ${flagged.map((f, i) => `
              <div style="display: flex; align-items: flex-start; gap: 12px; padding: 14px 0; border-top: 1px solid var(--n-200);">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(201,74,58,0.12); color: var(--danger); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${SVG.flag}</div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-weight: 600; font-size: 13.5px;">${f.name}</div>
                  <div style="font-size: 12px; color: var(--n-500); margin-top: 2px; line-height: 1.4;">${f.reason}</div>
                  <div style="font-size: 11.5px; color: var(--n-500); margin-top: 6px; font-family: var(--mono);">${_rL('Volume retours', 'Return volume', 'حجم المرتجعات')} : ${f.amt} · ${_rL('Risque', 'Risk', 'الخطورة')} ${f.risk}</div>
                </div>
                <label class="kx-toggle">
                  <input type="checkbox" data-action="ret-block" data-arg="${f.name}"/>
                  <span class="track"></span>
                </label>
              </div>
            `).join('')}
            <div style="margin-top: 12px; padding: 10px 12px; background: rgba(217,154,43,0.08); border: 1px solid rgba(217,154,43,0.22); border-radius: 10px; font-size: 11.5px; color: var(--warn-ink); line-height: 1.5;">
              <b>${_rL('Astuce.', 'Tip.', 'نصيحة.')}</b> ${_rL('Bloquer un client n\'empêche pas l\'achat, uniquement les retours. Notification email envoyée automatiquement.', 'Blocking a customer does not stop purchases, only returns. An email notification is sent automatically.', 'حظر الزبون لا يمنعه من الشراء، بل من الإرجاع فقط. يُرسل إشعار بالبريد الإلكتروني تلقائيًا.')}
            </div>
          </div>
        </div>

        <div class="p-card" style="margin-top: 18px;">
          <div class="head">
            <h4>${_rL('Émission rapide d\'un remboursement', 'Quick refund', 'استرداد سريع للمبلغ')}</h4>
            <span class="meta">${_rL('3 OPTIONS', '3 OPTIONS', '3 خيارات')}</span>
          </div>
          <div style="font-size: 12.5px; color: var(--n-500); margin-bottom: 12px; line-height: 1.45;">${_rL('Choisissez le canal, la commande d\'origine sera automatiquement liée pour la conformité.', 'Choose the channel. The original order is linked automatically for compliance.', 'اختر القناة، وسيُربط الطلب الأصلي تلقائيًا لأغراض الامتثال.')}</div>
          <div class="p-grid-3">
            <button class="kb ghost" style="padding: 14px; flex-direction: column; gap: 8px; min-height: 76px; align-items: center; justify-content: center;" data-action="ret-refund-original">
              ${SVG.card}
              <div style="text-align: center;">
                <div style="font-weight: 600; font-size: 13px;">${_rL('Carte d\'origine', 'Original card', 'البطاقة الأصلية')}</div>
                <div style="font-size: 11px; color: var(--n-500); margin-top: 2px;">Visa / Mastercard · ${_rL('1-3 jours', '1-3 days', '1-3 أيام')}</div>
              </div>
            </button>
            <button class="kb ghost" style="padding: 14px; flex-direction: column; gap: 8px; min-height: 76px; align-items: center; justify-content: center;" data-action="ret-refund-credit">
              ${SVG.voucher}
              <div style="text-align: center;">
                <div style="font-weight: 600; font-size: 13px;">${_rL('Crédit boutique', 'Store credit', 'رصيد المتجر')}</div>
                <div style="font-size: 11px; color: var(--n-500); margin-top: 2px;">${_rL('Bon valable 12 mois', 'Voucher valid for 12 months', 'قسيمة صالحة 12 شهرًا')}</div>
              </div>
            </button>
            <button class="kb ghost" style="padding: 14px; flex-direction: column; gap: 8px; min-height: 76px; align-items: center; justify-content: center;" data-action="ret-refund-whatsapp">
              ${SVG.wa}
              <div style="text-align: center;">
                <div style="font-weight: 600; font-size: 13px;">${_rL('Notifier WhatsApp', 'Notify on WhatsApp', 'إشعار عبر واتساب')}</div>
                <div style="font-size: 11px; color: var(--n-500); margin-top: 2px;">${_rL('Lien de remboursement', 'Refund link', 'رابط الاسترداد')}</div>
              </div>
            </button>
          </div>
        </div>
`}
      </div>`,
    });
    setTimeout(() => {
      const rs = document.querySelector('#ret-search');
      if (rs) rs.addEventListener('input', () => {
        const q = rs.value.trim().toLowerCase();
        document.querySelectorAll('[data-ret-row]').forEach((row) => { row.hidden = !!q && !String(row.dataset.retSearch || '').includes(q); });
      });
      const search = document.querySelector('#ret-credit-search');
      if (!search) return;
      search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        document.querySelectorAll('[data-credit-row]').forEach((row) => {
          row.hidden = !!q && !String(row.dataset.creditSearch || '').includes(q);
        });
      });
    }, 0);
  };

  /* ═══════════════════ AUX · returns handlers ═══════════════════════════════ */

  handlers['ret-detail'] = (id) => {
    const samplePhotos = ['mint-soft', 'rgba(217,154,43,0.16)', 'var(--paper-soft)', 'rgba(11,110,79,0.10)'];
    modal({
      tag: _rL('DEMANDE DE RETOUR', 'RETURN REQUEST', 'طلب إرجاع') + ' · ' + (id || '·'),
      title: 'Caftan brodé taille S',
      desc: _rL('Anna M. (DE) · achat le 17/04/2026 · ticket #T-21847', 'Anna M. (DE) · purchased 17/04/2026 · receipt #T-21847', 'Anna M. (DE) · اشترت في 17/04/2026 · إيصال #T-21847'),
      width: 640,
      body: `
        <div class="kx-stat-3">
          <div class="stat"><div class="l">${_rL('MONTANT', 'AMOUNT', 'المبلغ')}</div><div class="v">2 450</div><div class="sub">${_rL('MAD payés', 'MAD paid', 'MAD مدفوعة')}</div></div>
          <div class="stat"><div class="l">${_rL('JOURS', 'DAYS', 'الأيام')}</div><div class="v">7 / 14</div><div class="sub">${_rL('restants', 'left', 'متبقية')}</div></div>
          <div class="stat"><div class="l">${_rL('CLIENT', 'CUSTOMER', 'الزبون')}</div><div class="v">3</div><div class="sub">${_rL('achats antérieurs', 'previous purchases', 'مشتريات سابقة')}</div></div>
        </div>

        <div style="font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase; margin: 14px 0 8px;">${_rL('MOTIF DÉTAILLÉ', 'DETAILED REASON', 'السبب بالتفصيل')}</div>
        <div style="font-size: 13px; color: var(--n-700); line-height: 1.55; padding: 12px; background: var(--paper-soft); border-radius: 10px;">
          « La taille S est trop serrée à l'épaule pour ma morphologie. Je souhaite échanger contre une taille M ou être remboursée. L'article n'a pas été porté, l'étiquette est encore présente. »
        </div>

        <div style="font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase; margin: 16px 0 8px;">${_rL('PHOTOS FOURNIES', 'PHOTOS PROVIDED', 'الصور المرفقة')}</div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
          ${samplePhotos.map((c, i) => `
            <div style="aspect-ratio: 1; background: ${c}; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--n-500); font-size: 11px; font-family: var(--mono); border: 1px solid var(--n-200);">${_rL('PHOTO', 'PHOTO', 'صورة')} ${i+1}</div>
          `).join('')}
        </div>

        <div style="font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase; margin: 16px 0 8px;">${_rL('HISTORIQUE CLIENTE · 3 ACHATS', 'CUSTOMER HISTORY · 3 PURCHASES', 'سجل الزبونة · 3 مشتريات')}</div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${[
            ['17/04/2026', 'Caftan brodé taille S',     '2 450 MAD', _rL('achat actuel', 'current purchase', 'الشراء الحالي')],
            ['08/02/2026', 'Foulard soie écru',         '720 MAD',   _rL('aucun retour', 'no returns', 'لا مرتجعات')],
            ['12/12/2025', 'Coffret huile argan',       '380 MAD',   _rL('aucun retour', 'no returns', 'لا مرتجعات')],
          ].map(([d, item, amt, st]) => `
            <div style="display: grid; grid-template-columns: 90px 1fr 110px auto; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--n-200); font-size: 12.5px; align-items: center;">
              <div class="mono" style="color: var(--n-500);">${d}</div>
              <div>${item}</div>
              <div class="mono" style="text-align: right;">${amt}</div>
              <div style="font-size: 11px; color: var(--n-500); font-family: var(--mono); letter-spacing: 0.04em;">${st}</div>
            </div>
          `).join('')}
        </div>
      `,
      foot: `
        <button class="kb ghost" data-action="ret-refuse" data-arg="${id || ''}" data-bubble="stop" style="color: var(--danger);">${SVG.x} ${_rL('Refuser', 'Refuse', 'رفض')}</button>
        <button class="kb ghost" data-action="ret-refund-credit" data-bubble="stop">${SVG.voucherSm} ${_rL('Crédit boutique', 'Store credit', 'رصيد المتجر')}</button>
        <button class="kb ghost" data-action="ret-exchange" data-arg="${id || ''}" data-bubble="stop">${SVG.swap} ${_rL('Échanger', 'Exchange', 'استبدال')}</button>
        <button class="kb atlas" data-action="ret-approve" data-arg="${id || ''}" data-bubble="stop">${SVG.check} ${_rL('Approuver remboursement', 'Approve refund', 'الموافقة على استرداد المبلغ')}</button>
      `,
    });
  };

  handlers['ret-approve'] = (id) => {
    modal({
      tag: _rL('CHOISIR LE CANAL', 'CHOOSE THE CHANNEL', 'اختر القناة'),
      title: _rL('Comment rembourser ?', 'How to refund?', 'كيف يتم استرداد المبلغ؟'),
      desc: `${_rL('Demande', 'Request', 'الطلب')} ${id || '·'} · 2 450 MAD · Anna M. (DE)`,
      width: 540,
      body: `
        <div style="display: grid; gap: 10px;">
          <div class="wiz-choice" data-channel="card">
            <div class="wc-ic">${SVG.card}</div>
            <div><div class="wc-t">${_rL("Carte d'origine", 'Original card', 'البطاقة الأصلية')} · Visa ••4291</div><div class="wc-d">${_rL('Crédité en 1 à 3 jours ouvrés. Aucun frais.', 'Credited within 1 to 3 working days. No fees.', 'يُضاف المبلغ خلال 1 إلى 3 أيام عمل. دون أي رسوم.')}</div></div>
          </div>
          <div class="wiz-choice" data-channel="credit">
            <div class="wc-ic">${SVG.voucher}</div>
            <div><div class="wc-t">${_rL('Crédit boutique', 'Store credit', 'رصيد المتجر')}</div><div class="wc-d">${_rL('Bon valable 12 mois sur tous les articles. +10 % offerts en bonus.', 'Voucher valid for 12 months on all items. +10% bonus included.', 'قسيمة صالحة 12 شهرًا على جميع المنتجات، مع مكافأة إضافية 10 %.')}</div></div>
          </div>
          <div class="wiz-choice" data-channel="cash">
            <div class="wc-ic">${SVG.cash}</div>
            <div><div class="wc-t">${_rL('Espèces / virement', 'Cash / bank transfer', 'نقدًا / تحويل بنكي')}</div><div class="wc-d">${_rL('Disponible immédiatement à la caisse ou sous 48 h par virement.', 'Available immediately at the till or within 48 h by transfer.', 'متاح فورًا في الصندوق أو خلال 48 ساعة بالتحويل.')}</div></div>
          </div>
        </div>
      `,
      foot: `<button class="kb ghost" data-cancel>${_rL('Annuler', 'Cancel', 'إلغاء')}</button>`,
    }).el.addEventListener('click', (e) => {
      const ch = e.target.closest('[data-channel]');
      if (ch) {
        e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
        const labels = { card: _rL('sur la carte d\'origine', 'to the original card', 'على البطاقة الأصلية'), credit: _rL('en crédit boutique +10 %', 'as store credit +10%', 'كرصيد متجر +10 %'), cash: _rL('en espèces à la caisse', 'in cash at the till', 'نقدًا في الصندوق') };
        toast(_rL('Remboursement approuvé', 'Refund approved', 'تمت الموافقة على استرداد المبلغ'), { type: 'success', desc: _rL(`${id || 'Demande'} remboursée ${labels[ch.dataset.channel]}.`, `${id || 'Request'} refunded ${labels[ch.dataset.channel]}.`, `تم استرداد مبلغ ${id || 'الطلب'} ${labels[ch.dataset.channel]}.`), duration: 3500 });
      }
      if (e.target.closest('[data-cancel]')) e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
    });
  };

  handlers['ret-refuse'] = (id) => {
    modal({
      tag: _rL('CONFIRMATION', 'CONFIRMATION', 'تأكيد'),
      title: _rL('Refuser la demande de retour ?', 'Refuse the return request?', 'رفض طلب الإرجاع؟'),
      desc: _rL(`Le client recevra une notification expliquant le motif. Cette action est définitive pour ${id || 'cette demande'}.`, `The customer will be notified of the reason. This is final for ${id || 'this request'}.`, `سيتلقى الزبون إشعارًا بالسبب. هذا الإجراء نهائي بالنسبة إلى ${id || 'هذا الطلب'}.`),
      width: 480,
      body: `
        <div class="kf-group">
          <label class="kf-label">${_rL('Motif du refus (visible par le client)', 'Reason for refusal (visible to the customer)', 'سبب الرفض (يظهر للزبون)')}</label>
          <select class="kf-input">
            <option>${_rL('Article hors fenêtre de retour', 'Item outside the return window', 'المنتج خارج مهلة الإرجاع')}</option>
            <option>${_rL('Étiquette d\'origine manquante', 'Original tag missing', 'البطاقة الأصلية مفقودة')}</option>
            <option>${_rL('Article porté ou lavé', 'Item worn or washed', 'المنتج مرتدى أو مغسول')}</option>
            <option>${_rL('Article personnalisé non retournable', 'Personalised item, non-returnable', 'منتج مخصّص غير قابل للإرجاع')}</option>
            <option>${_rL('Sceau anti-fraude rompu', 'Anti-tamper seal broken', 'ختم مكافحة التلاعب مكسور')}</option>
          </select>
        </div>
      `,
      foot: `<button class="kb ghost" data-cancel>${_rL('Annuler', 'Cancel', 'إلغاء')}</button><button class="kb danger" data-confirm>${SVG.x} ${_rL('Refuser définitivement', 'Refuse permanently', 'رفض نهائي')}</button>`,
    }).el.addEventListener('click', (e) => {
      if (e.target.closest('[data-cancel]')) e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
      if (e.target.closest('[data-confirm]')) {
        e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
        toast(_rL('Demande refusée', 'Request refused', 'تم رفض الطلب'), { type: 'danger', desc: _rL('Notification SMS envoyée au client.', 'SMS notification sent to the customer.', 'تم إرسال إشعار نصي إلى الزبون.'), duration: 3200 });
      }
    });
  };

  handlers['ret-exchange'] = (id) => {
    const items = [
      ['Caftan brodé taille M',     '2 450 MAD', 'En stock · 4'],
      ['Caftan brodé taille L',     '2 450 MAD', 'En stock · 2'],
      ['Caftan brodé taille XL',    '2 600 MAD', 'En stock · 1'],
      ['Caftan brodé col V · M',    '2 700 MAD', 'En stock · 3'],
      ['Caftan brodé Riad · M',     '3 200 MAD', '+ 750 MAD'],
    ];
    modal({
      tag: _rL('ÉCHANGE', 'EXCHANGE', 'استبدال') + ' · ' + (id || '·'),
      title: _rL('Choisir un article de remplacement', 'Choose a replacement item', 'اختر منتجًا بديلًا'),
      desc: _rL('Article retourné : Caftan brodé taille S · 2 450 MAD', 'Item returned: Caftan brodé taille S · 2 450 MAD', 'المنتج المرتجع: Caftan brodé taille S · 2 450 MAD'),
      width: 580,
      body: `
        <div class="kf-group">
          <label class="kf-label">${_rL('Rechercher dans le catalogue', 'Search the catalogue', 'البحث في الكتالوج')}</label>
          <input class="kf-input" placeholder="Caftan brodé, babouches…" value="caftan brodé"/>
        </div>
        <div style="font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase; margin: 14px 0 8px;">${_rL('5 RÉSULTATS', '5 RESULTS', '5 نتائج')}</div>
        <div style="display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto;">
          ${items.map(([n, p, st], idx) => `
            <div class="wiz-choice" data-pick="${idx}" style="padding: 12px 14px;">
              <div class="wc-ic">${SVG.box}</div>
              <div style="flex: 1;">
                <div class="wc-t">${n}</div>
                <div class="wc-d">${st}</div>
              </div>
              <div style="font-family: var(--mono); font-weight: 600; font-size: 13px;">${p}</div>
            </div>
          `).join('')}
        </div>
      `,
      foot: `<button class="kb ghost" data-cancel>${_rL('Annuler', 'Cancel', 'إلغاء')}</button>`,
    }).el.addEventListener('click', (e) => {
      const pick = e.target.closest('[data-pick]');
      if (pick) {
        const idx = +pick.dataset.pick;
        e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
        toast(_rL('Échange enregistré', 'Exchange recorded', 'تم تسجيل الاستبدال'), { type: 'success', desc: _rL(`Nouveau ticket : ${items[idx][0]}. Étiquette d'expédition envoyée par WhatsApp.`, `New receipt: ${items[idx][0]}. Shipping label sent on WhatsApp.`, `إيصال جديد: ${items[idx][0]}. تم إرسال ملصق الشحن عبر واتساب.`), duration: 3600 });
      }
      if (e.target.closest('[data-cancel]')) e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
    });
  };

  handlers['ret-block'] = (name) => {
    const cb = document.querySelector(`input[type="checkbox"][data-action="ret-block"][data-arg="${name}"]`);
    if (!cb) return;
    if (!cb.checked) {
      toast(_rL(`${name} déblocké`, `${name} unblocked`, `تم رفع الحظر عن ${name}`), { type: 'info', duration: 2200 });
      return;
    }
    cb.checked = false;
    modal({
      tag: _rL('CONFIRMATION', 'CONFIRMATION', 'تأكيد'),
      title: _rL(`Bloquer ${name} des retours ?`, `Block ${name} from returns?`, `حظر ${name} من الإرجاع؟`),
      desc: _rL('Les futures demandes seront automatiquement refusées. Le client peut continuer d\'acheter normalement.', 'Future requests will be refused automatically. The customer can keep buying as usual.', 'سيتم رفض الطلبات القادمة تلقائيًا. يمكن للزبون متابعة الشراء بشكل طبيعي.'),
      width: 460,
      foot: `<button class="kb ghost" data-cancel>${_rL('Annuler', 'Cancel', 'إلغاء')}</button><button class="kb danger" data-confirm>${SVG.block} ${_rL('Bloquer', 'Block', 'حظر')}</button>`,
    }).el.addEventListener('click', (e) => {
      if (e.target.closest('[data-cancel]')) {
        e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
      }
      if (e.target.closest('[data-confirm]')) {
        e.target.closest('.kiwi-backdrop').querySelector('.kiwi-modal-close').click();
        cb.checked = true;
        toast(_rL(`${name} bloqué·e des retours`, `${name} blocked from returns`, `تم حظر ${name} من الإرجاع`), { type: 'warn', desc: _rL('Email automatique envoyé.', 'Automatic email sent.', 'تم إرسال بريد إلكتروني تلقائي.'), duration: 3200 });
      }
    });
  };

  handlers['ret-policy-save'] = () => {
    const root = document.getElementById('retPolicy');
    const inputs = root ? root.querySelectorAll('input[type="number"]') : [];
    const win = inputs[0]?.value || '14';
    const fee = inputs[1]?.value || '0';
    toast(_rL('Politique de retour enregistrée', 'Return policy saved', 'تم حفظ سياسة الإرجاع'), { type: 'success', desc: _rL(`Fenêtre ${win} j · restocking ${fee} %. Appliquée aux nouvelles ventes.`, `Window ${win} d · restocking ${fee}%. Applied to new sales.`, `المهلة ${win} يومًا · رسوم إعادة التخزين ${fee} %. تُطبَّق على المبيعات الجديدة.`), duration: 3200 });
  };

  handlers['ret-policy-jump'] = () => {
    const el = document.getElementById('retPolicy');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast(_rL('Politique de retour', 'Return policy', 'سياسة الإرجاع'), { type: 'info', desc: _rL('Modifiez la fenêtre ou les frais de restocking ci-dessous.', 'Edit the window or the restocking fee below.', 'عدّل المهلة أو رسوم إعادة التخزين أدناه.'), duration: 2400 });
  };

  handlers['ret-export'] = () => {
    if (!realReturnsStore()) { toast(_rL('Export retours · CSV en cours', 'Returns export · CSV in progress', 'تصدير المرتجعات · ملف CSV قيد الإعداد'), { type: 'info', desc: _rL('6 demandes · ouvert dans Excel ou Numbers.', '6 requests · opens in Excel or Numbers.', '6 طلبات · يُفتح في Excel أو Numbers.'), duration: 2600 }); return; }
    const rows = _rxRows || [];
    if (!rows.length) { toast(_rL('Aucun retour à exporter', 'No returns to export', 'لا توجد مرتجعات للتصدير'), { type: 'info' }); return; }
    const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = [[_rL('Date', 'Date', 'التاريخ'), _rL('Référence', 'Reference', 'المرجع'), _rL('Article', 'Item', 'المنتج'), _rL('Motif', 'Reason', 'السبب'), _rL('Type', 'Type', 'النوع'), _rL('Client', 'Customer', 'الزبون'), _rL('Employé', 'Employee', 'الموظف'), _rL('Montant MAD', 'Amount MAD', 'المبلغ MAD')].map(cell).join(';')]
      .concat(rows.map((r) => [r.d, r.id, r.name, r.reason, r.kind === 'echange' ? _rL('Échange', 'Exchange', 'استبدال') : _rL('Retour', 'Return', 'مرتجع'), r.client, r.actor, String(Number(r.amt) || 0).replace('.', ',')].map(cell).join(';')))
      .join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'retours-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(_rL('Retours exportés', 'Returns exported', 'تم تصدير المرتجعات'), { type: 'success', desc: _rL(rows.length + ' ligne' + (rows.length > 1 ? 's' : '') + ' · séparateur point-virgule, ouvrable dans Excel.', rows.length + ' row' + (rows.length === 1 ? '' : 's') + ' · semicolon-separated, opens in Excel.', rows.length + ' ' + (rows.length === 1 ? 'سطر' : 'أسطر') + ' · مفصولة بفاصلة منقوطة، تُفتح في Excel.'), duration: 2600 });
  };

  handlers['ret-refund-original'] = () => toast(_rL('Remboursement carte d\'origine', 'Refund to original card', 'استرداد المبلغ إلى البطاقة الأصلية'), { type: 'success', desc: _rL('Crédité en 1-3 jours ouvrés. Confirmation par SMS au client.', 'Credited within 1-3 working days. Confirmation sent to the customer by SMS.', 'يُضاف المبلغ خلال 1-3 أيام عمل. يتلقى الزبون تأكيدًا برسالة نصية.'), duration: 3000 });
  handlers['ret-refund-credit'] = () => toast(_rL('Crédit boutique émis', 'Store credit issued', 'تم إصدار رصيد المتجر'), { type: 'success', desc: _rL('Bon valable 12 mois · +10 % offerts en bonus de fidélité.', 'Voucher valid for 12 months · +10% loyalty bonus.', 'قسيمة صالحة 12 شهرًا · مكافأة ولاء 10 %.'), duration: 3000 });
  handlers['ret-refund-whatsapp'] = () => toast(_rL('Lien WhatsApp envoyé', 'WhatsApp link sent', 'تم إرسال رابط واتساب'), { type: 'success', desc: _rL('Le client recevra un lien sécurisé pour confirmer son IBAN.', 'The customer will get a secure link to confirm their IBAN.', 'سيتلقى الزبون رابطًا آمنًا لتأكيد رقم الحساب البنكي (IBAN).'), duration: 3000 });

})();
