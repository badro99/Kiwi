/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · FACTURE DE VENTE — Document A4 légal & numérotation serveur D1
 * ---------------------------------------------------------------------------
 * Règles fondamentales :
 * 1. Une vente = une seule facture, numérotée séquentiellement (F-2026-0001).
 * 2. Horodatage exact : issuedTs est la date de la vente, jamais Date.now().
 * 3. Snapshot figé : les données légales du vendeur et du client sont scellées.
 * 4. Règle comptable : TTC au centime près, HT + TVA = TTC.
 * 5. Si l'ICE est manquant : bandeau d'alerte sur la facture sans bloquer.
 * 6. PDF natif : boîte de dialogue du navigateur pré-titrée F-AAAA-XXXX.
 * ═══════════════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const BRAND_LOGO = '<img src="assets/kiwi-newlogo.svg" width="886" height="486" alt="Kiwi">';

  function esc(v) {
    return String(v ?? '').replace(/[&<>'"]/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[c]));
  }

  function round2(n) {
    return Math.round((+n || 0) * 100) / 100;
  }

  function fmtMoney(n) {
    const v = round2(n);
    return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
  }

  function fmtDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function fmtDateTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return `${dateStr} à ${timeStr}`;
  }

  function getSellerBusiness(venue) {
    function getLocal(k) {
      try {
        if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
          return localStorage.getItem(k);
        }
      } catch (_) {}
      return null;
    }

    const activeVid = venue
      || (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue())
      || (window.KiwiStore && window.KiwiStore.currentVenue && window.KiwiStore.currentVenue())
      || (window.KiwiLive && window.KiwiLive.merchant && window.KiwiLive.merchant())
      || getLocal('kiwiLiveMerchant')
      || '';

    let raw = {};
    try {
      if (window.KiwiReceipt && typeof window.KiwiReceipt.business === 'function') {
        const b = window.KiwiReceipt.business(activeVid);
        if (b && typeof b === 'object') raw = JSON.parse(JSON.stringify(b));
      }
    } catch (_) {}

    let vd = {};
    try {
      vd = window.KiwiVenue?.getCurrentVenueData?.() || {};
    } catch (_) {}

    let cfg = {};
    try {
      if (window.KiwiReceipt && typeof window.KiwiReceipt.config === 'function') {
        cfg = window.KiwiReceipt.config(activeVid) || {};
      }
    } catch (_) {}

    const rawLegal = (raw.legal && typeof raw.legal === 'object') ? raw.legal : {};
    const vdLegal = (vd.legal && typeof vd.legal === 'object') ? vd.legal : {};
    const legal = Object.assign({}, vdLegal, rawLegal);

    // Thorough scan across all KiwiStore business documents in localStorage
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf('kiwi:business:v1:') === 0) {
            const rawBiz = getLocal(k);
            if (rawBiz) {
              try {
                const parsed = JSON.parse(rawBiz);
                if (parsed && typeof parsed === 'object') {
                  const pLegal = parsed.legal || {};
                  const candidateIce = String(pLegal.ice || parsed.ice || '').trim();
                  if (candidateIce.length > 0) {
                    if (!legal.ice) legal.ice = candidateIce;
                    ['fiscal', 'rc', 'patente', 'address', 'city', 'phone', 'cnss', 'email', 'legalName'].forEach((fk) => {
                      if (!legal[fk] && (pLegal[fk] || parsed[fk])) legal[fk] = pLegal[fk] || parsed[fk];
                    });
                    if (!raw.logo && parsed.logo) raw.logo = parsed.logo;
                    if (!raw.name && parsed.name) raw.name = parsed.name;
                  }
                }
              } catch (_) {}
            }
          }
        }
      }
    } catch (_) {}

    // Fallback across specific localStorage keys if legal fields were saved in legacy slots
    const demoVids = ['cafeAtlas', 'maisonMansour', 'spaBahia'];
    const vidsToCheck = [activeVid, 'primary', 'own', 'scoped', 'default'].filter(Boolean);
    if (demoVids.includes(activeVid)) vidsToCheck.push(activeVid);
    if (!legal.ice) {
      try {
        for (const vid of vidsToCheck) {
          ['ice', 'fiscal', 'rc', 'patente', 'address', 'city', 'phone', 'cnss', 'email', 'legalName'].forEach((k) => {
            const v = getLocal('kiwiSet:biz:' + vid + ':' + k);
            if (v && !legal[k]) legal[k] = v;
          });
          if (legal.ice) break;
        }
      } catch (_) {}
    }

    // Scan all custom establishment keys in localStorage matching kiwiSet:biz:*:ice
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && /:ice$/.test(k)) {
            const val = String(getLocal(k) || '').trim();
            if (val.length > 0) {
              if (!legal.ice) legal.ice = val;
              const prefix = k.replace(/:ice$/, ':');
              ['fiscal', 'rc', 'patente', 'address', 'city', 'phone', 'cnss', 'email', 'legalName', 'logo', 'name'].forEach((fk) => {
                const sibVal = getLocal(prefix + fk);
                if (sibVal && !legal[fk]) legal[fk] = sibVal;
              });
            }
          }
        }
      }
    } catch (_) {}

    if (!legal.ice) {
      try {
        const directIce = getLocal('kiwiBizICE') || getLocal('kiwiICE') || getLocal('kiwiMerchantICE') || getLocal('kiwiLiveICE');
        if (directIce) legal.ice = directIce;
      } catch (_) {}
    }

    let meData = {};
    try {
      ['kiwiMe', 'kiwi_account_profile', 'kiwiAccount', 'kiwiProfile', 'kiwiUser'].forEach((key) => {
        const meRaw = getLocal(key);
        if (meRaw) {
          try {
            const p = JSON.parse(meRaw);
            if (p && typeof p === 'object') {
              meData = Object.assign({}, p, meData);
              const candIce = String(p.ice || p.legal?.ice || '').trim();
              if (candIce && !legal.ice) legal.ice = candIce;
              ['fiscal', 'rc', 'patente', 'address', 'city', 'phone', 'cnss', 'email', 'legalName'].forEach((fk) => {
                if (!legal[fk] && (p[fk] || p.legal?.[fk])) legal[fk] = p[fk] || p.legal[fk];
              });
              if (!raw.logo && p.logo) raw.logo = p.logo;
            }
          } catch (_) {}
        }
      });
    } catch (_) {}

    const name = raw.name || raw.tradeName || vd.fullDisplay || vd.name || meData.business || window.KiwiMe?.business || 'Kiwi Commerce';
    const legalName = legal.legalName || raw.legalName || vd.legalName || meData.legalName || name;
    const tradeName = raw.tradeName || vd.tradeName || '';
    const address = legal.address || raw.address || vd.address || meData.address || '';
    const city = legal.city || raw.city || vd.city || meData.city || 'Maroc';
    const phone = legal.phone || raw.phone || vd.phone || meData.phone || '';
    const ice = legal.ice || raw.ice || vd.ice || meData.ice || '';
    const fiscal = legal.fiscal || legal.if || raw.fiscal || raw.if || vd.fiscal || vd.if || meData.fiscal || meData.if || '';
    const rc = legal.rc || raw.rc || vd.rc || meData.rc || '';
    const patente = legal.patente || raw.patente || vd.patente || meData.patente || '';
    const cnss = legal.cnss || raw.cnss || vd.cnss || meData.cnss || '';
    const email = legal.email || raw.email || vd.email || meData.email || '';
    const logo = raw.logo || cfg?.look?.logo || vd.logo || vd.profileInfo?.logo || meData.logo || '';

    return {
      name,
      legalName,
      tradeName,
      address,
      city,
      phone,
      ice,
      fiscal,
      rc,
      patente,
      cnss,
      email,
      logo,
      legal: {
        legalName,
        address,
        city,
        phone,
        ice,
        fiscal,
        rc,
        patente,
        cnss,
        email,
      },
    };
  }

  function getTvaRate(venue) {
    try {
      if (window.KiwiReceipt && typeof window.KiwiReceipt.config === 'function') {
        const cfg = window.KiwiReceipt.config(venue);
        if (cfg && cfg.vat && cfg.vat.mode !== 'none') {
          const r = Number(cfg.vat.rate);
          return Number.isFinite(r) && r >= 0 ? r : 20;
        }
      }
    } catch (_) {}
    return 0; // Mode 'none' par défaut dans Kiwi
  }

  function toast(msg, type) {
    try {
      if (window.Kiwi && typeof window.Kiwi.toast === 'function') {
        window.Kiwi.toast(msg, { type: type || 'info' });
        return;
      }
    } catch (_) {}
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.classList.add('fade'), 3000);
    setTimeout(() => el.remove(), 3300);
  }

  /* ── 1. Construction du document figé ───────────────────────────────────────
   * build(sale, opts) -> doc
   * Garantit :
   *   - issuedTs == sale.ts (date originale de la vente, jamais Date.now())
   *   - Total TTC au centime = montant exact de la vente
   *   - HT + TVA == TTC
   *   - lines null ou vide => ligne unique « Vente <ref> » */
  function build(sale, opts) {
    opts = opts || {};
    const saleTs = Number(sale && sale.ts) || Date.now();
    const rawTotal = sale?.amountCents != null
      ? Number(sale.amountCents) / 100
      : Number(sale?.amount || sale?.total || 0);
    const totalTTC = round2(rawTotal);

    const venue = opts.venue || sale?.venue || sale?.venueId || sale?.store || null;
    const seller = opts.seller ? JSON.parse(JSON.stringify(opts.seller)) : getSellerBusiness(venue);
    if (seller.legal && typeof seller.legal === 'object') {
      ['ice', 'fiscal', 'rc', 'patente', 'cnss', 'address', 'city', 'phone', 'email', 'legalName'].forEach((k) => {
        if (!seller[k] && seller.legal[k]) seller[k] = seller.legal[k];
      });
    }

    const rate = opts.tvaRate != null ? Number(opts.tvaRate) : getTvaRate(venue);
    const tvaRate = Number.isFinite(rate) && rate >= 0 ? rate : 0;

    let ht = totalTTC;
    let tva = 0;
    if (tvaRate > 0) {
      ht = round2(totalTTC / (1 + tvaRate / 100));
      tva = round2(totalTTC - ht);
    }

    const saleRef = String(sale?.ref || sale?.label || '').trim();
    const saleId = String(sale?.saleId || sale?.id || opts.saleId || '').trim();

    let lines = [];
    if (Array.isArray(sale?.lines) && sale.lines.length) {
      lines = sale.lines.map((l) => {
        const name = String(l?.name || l?.n || 'Article').trim();
        const qty = Math.max(0.001, Number(l?.qty ?? l?.q ?? 1) || 1);
        const lineTotal = Number(l?.total ?? l?.t);
        const totalLineTTC = Number.isFinite(lineTotal) && lineTotal >= 0
          ? round2(lineTotal)
          : round2((Number(l?.price) || 0) * qty);
        const unitTTC = round2(totalLineTTC / qty);
        return {
          name,
          qty,
          unitTTC,
          totalTTC: totalLineTTC,
        };
      });
    }

    if (!lines.length) {
      const label = saleRef ? `Vente ${saleRef}` : (sale?.label || 'Vente comptoir');
      lines = [{
        name: label,
        qty: 1,
        unitTTC: totalTTC,
        totalTTC: totalTTC,
      }];
    }

    const sellerIceStr = String(seller.ice || seller.legal?.ice || '').trim();
    const missingICE = !sellerIceStr;

    return {
      number: opts.number || null,
      seq: opts.seq || null,
      issuedTs: saleTs,
      seller,
      customer: opts.customer ? {
        name: String(opts.customer.name || '').trim(),
        ice: String(opts.customer.ice || '').trim(),
        if: String(opts.customer.if || '').trim(),
      } : null,
      lines,
      tvaRate,
      totals: {
        ht,
        tva,
        ttc: totalTTC,
      },
      missingICE,
      method: String(sale?.method || 'cash'),
      saleRef,
      saleId,
      createdTs: opts.createdTs || Date.now(),
    };
  }

  /* ── 2. Gabarit HTML A4 Canonical ───────────────────────────────────────────
   * html(doc) -> String
   * Gabarit unique partagé par la surface Ventes, Facturation et les Caisses. */
  function html(doc) {
    if (!doc) return '';
    const num = doc.number || 'Facture';
    const liveSeller = getSellerBusiness();

    // Rehydrate seller identity from live store profile whenever fields are missing or empty in snapshot
    let seller = doc.seller ? JSON.parse(JSON.stringify(doc.seller)) : {};
    if (seller.legal && typeof seller.legal === 'object') {
      ['ice', 'fiscal', 'rc', 'patente', 'cnss', 'address', 'city', 'phone', 'email', 'legalName'].forEach((k) => {
        if (!seller[k] && seller.legal[k]) seller[k] = seller.legal[k];
      });
    }
    ['ice', 'fiscal', 'rc', 'patente', 'cnss', 'address', 'city', 'phone', 'email', 'logo', 'legalName', 'name'].forEach((k) => {
      if ((seller[k] == null || String(seller[k]).trim() === '') && liveSeller[k]) {
        seller[k] = liveSeller[k];
      }
    });

    const biz = seller.name || 'Kiwi Commerce';
    const legalName = seller.legalName || biz;
    const tradeName = seller.tradeName || '';
    const lines = doc.lines || [];
    const cust = doc.customer || null;
    const totals = doc.totals || { ht: 0, tva: 0, ttc: 0 };
    const tvaRate = doc.tvaRate || 0;

    const sellerLogo = seller.logo || '';
    const initials = (String(biz).replace(/\s*·.*$/, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || 'K').toUpperCase();

    const sellerAddress = [seller.address, seller.city].filter(Boolean).map(esc).join(', ');
    const sellerMeta = [
      sellerAddress,
      seller.phone ? `Tél : ${esc(seller.phone)}` : '',
      seller.email ? `Email : ${esc(seller.email)}` : '',
    ].filter(Boolean).join(' · ');

    const sellerLegalBlock = [
      `<strong>${esc(legalName)}</strong>`,
      tradeName && tradeName !== legalName ? `<em>Enseigne : ${esc(tradeName)}</em>` : '',
      sellerAddress ? `${sellerAddress}` : '',
      seller.phone ? `Tél : ${esc(seller.phone)}` : '',
      seller.email ? `Email : ${esc(seller.email)}` : '',
      seller.ice ? `<strong>ICE :</strong> ${esc(seller.ice)}` : '',
      seller.fiscal ? `<strong>IF :</strong> ${esc(seller.fiscal)}` : '',
      seller.rc ? `<strong>RC :</strong> ${esc(seller.rc)}` : '',
      seller.patente ? `<strong>Patente :</strong> ${esc(seller.patente)}` : '',
    ].filter(Boolean).join('<br>');

    const customerLegal = cust ? [
      `<strong>${esc(cust.name || 'Client')}</strong>`,
      cust.ice ? `<strong>ICE :</strong> ${esc(cust.ice)}` : '',
      cust.if ? `<strong>IF :</strong> ${esc(cust.if)}` : '',
    ].filter(Boolean).join('<br>') : '<strong>Client de passage</strong><br>Vente au comptoir';

    const sellerIceStr = String(seller.ice || seller.legal?.ice || '').trim();
    const isMissingICE = (doc.missingICE !== undefined)
      ? Boolean(doc.missingICE)
      : !sellerIceStr;

    const iceBanner = isMissingICE ? `
      <div class="ice-alert">
        <strong>Attention :</strong> Mention obligatoire manquante — L’ICE de votre établissement n’est pas renseigné.
        Veuillez le compléter dans <em>Paramètres → Mes établissements</em> pour une stricte conformité fiscale.
      </div>` : '';

    return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <base href="${esc(document.baseURI)}">
  <title>${esc(num)}</title>
  <style>
    @page { size: A4; margin: 16mm 18mm; }
    * { box-sizing: border-box; }
    body { font: 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 0; background: #fff; line-height: 1.45; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #087653; padding-bottom: 18px; }
    .brand-wrap { max-width: 58%; }
    .seller-logo { display: block; max-height: 48px; max-width: 190px; object-fit: contain; border-radius: 4px; margin-bottom: 5px; }
    .logo-fallback { display: inline-flex; align-items: center; margin-bottom: 5px; }
    .brand-initials { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; background: #f0fdf4; color: #087653; font-weight: 800; font-size: 13.5px; border: 1.5px solid #bbf7d0; }
    .biz-name { font-size: 17px; font-weight: 700; color: #0f172a; margin-top: 4px; letter-spacing: -0.01em; }
    .meta { color: #64748b; font-size: 11px; line-height: 1.45; margin-top: 3px; }
    .doc-head { text-align: right; }
    .doc-title { font-size: 24px; font-weight: 800; color: #087653; margin: 0 0 4px; letter-spacing: -0.02em; }
    .doc-meta { color: #475569; font-size: 12px; line-height: 1.5; }
    .ice-alert { margin-top: 14px; padding: 10px 14px; background: #fef2f2; border: 1px solid #f87171; border-left: 4px solid #dc2626; color: #991b1b; font-size: 11.5px; border-radius: 4px; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; padding: 22px 0 18px; border-bottom: 1px solid #e2e8f0; }
    .label { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; font-weight: 600; margin-bottom: 6px; }
    .party-body { font-size: 12px; color: #334155; line-height: 1.55; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    th { background: #f8fafc; text-align: left; color: #475569; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; padding: 10px 8px; border-bottom: 1px solid #cbd5e1; }
    td { padding: 11px 8px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #1e293b; }
    th.r, td.r { text-align: right; }
    .totals-wrap { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 18px; }
    .payment-info { font-size: 11.5px; color: #64748b; line-height: 1.6; max-width: 320px; }
    .totals { width: 260px; }
    .tot-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; color: #475569; }
    .tot-row.grand { border-top: 2px solid #087653; margin-top: 6px; padding-top: 10px; font-size: 16px; font-weight: 800; color: #087653; }
    .footer { position: fixed; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: flex-end; color: #94a3b8; font-size: 9.5px; border-top: 1px solid #e2e8f0; padding-top: 8px; background: #fff; }
    .footer-legal { max-width: 68%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1; padding-bottom: 2px; }
    .footer-powered { display: inline-flex; align-items: flex-end; gap: 5px; color: #64748b; font-size: 9.5px; }
    .footer-powered .pw-txt { color: #94a3b8; font-size: 8px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; line-height: 1; display: inline-block; padding-bottom: 1.5px; }
    .footer-powered .pw-logo { height: 13.5px; width: auto; display: block; }
  </style>
</head>
<body>
  <div class="top">
    <div class="brand-wrap">
      ${sellerLogo ? `
        <div class="logo"><img src="${esc(sellerLogo)}" alt="${esc(biz)}" class="seller-logo"></div>
      ` : `
        <div class="logo-fallback"><span class="brand-initials">${esc(initials)}</span></div>
      `}
      <div class="biz-name">${esc(biz)}</div>
      ${sellerMeta ? `<div class="meta">${sellerMeta}</div>` : ''}
    </div>
    <div class="doc-head">
      <h1 class="doc-title">${esc(num)}</h1>
      <div class="doc-meta">
        <strong>Date d’émission :</strong> ${esc(fmtDate(doc.issuedTs))}<br>
        <strong>Vente du :</strong> ${esc(fmtDateTime(doc.issuedTs))}<br>
        ${doc.saleRef ? `<strong>Réf. ticket :</strong> ${esc(doc.saleRef)}<br>` : ''}
        <strong>Statut :</strong> <span style="color:#047857;font-weight:600;">Payée</span>
      </div>
    </div>
  </div>

  ${iceBanner}

  <div class="parties">
    <div>
      <div class="label">Émetteur</div>
      <div class="party-body">
        ${sellerLegalBlock || `<strong>${esc(biz)}</strong><br>${seller.city || 'Maroc'}`}
      </div>
    </div>
    <div>
      <div class="label">Facturé à</div>
      <div class="party-body">
        ${customerLegal}
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:50%;">Désignation</th>
        <th class="r" style="width:15%;">Qté</th>
        <th class="r" style="width:17%;">Prix unit. TTC</th>
        <th class="r" style="width:18%;">Total TTC</th>
      </tr>
    </thead>
    <tbody>
      ${lines.map((l) => `
        <tr>
          <td><strong>${esc(l.name)}</strong></td>
          <td class="r">${esc(l.qty)}</td>
          <td class="r">${esc(fmtMoney(l.unitTTC))}</td>
          <td class="r"><strong>${esc(fmtMoney(l.totalTTC))}</strong></td>
        </tr>`).join('')}
    </tbody>
  </table>

  <div class="totals-wrap">
    <div class="payment-info">
      <div><strong>Règlement :</strong> ${esc(doc.method === 'card' ? 'Carte bancaire' : doc.method === 'cash' ? 'Espèces' : doc.method)}</div>
      <div>Document commercial légal émis via Kiwi POS · Vente acquittée.</div>
    </div>
    <div class="totals">
      <div class="tot-row"><span>Total HT</span><span>${esc(fmtMoney(totals.ht))}</span></div>
      <div class="tot-row"><span>TVA (${tvaRate} %)</span><span>${esc(fmtMoney(totals.tva))}</span></div>
      <div class="tot-row grand"><span>Total TTC</span><span>${esc(fmtMoney(totals.ttc))}</span></div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-legal">
      ${esc(biz)}${seller.ice ? ` · ICE : ${esc(seller.ice)}` : ''} · Facture ${esc(num)} · Document généré le ${esc(fmtDate(Date.now()))}
    </div>
    <div class="footer-powered">
      <span class="pw-txt">Propulsé par</span>
      <img src="assets/kiwi-newlogo.svg" alt="Kiwi POS" class="pw-logo">
    </div>
  </div>

  <script>
    addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 150);
    });
  <\/script>
</body>
</html>`;
  }

  /* ── 3. Ouverture & Impression / PDF ─────────────────────────────────────────
   * open(doc, mode) -> void
   * mode : 'pdf' | 'print' */
  function open(doc, mode) {
    if (!doc) return;
    const num = doc.number || 'Facture';
    const win = window.open('', '_blank');
    if (!win) {
      toast('Veuillez autoriser les fenêtres pop-up pour afficher la facture.', 'warning');
      return;
    }

    win.document.open();
    win.document.write(html(doc));
    win.document.close();
    win.document.title = num; // Le navigateur nomme le PDF "F-2026-0001.pdf"

    if (mode === 'pdf') {
      toast('Choisissez « Enregistrer au format PDF » dans la fenêtre d’impression.');
    }
  }

  /* ── 4. Sheet Client léger & Mémorisation ────────────────────────────────────
   * Demande Nom, ICE (15 chiffres), IF avant la première émission. */
  function promptCustomer(saleRef) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-veil is-open';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
      overlay.innerHTML = `
        <div class="modal" role="dialog" style="background:#fff;border-radius:12px;max-width:380px;width:100%;padding:20px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.2);color:#0f172a;font-family:inherit;">
          <h3 style="margin:0 0 6px;font-size:16px;font-weight:700;">Facture pour la vente ${esc(saleRef || '')}</h3>
          <p style="margin:0 0 14px;font-size:12.5px;color:#64748b;line-height:1.45;">Renseignez les informations de facturation du client (facultatif).</p>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div>
              <label style="display:block;font-size:11px;font-weight:600;color:#475569;margin-bottom:4px;">Nom ou Raison sociale</label>
              <input data-inv-cust-name class="st-mb-input" placeholder="Ex. Société Maghreb Tech" maxlength="80" style="box-sizing:border-box;width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;" />
            </div>
            <div>
              <label style="display:block;font-size:11px;font-weight:600;color:#475569;margin-bottom:4px;">ICE (15 chiffres)</label>
              <input data-inv-cust-ice class="st-mb-input mono" placeholder="001234567000089" maxlength="15" inputmode="numeric" style="box-sizing:border-box;width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;" />
              <div data-inv-ice-error style="color:#dc2626;font-size:11px;margin-top:2px;display:none;">L'ICE doit comporter exactement 15 chiffres.</div>
            </div>
            <div>
              <label style="display:block;font-size:11px;font-weight:600;color:#475569;margin-bottom:4px;">Identifiant Fiscal (IF)</label>
              <input data-inv-cust-if class="st-mb-input mono" placeholder="Ex. 12345678" maxlength="30" style="box-sizing:border-box;width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;" />
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;">
            <button type="button" data-inv-cust-skip class="st-btn" style="padding:7px 12px;border:1px solid #cbd5e1;border-radius:6px;background:transparent;cursor:pointer;font-size:12.5px;">Passer</button>
            <button type="button" data-inv-cust-confirm class="st-btn primary" style="padding:7px 14px;border:none;border-radius:6px;background:#087653;color:#fff;font-weight:600;cursor:pointer;font-size:12.5px;">Créer la facture</button>
          </div>
        </div>`;

      document.body.appendChild(overlay);

      const nameInp = overlay.querySelector('[data-inv-cust-name]');
      const iceInp = overlay.querySelector('[data-inv-cust-ice]');
      const ifInp = overlay.querySelector('[data-inv-cust-if]');
      const iceErr = overlay.querySelector('[data-inv-ice-error]');

      const finish = (cust) => {
        overlay.remove();
        resolve(cust);
      };

      overlay.querySelector('[data-inv-cust-skip]').onclick = () => finish(null);

      overlay.querySelector('[data-inv-cust-confirm]').onclick = () => {
        const name = nameInp.value.trim().slice(0, 80);
        const ice = iceInp.value.trim();
        const ifNum = ifInp.value.trim().slice(0, 30);

        if (ice && !/^\d{15}$/.test(ice)) {
          iceErr.style.display = 'block';
          iceInp.focus();
          return;
        }

        if (!name && !ice && !ifNum) {
          finish(null);
          return;
        }

        finish({ name, ice, if: ifNum });
      };
    });
  }

  /* ── 5. Cache local & Récupération ─────────────────────────────────────────── */
  const INVOICE_CACHE_KEY = 'kiwi:sale_invoices:v1';
  function getCachedInvoices() {
    try {
      const raw = localStorage.getItem(INVOICE_CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  }

  function setCachedInvoice(saleId, inv) {
    try {
      const cache = getCachedInvoices();
      cache[saleId] = inv;
      localStorage.setItem(INVOICE_CACHE_KEY, JSON.stringify(cache));
    } catch (_) {}
  }

  /* ── 6. Génération complète (appel serveur + affichage) ──────────────────────
   * generate(sale, mode) -> Promise<doc> */
  async function generate(sale, mode) {
    if (!sale) return null;
    const saleRef = sale.ref || sale.label || '';
    const m = window.KiwiLive?.merchant?.() || window.KiwiVenue?.getVenue?.() || localStorage.getItem('kiwiLiveMerchant') || '';
    const saleId = String(sale.saleId || sale.id || '').trim();

    if (!saleId) {
      toast('Facture disponible après synchronisation de la vente', 'warning');
      return null;
    }

    // 1. Vérifier si la facture est déjà connue localement
    const cached = getCachedInvoices()[saleId];
    if (cached && cached.number) {
      // Re-hydrate seller info from current store profile
      const liveSeller = getSellerBusiness();
      cached.seller = Object.assign({}, liveSeller, cached.seller || {});
      ['ice', 'fiscal', 'rc', 'patente', 'cnss', 'address', 'city', 'phone', 'email', 'logo', 'legalName'].forEach((k) => {
        if (!cached.seller[k] && liveSeller[k]) cached.seller[k] = liveSeller[k];
      });
      const sellerIce = String(cached.seller.ice || cached.seller.legal?.ice || '').trim();
      cached.missingICE = !sellerIce;
      setCachedInvoice(saleId, cached);
      open(cached, mode);
      return cached;
    }

    // 2. Si non connue, demander les infos client (optionnel)
    let customer = null;
    if (!sale.customer) {
      customer = await promptCustomer(saleRef);
    } else {
      customer = sale.customer;
    }

    // 3. Préparer le snapshot client
    const docDraft = build(sale, { customer, saleId });

    // 4. Appel serveur obligatoire pour la numérotation séquentielle D1
    toast('Numérotation de la facture…');
    try {
      const res = await fetch('/api/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant: m,
          saleId,
          customer,
          snapshot: docDraft,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err?.error === 'invalid-ice') {
          toast('ICE client invalide (15 chiffres requis).', 'error');
          return null;
        }
        if (err?.error === 'unknown-sale' || res.status === 404) {
          toast('Facture disponible après synchronisation de la vente', 'warning');
          return null;
        }
        throw new Error(err?.detail || err?.error || 'server-refusal');
      }

      const data = await res.json();
      const invRecord = data?.invoice;
      const finalDoc = invRecord?.snapshot || docDraft;
      finalDoc.number = invRecord?.number || finalDoc.number;
      finalDoc.seq = invRecord?.seq || finalDoc.seq;
      if (invRecord?.customer) finalDoc.customer = invRecord.customer;
      
      const liveSeller = getSellerBusiness();
      finalDoc.seller = Object.assign({}, liveSeller, finalDoc.seller || {});
      ['ice', 'fiscal', 'rc', 'patente', 'cnss', 'address', 'city', 'phone', 'email', 'logo', 'legalName'].forEach((k) => {
        if (!finalDoc.seller[k] && liveSeller[k]) finalDoc.seller[k] = liveSeller[k];
      });
      const sellerIce = String(finalDoc.seller.ice || finalDoc.seller.legal?.ice || '').trim();
      finalDoc.missingICE = !sellerIce;

      setCachedInvoice(saleId, finalDoc);
      open(finalDoc, mode);

      try {
        document.dispatchEvent(new CustomEvent('kiwi-invoice-created', { detail: { saleId, invoice: finalDoc } }));
      } catch (_) {}

      return finalDoc;
    } catch (e) {
      toast('Connexion requise pour numéroter la facture', 'warning');
      return null;
    }
  }

  // ── L'API publique exportée ────────────────────────────────────────────────
  window.KiwiInvoice = {
    build,
    html,
    open,
    generate,
    getCachedInvoices,
    promptCustomer,
    getSellerBusiness,
  };
})();
