/* Owner: dashboard cards. Exports: renderMix, renderMixPlan, renderSettle, renderPairs, renderInteg, renderNotifBadge, renderEvening, renderStock, renderTimeline, renderHealth, renderBench, renderProducts, renderStaff, realMixRows, realLowStock, realTopProducts, realPairs, growBars.
 * Sibling calls via live owner: rangeBounds.
 * Reads live owner: BENCH_CITY, BENCH_EMPTY, BENCH_LBL, BENCH_PEER, BENCH_RANK_SUB, BENCH_SUB, BENCH_TITLE_FALLBACK, EVENING_EMPTY, HEALTH_CHIP, HEALTH_EMPTY, HEALTH_SUB, INTEG_LIST, INTEG_NOTCONN, INTEG_SUB, INTEG_TITLE, LOWSTK_STR, LOW_STOCK_SEUIL, MIX_CENTER_ALL, MIX_EMPTY, PAIRS_MAX_KEYS, PAIRS_MIN_BASKETS, PAIRS_MIN_TOGETHER, PAIRS_STR, PLAN_ACTIVE, PLAN_NAME, PLAN_PENDING, PRODUCTS_COVERAGE, PRODUCTS_EMPTY, PRODUCTS_MANAGE, PRODUCTS_NO_LINES, PRODUCTS_SUB, PRODUCTS_TITLE, PRODUCT_SOLD, RANGE_STR, REAL_MIX, RUPTURE_STR, SETTLE_DETAIL_LBL, SETTLE_LBL, STAFF_EMPTY, STAFF_ONDUTY_STR, STAFF_SUB, STAFF_TITLE, STOCK_EMPTY, STOCK_NO_THRESHOLDS, STOCK_OK_STR, STOCK_SUB_STR, STOCK_TITLE_STR, _benchOrig, _eveningOrig, _healthOrig, _integOrig, _stockOrig, activeMerchantSlug, animateNumber, benchByVenue, curUnit, currentRange, demoRole, dutyBand, effRange, emptyBlockBody, emptyListBody, escTxt, fmtHeures, fmtSettleAmount, frInt, frMoney, getCurrentVenue, getLang, growBars, healthByVenue, merchantDayBounds, merchantDayKey, mixByVenue, ownData, parseAmountFromEl, parseIntFromEl, productsByVenue, realLowStock, realMixRows, realPairs, realRefundList, realRoster, realSalesList, realSalesTotals, realTopProducts, renderMixPlan, renderPairs, retailBand, settleByVenue, staffByVenue, tenderAmounts, tenderBucket, timelineWeekTotalByVenue, trStr, tradeStr, vData.
 * Reads globalThis: KiwiZoneLaw.
 * Reads window: KiwiBoutiqueCatalog, KiwiBoutiqueVenueKey, KiwiConfig, KiwiEnv, KiwiI18n, KiwiReservations, KiwiRestaurantStock, KiwiSales, KiwiVenue, matchMedia. No state is copied. */
