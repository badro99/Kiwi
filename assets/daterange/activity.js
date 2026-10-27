/* Owner: dashboard activity. Exports: renderFeed, buildOrder, buildLiveFeed, buildCustomFeed.
 * Sibling calls via live owner: rangeBounds.
 * Reads live owner: FEED_BY_VENUE, FEED_EMPTY, FEED_SUB, FEED_TITLE, buildCustomFeed, buildLiveFeed, curUnit, currentRange, effRange, escTxt, getCurrentVenue, getLang, homeSet, liveTickInProgress, ownData, rangeBounds, tradeStr, vData.
 * Reads globalThis: KiwiZoneLaw.
 * Reads window: KiwiDayReport, KiwiDemoClock, KiwiI18n, KiwiNumber, KiwiRefunds, KiwiSales, KiwiVenue, __kiwiFeedOrders. No state is copied. */
(function () {
  'use strict';
  const registry = window.__kiwiHomeRenderers || (window.__kiwiHomeRenderers = Object.create(null));
  registry['activity'] = function (__state) {
  function rangeBounds(...args) { return __state.rangeBounds.apply(this, args); }
function renderFeed() {
    const lang = __state.getLang();
    const effective = __state.effRange();
    const isLive = effective === 'aujourdhui';

    /* Cached tx rows carry FR payment strings baked at generation time —
     * translate the known method strings at render time so a language switch
     * applies to feeds that were already generated. */
    const PAY_TR = {
      'Espèces': { en: 'Cash', ar: 'نقدًا' },
      'Cash · table': { en: 'Cash · at the table', ar: 'نقدًا · على الطاولة' },
      'Client abonné': { en: 'Subscribed client', ar: 'عميل مشترك' },
      'NFC · contactless': { en: 'NFC · contactless', ar: 'NFC · بدون تلامس' },
    };
    const PAY_PREFIX = [
      ['Carte marocaine', { en: 'Moroccan card', ar: 'بطاقة مغربية' }],
      ['Carte française', { en: 'French card', ar: 'بطاقة فرنسية' }],
      ['Carte espagnole', { en: 'Spanish card', ar: 'بطاقة إسبانية' }],
    ];
    const trPay = (s) => {
      if (!s || lang === 'fr') return s;
      const hit = PAY_TR[s];
      if (hit) return hit[lang] || s;
      for (const [pre, tr2] of PAY_PREFIX) {
        if (s.indexOf(pre) === 0) return (tr2[lang] || pre) + s.slice(pre.length);
      }
      return s;
    };

    const venue = window.KiwiVenue?.getVenue?.() || 'cafeAtlas';
    // A user-created venue's feed is built from the merchant's own recorded
    // sales — empty state until the first one is rung up.
    //
    // The `isReal` arm matters as much as the `isCustom` one. A real session on
    // a venue id that isn't flagged custom used to fall through to the static
    // demo feed, and those rows do not just sit on screen: renderFeed caches
    // them in window.__kiwiFeedOrders, which the assistant reads as "les
    // dernières commandes encaissées" and puts in the model's prompt. Demo
    // covers, demo servers, demo tickets, quoted back as the merchant's own.
    const rows = __state.ownData(venue) ? __state.buildCustomFeed(venue)
      : isLive ? __state.buildLiveFeed(venue) : __state.vData(__state.FEED_BY_VENUE, __state.currentRange);
    const wrap = document.querySelector('[data-feed]');

    if (wrap) {
      if (!rows || rows.length === 0) {
        /* Empty state — start of hour, no orders yet. */
        const fe = __state.tradeStr('feedEmpty', __state.FEED_EMPTY[lang] || __state.FEED_EMPTY.fr);
        wrap['inner' + 'HTML'] = `
          <div style="padding: 38px 18px 42px; text-align: center; display: flex; flex-direction: column; align-items: center;">
            <div style="width: 44px; height: 44px; border-radius: 13px; background: rgba(11,110,79,0.10); border: 1px solid rgba(11,110,79,0.18); color: var(--atlas); display: grid; place-items: center; margin-bottom: 14px;">
              <svg width="22" height="22" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z"/></svg>
            </div>
            <div style="display:inline-flex; align-items:center; gap:8px; padding:4px 12px; background:var(--paper-soft); border-radius:999px; font-family:var(--mono); font-size:11px; letter-spacing:0.06em; color:var(--n-600); margin-bottom:8px; border:1px solid var(--n-200);">
              <span class="pulse-dot" style="width:6px; height:6px; background:var(--atlas);"></span>${__state.escTxt(fe.badge)}
            </div>
            <div style="font-weight: 600; color: var(--ink); font-size: 14.5px; letter-spacing: -0.01em;">${__state.escTxt(fe.title)}</div>
            <div style="margin-top: 4px; font-size: 12.5px; color: var(--n-500); max-width: 36ch; line-height: 1.45;">${__state.escTxt(fe.sub)}</div>
          </div>
        `;
      } else {
        /* Cache the rich order objects so the click handler can pull full
         * detail (items, server, breakdown) from a stable key — avoids
         * round-tripping JSON through DOM attributes. */
        window.__kiwiFeedOrders = {};
        /* Rows cascade on data changes; live ticks rebuild without replay
         * (the .new row keeps its own slide-in). */
        wrap.classList.toggle('feed-anim', !__state.liveTickInProgress);
        wrap.innerHTML = rows.map((r, idx) => {
          const key = `o${idx}`;
          window.__kiwiFeedOrders[key] = r;

          /* Official brand assets live under assets/icons/ (downloaded by
           * the merchant): Visa SVG with proper gradient, Mastercard PNG
           * interlocking circles, illustrated cash bills, scannable QR.
           * NFC stays inline — there's no neutral third-party mark for it. */
          const ICONS = {
            visa: `<img src="assets/icons/visa.svg" alt="Visa">`,
            mc:   `<img src="assets/icons/mastercard.png" alt="Mastercard">`,
            cash: `<img src="assets/icons/cash.webp" alt="Espèces">`,
            tap:  `<i data-lucide="contactless" aria-hidden="true"></i>`,
            qr:   `<img src="assets/icons/qr-code.png" alt="QR">`,
            /* Neutral card chip — used when we know a card was tapped/inserted
             * but not which network. Never substitute a Visa/MC mark here. */
            cmi:  `<i data-lucide="credit-card" aria-hidden="true"></i>`,
          };
          const chipInner = ICONS[r.method] || '';

          /* Table promoted to a circular badge so the row scans as
           * "seat → person → amount" instead of running text together. */
          const tableChip = (r.table != null)
            ? `<span class="t-chip" aria-label="Table ${__state.escTxt(r.table)}">T${__state.escTxt(r.table)}</span>`
            : '';
          /* `ctx` is the till's sale label and `sub` a refund's ref: free text
           * typed at any till, stored raw by POST /api/sale. It goes through
           * innerHTML here, so every user-controlled field is escaped. */
          const who = __state.escTxt(r.customer ? r.customer : (r.ctx || ''));

          return `
          <div class="feed-row${r.isNew ? ' new' : ''}" style="--i:${idx};" tabindex="0" role="button" data-action="open-order" data-order-key="${key}">
            <div class="t">${__state.escTxt(r.t)}</div>
            <div class="method">
              <div class="ci ${__state.escTxt(r.method)}">${chipInner}</div>
              <div class="desc">
                <div class="primary">${__state.escTxt(trPay(r.primary))}</div>
                <div class="sub"><span class="flag ${__state.escTxt(r.flag)}"></span>${__state.escTxt(trPay(r.sub))}</div>
              </div>
            </div>
            <div class="ctx">${tableChip}<span class="who">${who}</span></div>
            <div class="amt"${r.neg ? ' style="color: var(--danger);"' : ''}>${r.amt}<span class="cur">${__state.curUnit()}</span></div>
            <div class="more" aria-hidden="true"><i data-lucide="chevron-right" width="14" height="14"></i></div>
          </div>
        `;
        }).join('');
      }
    }
    const titleEl = document.querySelector('[data-feed-title]');
    if (titleEl) titleEl.textContent = __state.FEED_TITLE[lang]?.[__state.currentRange] || __state.FEED_TITLE.fr[__state.currentRange];
    const subEl = document.querySelector('[data-feed-sub]');
    if (subEl) {
      if (isLive && rows && rows.length === 0) {
        subEl.textContent = __state.tradeStr('feedAwait',
            lang === 'en' ? 'Service open · awaiting first order'
          : lang === 'ar' ? 'الخدمة مفتوحة · في انتظار الطلب الأول'
          : 'Service ouvert · en attente de la 1ʳᵉ commande');
      } else if (isLive) {
        /* Live subtitle reflects the actual row count + total today.
         * A REAL merchant's count must come from their OWN sales: the demo
         * clock keeps simulating in the background, so reading its cumTx here
         * printed "98 commandes aujourd'hui" on a store that had rung 2. */
        let cumTx;
        if (__state.ownData() && window.KiwiSales) {
          const [t0, t1] = __state.rangeBounds('aujourdhui');
          let sales = [];
          try { sales = window.KiwiSales.list(__state.getCurrentVenue()) || []; } catch (_) { sales = []; }
          cumTx = sales.filter((s) => {
            const ts = +(s && s.ts) || 0;
            return ts >= t0 && ts < t1 && String(s.kind || '') !== 'refund' && Number(s.amount) > 0;
          }).length;
        } else {
          const sim = window.KiwiDemoClock?.getSimState?.();
          cumTx = sim?.cumTx ?? 0;
        }
        const n = rows.length;
        const word = lang === 'en' ? 'last' : lang === 'ar' ? 'آخر' : (n < 2 ? 'dernière' : 'dernières');
        const total = lang === 'en' ? `· ${cumTx} today`
                    : lang === 'ar' ? `· ${cumTx} اليوم`
                    : `· ${cumTx} commande${cumTx > 1 ? 's' : ''} aujourd'hui`;
        subEl.textContent = `${n} ${word} ${total}`;
      } else {
        subEl.textContent = __state.FEED_SUB[lang]?.[__state.currentRange] || __state.FEED_SUB.fr[__state.currentRange];
      }
    }
    const strip = (x) => String(x == null ? '' : x).replace(/<[^>]*>/g, '');
    const feedEmpty = __state.tradeStr('feedEmpty', __state.FEED_EMPTY[lang] || __state.FEED_EMPTY.fr);
    typeof __state.homeSet === 'function' && __state.homeSet('feed', {
      title: titleEl ? titleEl.textContent : '', sub: subEl ? subEl.textContent : '', unit: __state.curUnit(),
      empty: { title: feedEmpty.title, sub: feedEmpty.sub },
      rows: (rows || []).map((r, idx) => ({ key: `o${idx}`, time: strip(r.t), primary: strip(trPay(r.primary)), sub: strip(trPay(r.sub)),
        table: r.table == null ? null : r.table, who: strip(r.customer ? r.customer : (r.ctx || '')), amount: strip(r.amt), neg: !!r.neg })),
    });
  }
function buildOrder(venue, dateKey, idx) {
    const seedStr = `${venue}-${dateKey}-${idx}`;
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
    const rnd = () => {
      h |= 0; h = (h + 0x6D2B79F5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    /* Payment-method mix: 20% Visa, 20% MC, 15% Tap, 15% QR, 30% cash —
     * realistic for a Moroccan café/restaurant. */
    const r = rnd();
    let method, primary, sub, flag;
    if (r < 0.20) {
      method = 'visa';
      const last4 = String(Math.floor(rnd() * 10000)).padStart(4, '0');
      primary = `Visa •• ${last4}`;
      const banks = [['ma', 'Carte marocaine · Attijariwafa'], ['ma', 'Carte marocaine · BMCE'], ['ma', 'Carte marocaine · CIH'], ['fr', 'Carte française · Société Générale'], ['es', 'Carte espagnole · CaixaBank']];
      const b = banks[Math.floor(rnd() * banks.length)]; flag = b[0]; sub = b[1];
    } else if (r < 0.40) {
      method = 'mc';
      const last4 = String(Math.floor(rnd() * 10000)).padStart(4, '0');
      primary = `Mastercard •• ${last4}`;
      const banks = [['ma', 'Carte marocaine · BOA'], ['ma', 'Carte marocaine · CIH'], ['fr', 'Carte française · BNP Paribas']];
      const b = banks[Math.floor(rnd() * banks.length)]; flag = b[0]; sub = b[1];
    } else if (r < 0.55) {
      method = 'tap'; primary = 'Kiwi Tap'; flag = 'ma'; sub = 'NFC · contactless';
    } else if (r < 0.70) {
      method = 'qr'; primary = 'Kiwi Wallet QR'; flag = 'ma'; sub = 'Client abonné';
    } else {
      method = 'cash'; primary = 'Espèces'; flag = 'ma'; sub = 'Cash · table';
    }

    const customers = ['Karim B.', 'Sara L.', 'Youssef A.', 'Nawal K.', 'Hassan J.', 'Imane M.', 'Mehdi R.', 'Fatima Z.', 'Rachid O.', 'Lina S.', 'Ahmed T.', 'Yasmine H.', 'Julie M.', 'Fadoua K.', 'Hind M.', 'Walid F.', 'Soukaina A.', 'Aïcha R.', 'Brahim K.', 'Salma F.'];
    const customer = customers[Math.floor(rnd() * customers.length)];
    const tableNum = 1 + Math.floor(rnd() * 12);
    const covers = 1 + Math.floor(rnd() * 5); // 1–5 people at the table

    /* Servers — small rotating crew per venue. The same hire roster appears
     * across the dashboard so the names feel familiar to the merchant. */
    const servers = ['Fatima K.', 'Omar B.', 'Naima R.', 'Hicham E.', 'Khadija M.'];
    const server = servers[Math.floor(rnd() * servers.length)];

    /* Items — pull the venue's real menu via KiwiVenue.getMenuItems(). Pick
     * 1–4 dishes with realistic quantities; if the menu isn't loaded yet
     * (early-render race) we fall back to a sensible Café Atlas-style mix. */
    const menu = (window.KiwiVenue?.getMenuItems?.(venue) || []);
    const itemCount = 1 + Math.floor(rnd() * 4); // 1–4 distinct items
    const items = [];
    const usedIds = new Set();
    let computedSubtotal = 0;
    if (menu.length) {
      for (let i = 0; i < itemCount && i < menu.length; i++) {
        let pick, guard = 0;
        do { pick = menu[Math.floor(rnd() * menu.length)]; guard++; }
        while (usedIds.has(pick.id) && guard < 12);
        if (usedIds.has(pick.id)) break;
        usedIds.add(pick.id);
        const qty = 1 + (rnd() < 0.3 ? 1 : 0) + (rnd() < 0.15 ? 1 : 0); // 1–3
        items.push({ id: pick.id, name: pick.name, qty, price: pick.price });
        computedSubtotal += qty * pick.price;
      }
    } else {
      const fallback = [
        { name: 'Tajine kefta',        price: 120 },
        { name: 'Thé à la menthe',     price: 30  },
        { name: 'Café noir',           price: 15  },
        { name: 'Pastilla poulet',     price: 140 },
        { name: "Jus d'avocat",        price: 50  },
        { name: 'Couscous royal',      price: 220 },
      ];
      for (let i = 0; i < itemCount; i++) {
        const pick = fallback[Math.floor(rnd() * fallback.length)];
        const qty = 1 + (rnd() < 0.3 ? 1 : 0);
        items.push({ name: pick.name, qty, price: pick.price });
        computedSubtotal += qty * pick.price;
      }
    }

    /* Tax (TVA 10% restauration au Maroc, 20% spa/services). Use the
     * computed subtotal for the displayed amount so the modal numbers add
     * up — the legacy amt range is dropped in favour of real menu math. */
    const tvaRate = venue === 'spaBahia' ? 0.20 : 0.10;
    const subtotal = Math.round(computedSubtotal * 100) / 100;
    const tva = Math.round(subtotal * tvaRate * 100) / 100;
    const amt = Math.round((subtotal + tva) * 100) / 100;

    /* Receipt number — deterministic, looks like a real POS sequence. */
    const receiptNo = 'TKT-' + String(10000 + Math.floor(rnd() * 89999));

    /* Service duration — 12–75 min, longer for tables with more covers. */
    const serviceMinutes = 12 + Math.floor(rnd() * 50) + covers * 4;

    const fmt = (n) => (window.KiwiNumber?.format(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? n.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    return {
      method, primary, sub, flag,
      customer, table: tableNum,
      ctx: `${customer} · T${tableNum}`,
      amt: fmt(amt),
      amtRaw: amt,
      neg: false,
      /* Rich detail used by the order-detail drawer. */
      receiptNo, server, covers, serviceMinutes,
      items,
      subtotal: fmt(subtotal),
      tva: fmt(tva),
      tvaRate: Math.round(tvaRate * 100),
      total: fmt(amt),
    };
  }

function buildLiveFeed(venue) {
    const rows = window.KiwiDemoClock?.getDaySales?.() || [];
    const fmt = n => (window.KiwiNumber?.format(n, {minimumFractionDigits:2, maximumFractionDigits:2}) ?? n.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}));
    return rows.slice(-10).reverse().map((sale, slot) => ({
      method:sale.method === 'card' ? 'visa' : sale.method === 'wallet' ? 'qr' : 'cash',
      primary:sale.method === 'card' ? 'Visa' : sale.method === 'wallet' ? 'Kiwi Wallet QR' : ({en:'Cash',ar:'نقداً'}[(window.KiwiI18n?.getLang?.() || 'fr')] || 'Espèces'),
      sub:'', flag:'ma', customer:sale.customer, table:sale.table,
      ctx:sale.customer + ' · T' + sale.table,
      amt:fmt(sale.amount), amtRaw:sale.amount, neg:false, receiptNo:sale.ref,
      server:sale.staff, covers:1, serviceMinutes:0,
      items:sale.lines.map(line => ({n:line.name, name:line.name, q:line.qty, qty:line.qty, p:line.price, price:line.price, total:line.total})),
      subtotal:fmt(sale.amount), tva:fmt(0), tvaRate:0, total:fmt(sale.amount),
      t:new Date(sale.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:(globalThis.KiwiZoneLaw?.effectiveZone(window.KiwiDayReport?.timezone?.(), sale.ts) || window.KiwiDayReport?.timezone?.())}), isNew:slot===0
    }));
  }

function buildCustomFeed(venue) {
    /* Bornées à la MÊME période que le sous-titre affiché juste au-dessus.
     * Ce `.slice(-8)` prenait les huit dernières ventes de tout l'historique,
     * pendant que le sous-titre, lui, comptait « N commandes aujourd'hui » sur
     * la seule journée. Un commerçant qui n'avait encore rien vendu ce matin
     * lisait donc « 0 commande aujourd'hui » posé sur trois tickets d'hier — et
     * comme les lignes ne portent que l'heure, rien ne trahissait leur date. Le
     * titre du panneau rendait la chose pire : ces ventes-là n'étaient ni en
     * direct, ni du jour. */
    const [lo, hi] = rangeBounds(__state.currentRange);
    const sales = (window.KiwiSales?.list?.(venue) || []).concat(
      (window.KiwiRefunds?.list?.(venue) || []).map((r) => ({ ...r, amount: -Math.abs(+r.amount || 0), kind: 'refund' }))
    )
      .filter((s) => { const ts = +(s && s.ts) || 0; return ts >= lo && ts < hi; })
      .sort((a, b) => (+a.ts || 0) - (+b.ts || 0)).slice(-8).reverse();
    const lang = __state.getLang();
    /* Every method the till can actually record (see live-link METHOD_LABEL).
     * `cash` was missing, so `L[s.method] || L.card` relabelled EVERY cash sale
     * as "Carte bancaire" — on a Moroccan boutique dashboard, where cash is the
     * dominant tender, the owner could not tell cash from card on their own
     * feed. */
    const ML = {
      fr: { cash: 'Espèces', card: 'Carte bancaire', tap: 'Kiwi Tap', qr: 'QR Kiwi Wallet', wallet: 'Kiwi Wallet', link: 'Lien de paiement', transfer: 'Virement / Versement', cheque: 'Chèque', split: 'Paiement partagé', credit: 'Crédit client', delivery: 'Livraison · à recevoir', sub: 'Vente encaissée', deliverySub: 'Vente enregistrée · non encaissée' },
      en: { cash: 'Cash', card: 'Bank card', tap: 'Kiwi Tap', qr: 'QR Kiwi Wallet', wallet: 'Kiwi Wallet', link: 'Payment link', transfer: 'Bank transfer', cheque: 'Cheque', split: 'Split payment', credit: 'Customer credit', delivery: 'Delivery · receivable', sub: 'Sale recorded', deliverySub: 'Sale recorded · unpaid' },
      ar: { cash: 'نقدًا', card: 'بطاقة بنكية', tap: 'Kiwi Tap', qr: 'QR Kiwi Wallet', wallet: 'Kiwi Wallet', link: 'رابط الدفع', transfer: 'تحويل بنكي', cheque: 'شيك', split: 'دفع مقسّم', credit: 'دين العميل', delivery: 'توصيل · مبلغ مستحق', sub: 'عملية بيع مسجّلة', deliverySub: 'بيع مسجّل · غير محصّل' },
    };
    /* Chip art per method. The till records the TENDER, never the card network,
     * so a card sale gets the neutral card chip — printing a Visa or Mastercard
     * mark here would invent a fact the sale does not carry. */
    const ICON_FOR = { cash: 'cash', card: 'cmi', tap: 'tap', qr: 'qr', wallet: 'qr', link: 'qr', transfer: 'qr', cheque: 'qr', split: 'cmi', credit: 'qr', delivery: 'qr' };
    const L = ML[lang] || ML.fr;
    return sales.map((s, i) => {
      const d = new Date(s.ts);
      const t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      const isRefund = s.kind === 'refund' || Number(s.amount) < 0;
      return {
        t,
        method: ICON_FOR[s.method] || 'cmi',
        primary: isRefund ? (lang === 'en' ? 'Refund' : lang === 'ar' ? 'استرداد' : 'Remboursement') : (L[s.method] || L.card),
        /* The "who/what" column. On a boutique the useful identifier is the item,
         * which the sale now carries — a row reading "Chemise en lin" is what the
         * owner needs to find the original sale when that customer returns. Falls
         * back to the generic subtitle only when the till sent no label. */
        sub: isRefund ? (s.ref || '') : ((s.method === 'delivery' || s.method === 'credit') ? L.deliverySub : L.sub), flag: '', ctx: s.label || '',
        // Amount ONLY — the row template appends its own <span class="cur">MAD</span>,
        // so spelling the unit here too printed "450,00 MADMAD" on every real sale.
        amt: (isRefund ? '− ' : '') + (window.KiwiNumber?.number(Math.abs(s.amount || 0), 2) ?? new Intl.NumberFormat(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits:2,maximumFractionDigits:2}).format(Math.abs(s.amount || 0))),
        tip: '·', neg: isRefund, isNew: i === 0,
        saleId: String(s.id || ''),
        ref: String(s.ref || s.receiptRef || s.id || '').trim(),
        receiptNo: String(s.ref || s.receiptRef || '').trim(),
      };
    });
  }

    return Object.freeze({ renderFeed, buildOrder, buildLiveFeed, buildCustomFeed });
  };
})();
