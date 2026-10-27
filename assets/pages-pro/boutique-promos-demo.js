/* Boutique promotions page: the demo campaigns of Maison Mansour (Gueliz),
 * its wizard and its drawers. Moved byte for byte out of
 * assets/pages-pro/boutique-promos-returns.js, which stays the returns page
 * (tools/promos-returns-split-test.mjs holds the proof: the section below is
 * the one the old file carried, between the two markers). A real boutique
 * session paints assets/boutique-promos-dashboard.js instead. Icons are
 * Material Symbols (viewBox 0 -960 960 960, copied from
 * assets/icons/material/), never hand-drawn strokes. */
(() => {
  'use strict';
  if (!window.Kiwi) return;
  const { toast, modal, drawer, handlers } = window.Kiwi;
  const argOf = (el, arg) => (typeof el === 'string' ? el : arg);
  const fmtInt = (n) => (window.KiwiNumber?.format(n, {}) ?? n.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}));
  const msym = (d, px) =>
    `<svg width="${px}" height="${px}" viewBox="0 -960 960 960" fill="currentColor"><path d="${d}"/></svg>`;
  const SVG = {
    /* sell.svg · redeem.svg · inventory_2.svg · receipt_long.svg */
    discount: msym('M856-390 570-104q-12 12-27 18t-30 6q-15 0-30-6t-27-18L103-457q-11-11-17-25.5T80-513v-287q0-33 23.5-56.5T160-880h287q16 0 31 6.5t26 17.5l352 353q12 12 17.5 27t5.5 30q0 15-5.5 29.5T856-390ZM513-160l286-286-353-354H160v286l353 354ZM260-640q25 0 42.5-17.5T320-700q0-25-17.5-42.5T260-760q-25 0-42.5 17.5T200-700q0 25 17.5 42.5T260-640Zm220 160Z', 18),
    code:     msym('M160-280v80h640v-80H160Zm0-440h88q-5-9-6.5-19t-1.5-21q0-50 35-85t85-35q30 0 55.5 15.5T460-826l20 26 20-26q18-24 44-39t56-15q50 0 85 35t35 85q0 11-1.5 21t-6.5 19h88q33 0 56.5 23.5T880-640v440q0 33-23.5 56.5T800-120H160q-33 0-56.5-23.5T80-200v-440q0-33 23.5-56.5T160-720Zm0 320h640v-240H596l84 114-64 46-136-184-136 184-64-46 82-114H160v240Zm228.5-331.5Q400-743 400-760t-11.5-28.5Q377-800 360-800t-28.5 11.5Q320-777 320-760t11.5 28.5Q343-720 360-720t28.5-11.5ZM600-720q17 0 28.5-11.5T640-760q0-17-11.5-28.5T600-800q-17 0-28.5 11.5T560-760q0 17 11.5 28.5T600-720Z', 18),
    bundle:   msym('M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z', 18),
    tax:      msym('M240-80q-50 0-85-35t-35-85v-120h120v-560l60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60v680q0 50-35 85t-85 35H240Zm480-80q17 0 28.5-11.5T760-200v-560H320v440h360v120q0 17 11.5 28.5T720-160ZM360-600v-80h240v80H360Zm0 120v-80h240v80H360Zm320-120q-17 0-28.5-11.5T640-640q0-17 11.5-28.5T680-680q17 0 28.5 11.5T720-640q0 17-11.5 28.5T680-600Zm0 120q-17 0-28.5-11.5T640-520q0-17 11.5-28.5T680-560q17 0 28.5 11.5T720-520q0 17-11.5 28.5T680-480ZM240-160h360v-80H200v40q0 17 11.5 28.5T240-160Zm-40 0v-80 80Z', 18),
    /* notifications.svg · add.svg · pause.svg · edit.svg · chevron_right.svg · check.svg */
    bell:     msym('M160-200v-80h80v-280q0-83 50-147.5T420-792v-28q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820v28q80 20 130 84.5T720-560v280h80v80H160Zm320-300Zm0 420q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80ZM320-280h320v-280q0-66-47-113t-113-47q-66 0-113 47t-47 113v280Z', 18),
    plus:     msym('M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z', 13),
    pause:    msym('M520-200v-560h240v560H520Zm-320 0v-560h240v560H200Zm400-80h80v-400h-80v400Zm-320 0h80v-400h-80v400Zm0-400v400-400Zm320 0v400-400Z', 13),
    edit:     msym('M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z', 13),
    chev:     msym('M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z', 14),
    check:    msym('M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z', 13),
  };

/* ── moved section begins ── */
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
                  <button data-activation=write class="kb ghost" style="padding: 5px 10px; font-size: 11.5px;" data-action="${p.scheduled ? 'promo-edit' : 'promo-pause'}" data-arg="${p.id}" data-bubble="stop">
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

  handlers['promo-segment'] = (el, arg) => {
    const id = argOf(el, arg);
    const btn = document.querySelector(`[data-action="promo-segment"][data-arg="${id}"]`);
    if (!btn) return;
    btn.classList.toggle('on');
    const isOn = btn.classList.contains('on');
    const name = btn.querySelector('span')?.textContent || id;
    toast(`Segment "${name}" ${isOn ? 'activé' : 'désactivé'}`, { type: isOn ? 'success' : 'info', duration: 1800 });
  };

  handlers['promo-archive-detail'] = (el, arg) => {
    const name = argOf(el, arg);
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

/* ── moved section ends ── */
})();