(function () {
  'use strict';
  const registry = window.__kiwiHomeRenderers || (window.__kiwiHomeRenderers = Object.create(null));
  registry['cards'] = function (__state) {
  function rangeBounds(...args) { return __state.rangeBounds.apply(this, args); }
function renderMix() {
    const effective = __state.effRange();
    const data = __state.vData(__state.mixByVenue, __state.currentRange);
    if (!data) return;
    const lang = __state.getLang();

    // Real and active-demo venues both render tenders actually in their ledger.
    // The static preview is only a fallback when no demo clock is running.
    const custom = !!(__state.ownData() && window.KiwiSales);
    __state.renderMixPlan(custom, lang);
    const real = custom ? __state.realMixRows(lang, __state.currentRange) : null;
    const rows = custom ? real.rows : data._demoLedger ? data.mixRows : [
      { color: '#0B6E4F', label: 'Visa',       pct: data.visa },
      { color: '#46A878', label: 'Mastercard', pct: data.mc   },
      { color: '#7DF2B0', label: 'Kiwi Tap',   pct: data.tap  },
      { color: '#D99A2B', label: 'QR',         pct: data.qr   },
    ];
    const rawCenterMad = custom ? real.total : data.centerMad;
    const centerMad = Number.isFinite(Number(rawCenterMad)) ? Number(rawCenterMad) : 0;

    const donut = document.querySelector('[data-mix-donut]');
    if (donut) {
      // Segments draw clockwise from 12 o'clock. Each segment carries its FINAL
      // dashoffset from the start; only stroke-dasharray animates from "0 100" → "P 100".
      // Clockwise from 12 o'clock. pathLength=100 → dash/offset are exact
      // percentages; a hairline GAP between segments keeps them legible. A
      // light→deep green ramp + amber makes all four methods distinguishable.
      const GAP = 1.6;
      const SW = 2.89;
      let acc = 0;
      const segs = rows.map((r) => {
        const pct = r.pct || 0;
        const seg = { stroke: r.color, pct, dash: Math.max(0, pct - GAP), offset: 25 - acc };
        acc += pct;
        return seg;
      });
      /* The built DOM caches one <circle> per segment, addressed by index. A real
       * store's tender set grows as it takes its first card or QR payment, so the
       * cached ring must be discarded whenever the shape changes — otherwise the
       * new tranche would have no element to draw into. */
      const sig = segs.map((s) => s.stroke).join('|');
      if (donut.dataset.sig !== sig) donut.dataset.built = '';
      donut.dataset.sig = sig;
      const built = donut.dataset.built === '1';
      const STAGGER_MS = 150;
      const FILL_MS = 850; // matches CSS transition duration

      if (!built) {
        donut['inner' + 'HTML'] = `
          <circle class="track" cx="21" cy="21" r="15.9155" fill="transparent" stroke="#EBE8E0" stroke-width="${SW}" pathLength="100"/>
          ${segs.map((s, i) => `
            <circle class="seg" data-seg="${i}"
              cx="21" cy="21" r="15.9155" fill="transparent"
              stroke="${s.stroke}" stroke-width="${SW}" pathLength="100"
              stroke-dasharray="0 100"
              stroke-dashoffset="${s.offset}"
              stroke-linecap="butt"/>
          `).join('')}
        `;
        donut.dataset.built = '1';
        // Initial entrance: segments wipe in clockwise, sequentially from visa → qr.
        segs.forEach((s, i) => {
          setTimeout(() => {
            const el = donut.querySelector(`[data-seg="${i}"]`);
            if (el) el.setAttribute('stroke-dasharray', `${s.dash} ${100 - s.dash}`);
          }, 80 + i * STAGGER_MS);
        });
      } else {
        // Range change: stagger the per-segment update so the user sees the donut
        // redistribute sector by sector rather than morph all 4 at once (too subtle).
        segs.forEach((s, i) => {
          const el = donut.querySelector(`[data-seg="${i}"]`);
          if (!el) return;
          el.setAttribute('stroke', s.stroke);
          setTimeout(() => {
            el.setAttribute('stroke-dasharray', `${s.dash} ${100 - s.dash}`);
            el.setAttribute('stroke-dashoffset', String(s.offset));
          }, i * STAGGER_MS);
        });
      }

      // Center text re-fade on every render (load + range change). Force a reflow
      // between the .in removal and re-add so the transition actually replays.
      const ringCenter = donut.parentElement?.querySelector('.ring-center');
      if (ringCenter) {
        ringCenter.classList.remove('in');
        // eslint-disable-next-line no-unused-expressions
        ringCenter.offsetWidth; // force reflow
        const startOffset = built ? 0 : 80;
        const totalMs = startOffset + (segs.length - 1) * STAGGER_MS + FILL_MS - 280;
        setTimeout(() => ringCenter.classList.add('in'), totalMs);
      }
    }

    const center = document.querySelector('[data-mix-center-amt]');
    if (center) __state.animateNumber(center, __state.parseAmountFromEl(center), centerMad, { duration: 700, format: v => __state.frMoney(v) });

    /* On retire data-i18n côté venue réelle, sinon i18n.js réimposerait la
     * légende démo au prochain changement de langue ; on le remet pour la démo
     * afin qu'un retour en arrière retrouve sa traduction. */
    const centerUnit = center && center.parentElement
      ? center.parentElement.querySelector('.slash') : null;
    if (centerUnit) {
      if (custom || data._demoLedger) {
        centerUnit.removeAttribute('data-i18n');
        centerUnit.textContent = __state.MIX_CENTER_ALL[lang] || __state.MIX_CENTER_ALL.fr;
      } else {
        const T = window.KiwiI18n?.T?.[lang] || {};
        centerUnit.setAttribute('data-i18n', 'dash.mix.center.unit');
        centerUnit.textContent = T['dash.mix.center.unit'] || 'MAD carte';
      }
    }

    const sub = document.querySelector('[data-mix-sub]');
    if (sub) sub.textContent = __state.RANGE_STR[lang]?.[__state.currentRange] || __state.RANGE_STR.fr[__state.currentRange];

    const legend = document.querySelector('[data-mix-legend]');
    if (legend) {
      // No sales yet is a real answer — say so, rather than print rails at 0 %.
      if (!rows.length) {
        legend.innerHTML = `<div class="li"><div class="n" style="color:var(--n-500,#77807b);">${__state.MIX_EMPTY[lang] || __state.MIX_EMPTY.fr}</div></div>`;
        legend.dataset.built = '';
        legend.dataset.sig = '';
        return;
      }
      // Rows are addressed by label, so a changed tender set needs a fresh build.
      const lsig = rows.map((r) => r.label).join('|');
      if (legend.dataset.sig !== lsig) legend.dataset.built = '';
      legend.dataset.sig = lsig;
      const built = legend.dataset.built === '1';
      if (!built) {
        legend.innerHTML = rows.map(r =>
          `<div class="li"><div class="n"><i style="background:${r.color};"></i>${r.label}</div><div class="v" data-mix-pct="${r.label}">0 %</div></div>`
        ).join('');
        legend.dataset.built = '1';
      }
      rows.forEach(r => {
        const el = legend.querySelector(`[data-mix-pct="${r.label}"]`);
        if (!el) return;
        const from = parseInt((el.textContent || '').replace(/\D/g, ''), 10) || 0;
        __state.animateNumber(el, from, r.pct, { duration: 600, format: v => `${Math.round(v)} %` });
      });
    }
  }
function renderMixPlan(custom, lang) {
    const label = document.querySelector('[data-mix-plan-name]');
    const status = document.querySelector('[data-mix-plan-status]');
    if (!label || !status) return;
    if (document.documentElement.classList.contains('kiwi-native')) {
      label.removeAttribute('data-i18n'); status.removeAttribute('data-i18n');
      label.textContent = 'Kiwi Pro';
      status.textContent = ({fr:'Votre espace de travail', en:'Your workspace', ar:'مساحة عملك'})[lang] || 'Kiwi Pro';
      return;
    }
    if (!custom) {
      label.setAttribute('data-i18n', 'dash.mix.subscription');
      status.setAttribute('data-i18n', 'dash.mix.subscription.price');
      /* The keys stay on the nodes for the next language switch, but this
         render runs after i18n has applied them: writing the French original
         here left « 399 MAD/mois · tout inclus » under English and Arabic. */
      const T = (window.KiwiI18n && window.KiwiI18n.T && window.KiwiI18n.T[lang]) || {};
      label.textContent = T['dash.mix.subscription'] || 'Abonnement Kiwi Pro';
      status.textContent = T['dash.mix.subscription.price'] || '399 MAD/mois · tout inclus';
      return;
    }
    label.removeAttribute('data-i18n');
    status.removeAttribute('data-i18n');
    const raw = String(window.KiwiConfig?.plan || '').toLowerCase();
    label.textContent = __state.PLAN_NAME[raw] ? `Kiwi ${__state.PLAN_NAME[raw]}` : 'Abonnement Kiwi';
    status.textContent = __state.PLAN_NAME[raw]
      ? (__state.PLAN_ACTIVE[lang] || __state.PLAN_ACTIVE.fr)
      : (__state.PLAN_PENDING[lang] || __state.PLAN_PENDING.fr);
  }
function renderSettle() {
    const lang = __state.getLang();
    const effective = __state.effRange();
    const data = __state.vData(__state.settleByVenue, __state.currentRange);
    if (!data) return;

    const lblEl = document.querySelector('[data-settle-lbl]');
    if (lblEl) lblEl.textContent = __state.SETTLE_LBL[lang]?.[__state.currentRange] || __state.SETTLE_LBL.fr[__state.currentRange];

    const amtEl = document.querySelector('[data-settle-amt]');
    if (amtEl) __state.animateNumber(amtEl, __state.parseIntFromEl(amtEl), data.amt, { duration: 800, format: __state.fmtSettleAmount });

    const subEl = document.querySelector('[data-settle-sub]');
    if (subEl) subEl.textContent = data.sub;

    const detailEl = document.querySelector('[data-settle-detail]');
    if (detailEl) {
      detailEl.innerHTML = `
        <span>${__state.SETTLE_DETAIL_LBL[lang] || __state.SETTLE_DETAIL_LBL.fr}</span>
        <span style="color: var(--mint); font-family: var(--mono);">${data.detailVal}</span>
      `;
    }
  }
function renderPairs(card, isCustom, lang) {
    const host = card && card.querySelector('[data-products-pairs]');
    if (!host) return;
    const p = isCustom ? __state.realPairs(__state.currentRange) : null;
    if (!p || !p.baskets) { host.hidden = true; host.replaceChildren(); return; }
    const S = __state.PAIRS_STR[lang] || __state.PAIRS_STR.fr;
    const head = `<div class="pp-t">${__state.escTxt(S.t)}</div>`;
    if (p.baskets < __state.PAIRS_MIN_BASKETS) {
      host.innerHTML = head + `<div class="pp-wait">${__state.escTxt(S.wait(__state.frInt(p.baskets), __state.frInt(__state.PAIRS_MIN_BASKETS)))}</div>`;
    } else if (!p.rows.length) {
      host.innerHTML = head + `<div class="pp-wait">${__state.escTxt(S.none(__state.frInt(p.baskets)))}</div>`;
    } else {
      host.innerHTML = head + p.rows.map((r) => `
        <div class="pp-row">
          <div class="pp-n">${__state.escTxt(r.lead)}<span class="pp-plus" aria-hidden="true">+</span>${__state.escTxt(r.other)}</div>
          <div class="pp-why">${__state.escTxt(S.why(__state.frInt(r.together), __state.frInt(Math.round(r.share * 100)), r.lead))}</div>
        </div>`).join('');
    }
    host.hidden = false;
  }
function renderInteg() {
    const card = document.querySelector('[data-integ-card]');
    if (!card) return;
    if (__state._integOrig == null) __state._integOrig = card['inner' + 'HTML'];
    if (__state.ownData()) {
      const lang = __state.getLang();
      const notConn = __state.INTEG_NOTCONN[lang] || __state.INTEG_NOTCONN.fr;
      const addLbl = (window.KiwiI18n?.t?.('dash.integ.add')) || '+ Ajouter une intégration';
      const cards = __state.INTEG_LIST.map(it =>
        `<div class="integ-card" data-action="${it.channel ? 'integration-connect' : 'add-integration'}"` +
        ` data-arg="${it.n}" data-channel="${it.channel || ''}">` +
        `<div class="logo" style="background:${it.bg};opacity:.55;">${it.logo}</div>` +
        `<div class="info"><div class="n">${it.n}</div>` +
        `<div class="s"><span class="dot warn"></span><span>${notConn}</span></div></div></div>`
      ).join('');
      card['inner' + 'HTML'] =
        `<div class="block-head"><div>` +
        `<div class="t">${__state.INTEG_TITLE[lang] || __state.INTEG_TITLE.fr}</div>` +
        `<div class="s">${__state.INTEG_SUB[lang] || __state.INTEG_SUB.fr}</div></div>` +
        `<a data-activation=write href="#" data-action="add-integration" style="font-size:13px;color:var(--atlas);font-weight:500;">${addLbl}</a>` +
        `</div><div class="integ-grid">${cards}</div>`;
    } else if (__state._integOrig != null && card['inner' + 'HTML'] !== __state._integOrig) {
      card['inner' + 'HTML'] = __state._integOrig;
    }
  }
function renderNotifBadge() {
    const b = document.querySelector('[data-notif-badge]');
    if (!b) return;
    b.style.display = __state.ownData() ? 'none' : '';
  }
function renderEvening() {
    const el = document.querySelector('[data-evening-card]');
    if (!el) return;
    if (__state._eveningOrig == null) __state._eveningOrig = el['inner' + 'HTML'];
    if (__state.ownData()) {
      const lang = __state.getLang();
      const t = __state.tradeStr('eveningEmpty', __state.EVENING_EMPTY[lang] || __state.EVENING_EMPTY.fr);
      /* Pharmacie : ce soir = la garde (fiches « Gardes & relève », que la caisse ouvre et ferme),
         pas des réservations de tables. */
      const dutyHtml = __state.dutyBand(lang, t) || __state.retailBand(lang, t);
      if (dutyHtml) { el['inner' + 'HTML'] = dutyHtml; return; }
      let doc = null;
      try { doc = window.KiwiReservations?.get?.(); } catch (_) {}
      const now = Date.now(), currentDay = __state.merchantDayKey(now, __state.activeMerchantSlug()), currentWindow = __state.merchantDayBounds(currentDay, __state.activeMerchantSlug()), start = currentWindow.from, end = currentWindow.to;
      const active = doc && Array.isArray(doc.bookings) ? doc.bookings.filter((b) =>
        ['requested', 'confirmed', 'checked_in'].includes(b.status) && +b.startAt >= start && +b.startAt < end && +b.endAt >= now
      ).sort((a, b) => +a.startAt - +b.startAt) : [];
      if (active.length) {
        const covers = active.reduce((n, b) => n + Math.max(1, +b.partySize || 1), 0);
        const resource = new Map((doc.resources || []).map((r) => [String(r.id), r.name]));
        const labels = {
          fr: { lbl: 'RÉSERVATIONS À VENIR · AUJOURD’HUI', unit: 'couverts', sub: (n) => `${n} réservation${n > 1 ? 's actives' : ' active'}`, pending: 'À confirmer', confirmed: 'Confirmée', checked_in: 'Arrivé', open: 'Ouvrir Réservations', more: (n) => `+${n} autre${n > 1 ? 's' : ''}` },
          en: { lbl: 'UPCOMING BOOKINGS · TODAY', unit: 'guests', sub: (n) => `${n} active booking${n > 1 ? 's' : ''}`, pending: 'Pending', confirmed: 'Confirmed', checked_in: 'Checked in', open: 'Open Reservations', more: (n) => `+${n} more` },
          ar: { lbl: 'الحجوزات القادمة · اليوم', unit: 'ضيف', sub: (n) => `${n} حجوزات نشطة`, pending: 'في انتظار التأكيد', confirmed: 'مؤكد', checked_in: 'وصل', open: 'فتح الحجوزات', more: (n) => `+${n} أخرى` },
        }[lang] || null;
        const L = labels || { lbl: 'RÉSERVATIONS À VENIR · AUJOURD’HUI', unit: 'couverts', sub: (n) => `${n} réservations actives`, pending: 'À confirmer', confirmed: 'Confirmée', checked_in: 'Arrivé', open: 'Ouvrir Réservations', more: (n) => `+${n} autres` };
        el['inner' + 'HTML'] = `<div class="lbl">${L.lbl}</div>` +
          `<div class="big">${covers} <span style="font-size:.42em;opacity:.72;">${L.unit}</span></div>` +
          `<div class="sub">${L.sub(active.length)}</div>` +
          `<div style="margin-top:16px;padding-top:12px;border-top:1px solid color-mix(in srgb,currentColor 14%,transparent);display:flex;flex-direction:column;gap:9px;">` +
          active.slice(0, 3).map((b) => {
            const status = b.status === 'requested' ? L.pending : (L[b.status] || L.confirmed);
            const at = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(lang === 'ar' ? 'ar-MA' : lang === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(+b.startAt));
            const place = resource.get(String(b.resourceId));
            return `<div style="display:grid;grid-template-columns:48px 1fr auto;gap:9px;align-items:center;font-size:12px;">` +
              `<span style="font-family:var(--mono);color:var(--mint);font-weight:600;">${__state.escTxt(at)}</span>` +
              `<div style="min-width:0;"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${__state.escTxt(b.customer?.name)}</div>` +
              `<div style="opacity:.7;margin-top:1px;">${Math.max(1, +b.partySize || 1)} ${L.unit}${place ? ` · ${__state.escTxt(place)}` : ''}</div></div>` +
              `<span style="font-size:11px;opacity:.7;">${status}</span></div>`;
          }).join('') + `</div>` +
          `<div class="instant" data-action="nav-reservations"><div class="ico"><svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="m612-292 56-56-148-148v-184h-80v216l172 172ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-400Zm0 320q133 0 226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160Z"/></svg></div>` +
          `<div style="font-weight:500;">${L.open}</div><div class="cost">${active.length > 3 ? L.more(active.length - 3) : ''}</div></div>`;
      } else {
        const configured = !!(doc && doc.settings && doc.services?.length && doc.resources?.length);
        const head = configured ? t.head : ({ fr: 'Réservations non configurées', en: 'Bookings not configured', ar: 'الحجوزات غير مهيأة' }[lang]);
        const msg = configured ? t.msg : ({ fr: 'Ajoutez vos tables et vos horaires pour recevoir des réservations.', en: 'Add tables and opening hours to accept bookings.', ar: 'أضف الطاولات وساعات العمل لاستقبال الحجوزات.' }[lang]);
        el['inner' + 'HTML'] = `<div class="lbl">${t.lbl}</div><div style="padding:28px 4px 8px;text-align:center;">` +
          `<div style="font-size:14px;font-weight:600;">${head}</div>` +
          `<div style="font-size:12px;opacity:.7;margin-top:6px;line-height:1.5;">${msg}</div></div>` +
          `<div class="instant" data-action="nav-reservations"><div style="font-weight:500;">${lang === 'en' ? 'Open Reservations' : lang === 'ar' ? 'فتح الحجوزات' : 'Ouvrir Réservations'}</div></div>`;
      }
    } else if (el['inner' + 'HTML'] !== __state._eveningOrig) {
      el['inner' + 'HTML'] = __state._eveningOrig;
    }
  }
function renderStock() {
    const el = document.querySelector('[data-stock-card]');
    if (!el) return;
    if (__state._stockOrig == null) __state._stockOrig = el['inner' + 'HTML'];
    if (__state.ownData()) {
      const lang = __state.getLang();
      const t = __state.tradeStr('stockEmpty', __state.STOCK_EMPTY[lang] || __state.STOCK_EMPTY.fr);
      /* L'accueil porte DEUX cartes « Stock à recommander » : celle-ci, dans la
       * colonne de droite, et la liste [data-products-list]. Seule la seconde
       * avait été rebranchée sur le catalogue — le commerçant lisait donc
       * « Aucune alerte de stock » à droite pendant que la gauche affichait
       * l'article sous le seuil. Même source, même seuil, plus de contradiction. */
      const low = __state.realLowStock();
      if (low && low.rows.length) {
        el['inner' + 'HTML'] =
          `<div class="block-head" style="margin-bottom:6px;"><div>` +
          `<div class="t">${__state.STOCK_TITLE_STR[lang] || __state.STOCK_TITLE_STR.fr}</div>` +
          `<div class="s">${(__state.STOCK_SUB_STR[lang] || __state.STOCK_SUB_STR.fr)(low.rows.length)}</div>` +
          `</div></div>` +
          low.rows.map((r) => {
            const dead = r.stock === 0;
            return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;` +
              `padding:9px 2px;border-top:1px solid var(--n-200);">` +
              `<div style="min-width:0;">` +
              `<div style="font-size:13px;font-weight:500;color:var(--ink);overflow:hidden;` +
              `text-overflow:ellipsis;white-space:nowrap;">${__state.escTxt(r.name)}</div>` +
              `<div style="font-size:11.5px;margin-top:2px;color:${dead ? 'var(--danger)' : 'var(--n-500)'};">` +
              `${dead ? (__state.RUPTURE_STR[lang] || __state.RUPTURE_STR.fr) : (__state.LOWSTK_STR[lang] || __state.LOWSTK_STR.fr)(r.threshold)}</div>` +
              `</div>` +
              `<div style="text-align:right;font-family:var(--mono);color:${dead ? 'var(--danger)' : 'var(--ink)'};">` +
              `<div style="font-size:14px;font-weight:600;">${r.stock} ${__state.escTxt(r.unit || '')}</div>` +
              `${r.suggested ? `<div style="font-size:11px;color:var(--n-500);">+${r.suggested} ${__state.escTxt(r.unit)}${r.cost ? ` · ${__state.frInt(r.suggested * r.cost)} ${__state.curUnit()}` : ''}</div>` : ''}</div>` +
              `</div>`;
          }).join('');
        el['inner' + 'HTML'] += `<a href="#" data-action="nav-stock" style="display:block;margin-top:12px;text-align:center;font-size:12.5px;color:var(--atlas);font-weight:600;">${lang === 'en' ? 'Open inventory & purchasing →' : lang === 'ar' ? 'فتح المخزون والمشتريات ←' : 'Ouvrir Stock & approvisionnement →'}</a>`;
        return;
      }
      el['inner' + 'HTML'] =
        `<div class="block-head" style="margin-bottom:14px;"><div>` +
        `<div class="t">${t.title}</div></div></div>` +
        `<div style="padding:16px 8px 12px;text-align:center;">` +
        `<div style="width:36px;height:36px;border-radius:10px;background:rgba(63,182,122,0.12);color:var(--mint);display:inline-flex;align-items:center;justify-content:center;margin-bottom:10px;">` +
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>` +
        `</div>` +
        `<div style="font-size:14px;font-weight:600;color:var(--ink);">${t.head}</div>` +
        `<div style="font-size:12px;color:var(--n-500);margin-top:6px;line-height:1.5;max-width:280px;margin-inline:auto;">${low && !low.configured ? (__state.STOCK_NO_THRESHOLDS[lang] || __state.STOCK_NO_THRESHOLDS.fr)(low.tracked) : low ? (__state.STOCK_OK_STR[lang] || __state.STOCK_OK_STR.fr)(low.tracked) : t.msg}</div>` +
        `</div>`;
    } else if (el['inner' + 'HTML'] !== __state._stockOrig) {
      el['inner' + 'HTML'] = __state._stockOrig;
    }
  }
function renderTimeline() {
    const effective = __state.effRange();
    const totalEl = document.querySelector('[data-timeline-week-total]');
    if (!totalEl) return;
    /* Le repli `|| timelineWeekTotalByVenue.cafeAtlas` servait le total du CAFÉ
     * ATLAS à tout commerçant absent de cette table — c'est-à-dire à tous les
     * vrais. Ce n'était pas un état vide, c'était le chiffre d'affaires de
     * quelqu'un d'autre affiché comme le sien. Une venue réelle additionne ses
     * propres ventes ; le tilde disparaît, ce total-là est exact. */
    if (__state.ownData() && window.KiwiSales) {
      totalEl.textContent = `${__state.frInt(__state.realSalesTotals(__state.currentRange).revenue)} ${__state.curUnit()}`;
      return;
    }
    const total = (__state.timelineWeekTotalByVenue[__state.getCurrentVenue()] || __state.timelineWeekTotalByVenue.cafeAtlas)[effective];
    if (total) totalEl.textContent = total;
  }
function renderHealth() {
    const lang = __state.getLang();
    const card = document.querySelector('[data-health-card]');
    if (card && __state._healthOrig == null) __state._healthOrig = card['inner' + 'HTML'];
    if (__state.ownData()) {
      if (card) {
        const t = __state.HEALTH_EMPTY[lang] || __state.HEALTH_EMPTY.fr;
        card.hidden = true;
        card.classList.add('is-empty-state');
        card['inner' + 'HTML'] =
          `<div class="block-head"><div><div class="t">${t.title}</div></div></div>` +
          __state.emptyBlockBody(t.head, t.msg);
      }
      return;
    }
    if (card) {
      card.hidden = false;
      card.classList.remove('is-empty-state');
      if (__state._healthOrig != null && card['inner' + 'HTML'] !== __state._healthOrig) card['inner' + 'HTML'] = __state._healthOrig;
    }
    const effective = __state.effRange();
    const data = __state.vData(__state.healthByVenue, __state.currentRange);
    if (!data) return;

    const subEl = document.querySelector('[data-health-sub]');
    if (subEl) subEl.textContent = __state.HEALTH_SUB[lang]?.[__state.currentRange] || __state.HEALTH_SUB.fr[__state.currentRange];

    const chipEl = document.querySelector('[data-health-chip]');
    if (chipEl) chipEl.textContent = __state.HEALTH_CHIP[lang]?.[data.chipKey] || __state.HEALTH_CHIP.fr[data.chipKey];

    const scoreEl = document.querySelector('[data-health-score]');
    if (scoreEl) __state.animateNumber(scoreEl, __state.parseIntFromEl(scoreEl), data.score, { duration: 700, format: v => `${Math.round(v)}` });

    const arc = document.querySelector('[data-health-arc]');
    if (arc) arc.setAttribute('stroke-dasharray', `${data.score} 100`);
  }
function renderBench() {
    const lang = __state.getLang();
    const card = document.querySelector('[data-bench-card]');
    if (card && __state._benchOrig == null) __state._benchOrig = card['inner' + 'HTML'];
    /* "#12 sur 147 cafés à Casablanca · top 8 %" is a cohort Kiwi does not
     * have. It is fine in the demo, where every number is openly a rehearsal,
     * and it is not fine anywhere else — an invented peer benchmark is worse
     * than an invented figure, because it reads like data somebody else
     * collected and a merchant reasonably prices against it. The gate was
     * isCustom() alone, which left the real-but-not-custom session showing a
     * ranking among 147 cafés that were never counted. */
    if (__state.ownData() || window.KiwiEnv?.isReal?.()) {
      if (card) {
        const t = __state.BENCH_EMPTY[lang] || __state.BENCH_EMPTY.fr;
        card.hidden = true;
        card.classList.add('is-empty-state');
        card['inner' + 'HTML'] =
          `<div class="block-head"><div><div class="t">${t.title}</div></div></div>` +
          __state.emptyBlockBody(t.head, t.msg);
      }
      return;
    }
    if (card) {
      card.hidden = false;
      card.classList.remove('is-empty-state');
      if (__state._benchOrig != null && card['inner' + 'HTML'] !== __state._benchOrig) card['inner' + 'HTML'] = __state._benchOrig;
    }
    const effective = __state.effRange();
    const data = __state.vData(__state.benchByVenue, __state.currentRange);
    if (!data) return;

    // Title + sub vary by venue type (cafés / boutiques / spas similaires)
    const benchLabels = window.KiwiVenue?.getBenchLabels?.() || { title: __state.BENCH_TITLE_FALLBACK[lang] || __state.BENCH_TITLE_FALLBACK.fr, sub: __state.BENCH_SUB.fr[__state.currentRange] };
    const titleEl = document.querySelector('[data-bench-title]');
    if (titleEl) titleEl.textContent = benchLabels.title;
    const subEl = document.querySelector('[data-bench-sub]');
    if (subEl) subEl.textContent = benchLabels.sub || __state.BENCH_SUB[lang]?.[__state.currentRange] || __state.BENCH_SUB.fr[__state.currentRange];

    const rankEl = document.querySelector('[data-bench-rank]');
    if (rankEl) __state.animateNumber(rankEl, __state.parseIntFromEl(rankEl), data.rank, { duration: 650, format: v => `#${Math.round(v)}` });

    // Match the rank-sub wording to the vertical
    const venueType = window.KiwiVenue?.getVenueType?.() || 'restaurant';
    const peerLabel = (__state.BENCH_PEER[lang] || __state.BENCH_PEER.fr)[venueType] || (__state.BENCH_PEER[lang] || __state.BENCH_PEER.fr).restaurant;
    const cityLabel = (__state.BENCH_CITY[lang] || __state.BENCH_CITY.fr)[venueType === 'spa' ? 'spa' : 'default'];
    const rankSubEl = document.querySelector('[data-bench-rank-sub]');
    if (rankSubEl) rankSubEl['inner' + 'HTML'] = (__state.BENCH_RANK_SUB[lang] || __state.BENCH_RANK_SUB.fr)(data.total, peerLabel, cityLabel, data.top);

    const comp = document.querySelector('[data-bench-comp]');
    if (comp) {
      comp.innerHTML = data.rows.map((r, i) => `
        <div class="bench-row" style="--i:${i};">
          <div class="lbl">${__state.trStr(r.lbl, __state.BENCH_LBL)}</div>
          <div class="bench-bar">
            <div class="you" style="width: 0%;" data-grow="${r.you}%"></div>
            <div class="peer" style="left: ${r.peer}%;"></div>
          </div>
          <div class="v"${r.warn ? ' style="color: var(--warning);"' : ''}>${r.v}</div>
        </div>
      `).join('');
      __state.growBars(comp);
    }
  }
function renderProducts() {
    const lang = __state.getLang();
    const effective = __state.effRange();
    const isCustom = __state.ownData();
    const data = isCustom ? [] : __state.vData(__state.productsByVenue, __state.currentRange);
    const pe = __state.tradeStr('productsEmpty', __state.PRODUCTS_EMPTY[lang] || __state.PRODUCTS_EMPTY.fr);
    const real = isCustom ? __state.realTopProducts(__state.currentRange) : null;
    const titleEl = document.querySelector('[data-products-title]');
    if (titleEl) titleEl.textContent = (isCustom && pe.title) || __state.PRODUCTS_TITLE[lang] || __state.PRODUCTS_TITLE.fr;
    const manageEl = document.querySelector('[data-products-manage]');
    if (manageEl) manageEl.textContent = (isCustom && pe.manage) || __state.PRODUCTS_MANAGE[lang] || __state.PRODUCTS_MANAGE.fr;
    const list = document.querySelector('[data-products-list]');
    const card = list?.closest('.block');
    if (list && real && real.rows.length) {
      const cap = Math.max(1, ...real.rows.map((r) => r.qty));
      list.innerHTML = real.rows.map((r, i) => `
        <div class="prod-row" style="--i:${i};">
          <div class="rank${i === 0 ? ' top' : ''}">${i + 1}</div>
          <div class="info">
            <div class="n">${__state.escTxt(r.name)}</div>
            <div class="r">${__state.frInt(r.revenue)} MAD</div>
          </div>
          <div class="mini-bar"><div style="width: 0%;" data-grow="${Math.round((r.qty / cap) * 100)}%"></div></div>
          <div class="sales">${(__state.PRODUCT_SOLD[lang] || __state.PRODUCT_SOLD.fr)(r.qty)}</div>
        </div>
      `).join('');
      __state.growBars(list);
    } else if (list && isCustom) {
      list.innerHTML = __state.emptyListBody(real && real.sales ? (__state.PRODUCTS_NO_LINES[lang] || __state.PRODUCTS_NO_LINES.fr)(real.sales) : pe.msg);
    } else if (list && data) {
      list.innerHTML = data.map((p, i) => `
        <div class="prod-row" style="--i:${i};">
          <div class="rank${i === 0 ? ' top' : ''}">${p.rank}</div>
          <div class="info">
            <div class="n">${p.name}</div>
            <div class="r">${p.sub}</div>
          </div>
          <div class="mini-bar"><div style="width: 0%;" data-grow="${p.bar}%"></div></div>
          <div class="sales">${p.sales}</div>
        </div>
      `).join('');
      __state.growBars(list);
    }
    if (card) card.classList.toggle('is-empty-state', !!list && !list.querySelector('.prod-row'));
    try { __state.renderPairs(card, isCustom, lang); } catch (_) {}
    const sub = document.querySelector('[data-products-sub]');
    if (sub) sub.textContent = isCustom
      ? (real && real.rows.length ? (__state.PRODUCTS_COVERAGE[lang] || __state.PRODUCTS_COVERAGE.fr)(real.rows.length, real.covered, real.sales) : pe.sub)
      : (__state.PRODUCTS_SUB[lang]?.[__state.currentRange] || __state.PRODUCTS_SUB.fr[__state.currentRange]);
  }
function renderStaff() {
    const lang = __state.getLang();
    const effective = __state.effRange();
    const isCustom = __state.ownData();
    const data = isCustom ? [] : __state.vData(__state.staffByVenue, __state.currentRange);
    const se = __state.tradeStr('staffEmpty', __state.STAFF_EMPTY[lang] || __state.STAFF_EMPTY.fr);
    const titleEl = document.querySelector('[data-staff-title]');
    if (titleEl) titleEl.textContent = (isCustom && se.title) || __state.STAFF_TITLE[lang] || __state.STAFF_TITLE.fr;
    const list = document.querySelector('[data-staff-list]');
    const card = list?.closest('.block');
    /* Une équipe existe dès qu'un membre est saisi côté Équipe — la carte ne peut
     * plus prétendre le contraire. Les heures viennent de la grille de Paie, donc
     * « en service » veut dire ici exactement ce qu'il veut dire là-bas.
     * Le montant reste « — » : Kiwi ne rattache pas encore une vente à un
     * vendeur, et inventer un chiffre par personne serait pire que le tiret. */
    const roster = isCustom ? __state.realRoster() : null;
    if (list && roster && roster.length) {
      list.innerHTML = roster.map((s, i) => {
        const on = s.hoursToday > 0;
        return `
        <div class="staff-row" style="--i:${i};">
          <div class="av${on ? '' : ' offline'}"${on ? '' : ' style="background: var(--n-400);"'}>${__state.escTxt(s.avatar)}</div>
          <div class="info">
            <div class="n">${__state.escTxt(s.name)}</div>
            <div class="role">${__state.escTxt(s.role)}</div>
          </div>
          <div class="shift"${on ? '' : ' style="color: var(--n-500);"'}>${on ? __state.fmtHeures(s.hoursToday) : '·'}</div>
          <div class="tx-n" style="color: var(--n-500);">·</div>
        </div>`;
      }).join('');
    } else if (list && isCustom) {
      list.innerHTML = __state.emptyListBody(se.msg);
    } else if (list && data) {
      list.innerHTML = data.map((s, i) => `
        <div class="staff-row" style="--i:${i};">
          <div class="av ${s.cls}"${s.cls === 'offline' ? ' style="background: var(--n-400);"' : ''}>${s.av}</div>
          <div class="info">
            <div class="n">${s.name}</div>
            <div class="role">${__state.demoRole(s.role, __state.getLang())}</div>
          </div>
          <div class="shift"${s.shift === '·' ? ' style="color: var(--n-500);"' : ''}>${s.shift}</div>
          <div class="tx-n"${s.amt === '·' ? ' style="color: var(--n-500);"' : ''}>${s.amt}${s.tx ? `<br/><span style="color: var(--success); font-size: 11px;">${s.tx}</span>` : ''}</div>
        </div>
      `).join('');
    }
    if (card) card.classList.toggle('is-empty-state', !!list && !list.querySelector('.staff-row'));
    const sub = document.querySelector('[data-staff-sub]');
    if (sub) sub.textContent = (roster && roster.length)
      ? (__state.STAFF_ONDUTY_STR[lang] || __state.STAFF_ONDUTY_STR.fr)(roster.filter((s) => s.hoursToday > 0).length, roster.length)
      : (isCustom
        ? se.sub
        : (__state.STAFF_SUB[lang]?.[__state.currentRange] || __state.STAFF_SUB.fr[__state.currentRange]));
  }
function realMixRows(lang, range) {
    const [from, to] = rangeBounds(range == null ? __state.currentRange : range);
    const by = {};
    let total = 0;
    __state.realSalesList().forEach((e) => {
      const ts = +e.ts || 0;
      if (ts < from || ts >= to) return;
      const amt = Math.max(0, +e.amount || 0);
      if (!amt) return;
      const k = __state.tenderBucket(e && e.method);
      if (!k) return; // crédit client / créance livraison ≠ argent encaissé
      __state.tenderAmounts(e).forEach(part => {
        if (part.key) by[part.key] = (by[part.key] || 0) + part.amount;
      });
      total += amt;
    });
    /* The ring says « MAD encaissé »: money kept, after refunds, the way the
     * till's « Moyens de paiement · net » and the day report count it. It used
     * to add sales only, so a day with a 20,40 card refund read 425 here and
     * 404,10 everywhere else, on the same screen as the 404,10 band. A refund
     * goes back on the tender it was paid with (realWindowStats does the same
     * for the card/cash tile). */
    __state.realRefundList().forEach((e) => {
      const ts = +e.ts || 0;
      if (ts < from || ts >= to) return;
      const amt = Math.abs(+e.amount || 0);
      const k = __state.tenderBucket(e && e.method);
      if (!amt || !k) return;
      by[k] = (by[k] || 0) - amt;
      total -= amt;
    });
    total = Math.round(total * 100) / 100;
    const kept = __state.REAL_MIX.filter((m) => by[m.key] > 0.004);
    const keptSum = kept.reduce((s, m) => s + by[m.key], 0);
    if (!(total > 0) || !keptSum) return { rows: [], total: 0, cardTotal: 0 };
    return {
      total,
      rows: kept.map((m) => ({
        color: m.color, label: m[lang] || m.fr, pct: (by[m.key] / keptSum) * 100,
      })),
    };
  }

function realLowStock() {
    try {
      const type = window.KiwiVenue?.getVenueType?.();
      if (type === 'restaurant' && window.KiwiRestaurantStock?.items) {
        const items = window.KiwiRestaurantStock.items() || [];
        if (!items.length) return null;
        const configured = items.filter((it) => Number(it.reorderLevel) > 0);
        const rows = configured.map((it) => {
          const stock = Number(it.currentStock) || 0; // Montrer aussi le déficit réel.
          const threshold = Math.max(0, Number(it.reorderLevel) || 0);
          const par = Math.max(threshold, Number(it.parLevel) || threshold);
          const suggested = Math.max(0, Math.round((par * 1.2 - stock) * 10) / 10);
          return { id: it.id, name: it.name, stock, threshold, par, suggested,
            unit: it.unit || 'unité', cost: Math.max(0, Number(it.costPerUnit) || 0) };
        }).filter((r) => r.stock < r.threshold)
          .sort((a, b) => (a.stock / a.threshold) - (b.stock / b.threshold))
          .slice(0, 5);
        return { rows, tracked: items.length, configured: configured.length, source: 'restaurant' };
      }
      if (type === 'boutique') {
        const cat = window.KiwiBoutiqueCatalog;
        if (!cat) return null;
        const key = window.KiwiBoutiqueVenueKey && window.KiwiBoutiqueVenueKey();
        if (key) cat.use(key);
        const prods = cat.listProducts() || [];
        if (!prods.length) return null;
        const rows = prods.map((p) => ({ id: p.id, name: p.name, stock: cat.productStock(p.id), threshold: __state.LOW_STOCK_SEUIL }))
          .filter((r) => r.stock <= __state.LOW_STOCK_SEUIL).sort((a, b) => a.stock - b.stock).slice(0, 5);
        return { rows, tracked: prods.length, configured: prods.length, source: 'boutique' };
      }
    } catch (_) { return null; }
    return null;
  }

function realTopProducts(range) {
    const [from, to] = rangeBounds(range == null ? __state.currentRange : range);
    /* Une ligne boutique porte la taille dans son nom (« Hoodie Blue M ») et une
       variante `prod_7:M:bleu`. On nomme le produit, pas la première taille
       vendue ; un plat de restaurant (sans variante de ce format) ne change pas. */
    const productLabel = (line) => {
      const name = String((line && line.name) || ''), item = String((line && line.itemId) || ''), variant = String((line && line.variantId) || '');
      if (!item || variant.indexOf(item + ':') !== 0) return name;
      const size = variant.slice(item.length + 1).split(':')[0];
      return size && name.length > size.length + 1 && name.endsWith(' ' + size) ? name.slice(0, -(size.length + 1)) : name;
    };
    const sales = __state.realSalesList().filter((e) => (+e.ts || 0) >= from && (+e.ts || 0) < to);
    const by = new Map(); let covered = 0;
    sales.forEach((sale) => {
      const lines = Array.isArray(sale.lines) ? sale.lines.filter((l) => l && l.name && (+l.qty || 0) > 0) : [];
      if (!lines.length) return;
      covered++;
      lines.forEach((line) => {
        const key = String(line.itemId || line.variantId || line.name).trim().toLowerCase();
        const qty = Math.max(0, Number(line.qty) || 0);
        const revenue = Math.max(0, Number(line.total) || ((Number(line.price) || 0) * qty));
        const row = by.get(key) || { name: productLabel(line), qty: 0, revenue: 0 };
        row.qty += qty; row.revenue += revenue; by.set(key, row);
      });
    });
    const rows = [...by.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 5);
    return { rows, sales: sales.length, covered };
  }

function realPairs(range) {
    const [from, to] = rangeBounds(range == null ? __state.currentRange : range);
    /* Une ligne boutique porte la taille dans son nom (« Hoodie Blue M ») et une
       variante `prod_7:M:bleu`. On nomme le produit, pas la première taille
       vendue ; un plat de restaurant (sans variante de ce format) ne change pas. */
    const productLabel = (line) => {
      const name = String((line && line.name) || ''), item = String((line && line.itemId) || ''), variant = String((line && line.variantId) || '');
      if (!item || variant.indexOf(item + ':') !== 0) return name;
      const size = variant.slice(item.length + 1).split(':')[0];
      return size && name.length > size.length + 1 && name.endsWith(' ' + size) ? name.slice(0, -(size.length + 1)) : name;
    };
    const seen = new Map(), names = new Map(), together = new Map();
    let baskets = 0;
    __state.realSalesList().forEach((sale) => {
      const ts = +sale.ts || 0;
      if (ts < from || ts >= to) return;
      const keys = new Set();
      (Array.isArray(sale.lines) ? sale.lines : []).forEach((l) => {
        if (!l || !l.name || !((+l.qty || 0) > 0)) return;
        const k = String(l.itemId || l.variantId || l.name).trim().toLowerCase();
        if (!k || keys.size >= __state.PAIRS_MAX_KEYS) return;
        keys.add(k);
        if (!names.has(k)) names.set(k, productLabel(l));
      });
      keys.forEach((k) => seen.set(k, (seen.get(k) || 0) + 1));
      if (keys.size < 2) return;
      baskets++;
      const ks = [...keys].sort();
      for (let i = 0; i < ks.length; i++) {
        for (let j = i + 1; j < ks.length; j++) {
          const pk = ks[i] + '\u0000' + ks[j];
          together.set(pk, (together.get(pk) || 0) + 1);
        }
      }
    });
    if (baskets < __state.PAIRS_MIN_BASKETS) return { rows: [], baskets };
    const rows = [...together].filter(([, n]) => n >= __state.PAIRS_MIN_TOGETHER).map(([pk, n]) => {
      const [x, y] = pk.split('\u0000');
      const lead = (seen.get(x) || 0) <= (seen.get(y) || 0) ? x : y;
      const other = lead === x ? y : x;
      return { lead: names.get(lead), other: names.get(other), together: n, share: n / Math.max(1, seen.get(lead) || 0) };
    }).sort((p, q) => q.together - p.together || q.share - p.share || String(p.lead).localeCompare(String(q.lead))).slice(0, 3);
    return { rows, baskets };
  }

function growBars(scope) {
    if (!scope) return;
    const els = scope.querySelectorAll('[data-grow]');
    if (!els.length) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach((el) => { el.style.width = el.dataset.grow; });
      return;
    }
    const apply = () => els.forEach((el) => { el.style.width = el.dataset.grow; });
    requestAnimationFrame(() => requestAnimationFrame(apply));
    /* rAF is frozen in hidden tabs — the timer guarantees the bars land at
     * their real widths even if the render happened in the background. */
    setTimeout(apply, 450);
  }

    return Object.freeze({ renderMix, renderMixPlan, renderSettle, renderPairs, renderInteg, renderNotifBadge, renderEvening, renderStock, renderTimeline, renderHealth, renderBench, renderProducts, renderStaff, realMixRows, realLowStock, realTopProducts, realPairs, growBars });
  };
})();
