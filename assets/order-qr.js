/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · ORDER QR — the real, printable QR generator for the self-order page.
 * ---------------------------------------------------------------------------
 * Emits SCANNABLE QR codes (via window.KiwiQR) that point a diner's phone at
 *   <origin>/kiwi-order.html?merchant=<slug>[&table=N]
 * — the multi-merchant customer page. Two products:
 *   · one venue QR ("menu général") — the customer picks their table on the page.
 *   · one QR per table (&table=N) — the page opens straight on that table.
 * Copy the link, download a PNG, or print a clean A4 sheet of table tents.
 *
 * Identity: merchant slug = KiwiCaisseLink.slugMerchant(business) (the SAME key
 * the order page + /api/menu use). On the LOCAL demo (KiwiEnv.isReal() false) the
 * QR points at the plain demo page (no ?merchant) so it shows the Café Atlas demo
 * — the pitch stays scannable end-to-end.
 *
 * Requires: interactive.js (Kiwi.drawer/toast), assets/qrcode.js (KiwiQR).
 * ═══════════════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';
  if (!window.Kiwi) { console.warn('order-qr.js loaded before interactive.js'); return; }
  const { drawer, toast } = window.Kiwi;
  const lang = () => (window.KiwiI18n?.getLang?.() || 'fr');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const T = {
    fr: {
      title: 'QR de commande', sub: 'Le client scanne, ouvre votre carte et commande depuis sa table.',
      venueH: 'QR de l\'établissement', venueP: 'Une seule affiche à l\'entrée ou au comptoir. Le client choisit sa table sur la page.',
      copy: 'Copier le lien', copied: 'Lien copié', dl: 'Télécharger (PNG)', print: 'Imprimer',
      tablesH: 'Une affiche par table', tablesP: 'Génère un QR par table — la page s\'ouvre directement sur le bon numéro.',
      count: 'Nombre de tables', gen: 'Générer', printSheet: 'Imprimer la planche',
      table: 'Table', scanToOrder: 'Scannez pour commander', dlOne: 'Télécharger',
      demoNote: 'Aperçu démo — en ligne, le QR portera l\'adresse de votre établissement.',
      noPrint: 'Impression bloquée par le navigateur. Autorisez les fenêtres pop-up.',
    },
    en: {
      title: 'Order QR', sub: 'The guest scans, opens your menu and orders from their table.',
      venueH: 'Venue QR', venueP: 'One poster at the door or counter. The guest picks their table on the page.',
      copy: 'Copy link', copied: 'Link copied', dl: 'Download (PNG)', print: 'Print',
      tablesH: 'One poster per table', tablesP: 'Generate one QR per table — the page opens straight on the right number.',
      count: 'Number of tables', gen: 'Generate', printSheet: 'Print the sheet',
      table: 'Table', scanToOrder: 'Scan to order', dlOne: 'Download',
      demoNote: 'Demo preview — online, the QR will carry your venue\'s address.',
      noPrint: 'Printing blocked by the browser. Allow pop-ups.',
    },
    ar: {
      title: 'رمز الطلب', sub: 'الزبون يمسح الرمز، يفتح قائمتك ويطلب من طاولته.',
      venueH: 'رمز المحل', venueP: 'ملصق واحد عند الباب أو الكاونتر. يختار الزبون طاولته في الصفحة.',
      copy: 'نسخ الرابط', copied: 'تم نسخ الرابط', dl: 'تنزيل (PNG)', print: 'طباعة',
      tablesH: 'ملصق لكل طاولة', tablesP: 'ولّد رمزاً لكل طاولة — تُفتح الصفحة مباشرة على الرقم الصحيح.',
      count: 'عدد الطاولات', gen: 'توليد', printSheet: 'طباعة اللوحة',
      table: 'طاولة', scanToOrder: 'امسح للطلب', dlOne: 'تنزيل',
      demoNote: 'معاينة تجريبية — على الإنترنت سيحمل الرمز عنوان محلك.',
      noPrint: 'الطباعة محظورة من المتصفح. اسمح بالنوافذ المنبثقة.',
    },
  };
  const tr = () => T[lang()] || T.fr;

  // ── identity + URL ─────────────────────────────────────────────────────────
  function isReal() { try { return !!(window.KiwiEnv && KiwiEnv.isReal && KiwiEnv.isReal()); } catch (_) { return false; } }
  function localSlug(name) {
    return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'client';
  }
  function biz() {
    let name = '';
    /* Le slug gravé de l'établissement (venues.js › slugOf). Il part sur du
     * papier — un QR collé sur une table ne se re-imprime pas parce qu'on a
     * corrigé l'orthographe de l'enseigne, alors que le slug reconstruit depuis
     * le nom, lui, aurait changé sous les pieds des clients. */
    let pinned = '';
    // The STORE this code is being printed for, ahead of the account that owns
    // it. The slug goes into the customer-facing ordering link, so deriving it
    // from the single account name made every store on the account print the
    // same URL — a diner scanning the restaurant's code reached the boutique.
    try { const vd = window.KiwiVenue && KiwiVenue.isCustom && KiwiVenue.isCustom() && KiwiVenue.getCurrentVenueData && KiwiVenue.getCurrentVenueData(); if (vd && vd.name) name = String(vd.name).trim(); if (vd && vd.slug) pinned = String(vd.slug); } catch (_) {}
    if (!name) { try { if (window.KiwiMe && KiwiMe.business) name = String(KiwiMe.business).trim(); } catch (_) {} }
    if (!name) { try { name = (localStorage.getItem('kiwiBizName') || '').trim(); } catch (_) {} }
    if (!name) name = isReal() ? 'Votre établissement' : 'Café Atlas';
    const slug = pinned
      || ((window.KiwiCaisseLink && KiwiCaisseLink.slugMerchant) ? KiwiCaisseLink.slugMerchant(name) : localSlug(name));
    return { name, slug };
  }
  function orderUrl(table) {
    const origin = location.origin;
    // Local demo → plain page (byte-identical Café Atlas). Real → carry the slug.
    if (!isReal()) return origin + '/kiwi-order.html' + (table ? ('?table=' + table) : '');
    let u = origin + '/kiwi-order.html?merchant=' + encodeURIComponent(biz().slug);
    if (table) u += '&table=' + encodeURIComponent(table);
    return u;
  }

  // ── QR helpers ─────────────────────────────────────────────────────────────
  function qrSvg(url, size) {
    if (!window.KiwiQR) return '<div style="color:var(--danger);font-size:12px;">QR indisponible</div>';
    try { return KiwiQR.svg(url, { size: size || 220, margin: 3, ecl: 'M', dark: '#0A0F0D', light: '#ffffff' }); }
    catch (e) { return '<div style="color:var(--danger);font-size:12px;">' + esc(String(e.message || e)) + '</div>'; }
  }
  function svgToPng(svgStr, size, cb) {
    const img = new Image();
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = size; c.height = size;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size); URL.revokeObjectURL(url);
      c.toBlob((b) => cb(b), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
  }
  function downloadBlob(blob, filename) {
    if (!blob) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function downloadQr(url, filename) { svgToPng(qrSvg(url, 900), 900, (b) => downloadBlob(b, filename)); }

  // ── print sheet (self-contained A4 window) ─────────────────────────────────
  function printSheet(cards) {
    const b = biz(), t = tr();
    const win = window.open('', '_blank');
    if (!win) { toast(t.noPrint, { type: 'error' }); return; }
    const tiles = cards.map((c) => `
      <div class="tent">
        <div class="v">${esc(b.name)}</div>
        ${c.label ? `<div class="tn">${esc(c.label)}</div>` : ''}
        <div class="q">${qrSvg(c.url, 260)}</div>
        <div class="cap">${esc(t.scanToOrder)}</div>
        <div class="kiwi">kiwi<i></i></div>
      </div>`).join('');
    win.document.write(`<!doctype html><html lang="${lang()}"><head><meta charset="utf-8"><title>${esc(b.name)} · QR</title>
      <style>
        @page { size: A4; margin: 12mm; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { margin: 0; font-family: -apple-system, "Inter Tight", "Segoe UI", system-ui, sans-serif; color: #0A0F0D; }
        .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10mm; }
        .tent { border: 1.5px dashed #cbd3cd; border-radius: 14px; padding: 10mm 6mm; text-align: center; page-break-inside: avoid; }
        .v { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
        .tn { font-family: ui-monospace, "JetBrains Mono", monospace; font-size: 13px; color: #0B6E4F; margin-top: 3px; }
        .q { margin: 8px auto 6px; width: 200px; height: 200px; }
        .q svg { width: 100%; height: 100%; }
        .cap { font-size: 12px; color: #4A4A4A; }
        .kiwi { margin-top: 8px; font-weight: 700; font-size: 15px; letter-spacing: -0.05em; color: #0B6E4F; }
        .kiwi i { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: #7DF2B0; margin-left: 2px; vertical-align: 1px; }
      </style></head>
      <body><div class="grid">${tiles}</div>
      <script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script>
      </body></html>`);
    win.document.close();
  }

  // ── styles ─────────────────────────────────────────────────────────────────
  const CSS = `
  .oq-wrap { padding: 22px 24px 8px; }
  .oq-note { font-size: 12px; color: var(--n-500); background: var(--paper-soft); border: 1px solid var(--n-200);
    border-radius: 10px; padding: 8px 12px; margin-bottom: 18px; }
  .oq-card { display: grid; grid-template-columns: auto 1fr; gap: 20px; align-items: center;
    background: var(--surface); border: 1px solid var(--n-200); border-radius: 18px; padding: 20px; }
  .oq-qr { width: 168px; height: 168px; background: var(--surface); border-radius: 14px; padding: 10px;
    box-shadow: 0 8px 22px -12px rgba(10,15,13,.28), inset 0 0 0 1px rgba(10,15,13,.05); }
  .oq-qr svg { width: 100%; height: 100%; display: block; }
  .oq-card h3 { margin: 0 0 6px; font-size: 17px; letter-spacing: -0.01em; color: var(--ink); }
  .oq-card p { margin: 0 0 12px; font-size: 13px; color: var(--n-600); line-height: 1.5; max-width: 48ch; }
  .oq-url { display: flex; align-items: center; gap: 8px; font-family: var(--mono); font-size: 12px; color: var(--n-600);
    background: var(--paper-soft); border: 1px solid var(--n-200); border-radius: 9px; padding: 8px 10px; margin-bottom: 12px;
    overflow: hidden; }
  .oq-url span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .oq-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .oq-btn { display: inline-flex; align-items: center; gap: 6px; font-family: var(--sans); font-size: 13px; font-weight: 500;
    padding: 9px 14px; border-radius: 10px; border: 1px solid var(--n-200); background: var(--surface); color: var(--ink); cursor: pointer;
    transition: border-color .14s, background .14s; }
  .oq-btn:hover { border-color: var(--n-300); background: var(--paper-soft); }
  .oq-btn.primary { background: var(--atlas); color: #fff; border-color: var(--atlas); }
  .oq-btn.primary:hover { filter: brightness(1.05); background: var(--atlas); }
  .oq-sec { margin-top: 26px; }
  .oq-sec-h { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
  .oq-sec-h h3 { margin: 0; font-size: 16px; letter-spacing: -0.01em; color: var(--ink); }
  .oq-sec p { margin: 0 0 14px; font-size: 13px; color: var(--n-600); }
  .oq-gen { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
  .oq-field label { display: block; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--n-500); margin-bottom: 5px; }
  .oq-field input { width: 120px; font-family: var(--sans); font-size: 14.5px; padding: 10px 12px; border: 1.5px solid var(--n-200);
    border-radius: 10px; background: var(--surface); color: var(--ink); outline: none; }
  .oq-field input:focus { border-color: var(--atlas); }
  .oq-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 14px; }
  .oq-tile { text-align: center; background: var(--surface); border: 1px solid var(--n-200); border-radius: 14px; padding: 12px 10px; }
  .oq-tile .t { font-family: var(--mono); font-size: 12px; color: var(--n-600); margin-bottom: 8px; }
  .oq-tile .oq-qr { width: 108px; height: 108px; margin: 0 auto 10px; }
  .oq-tile .dl { font-size: 11.5px; color: var(--atlas); cursor: pointer; background: none; border: 0; font-family: var(--sans); }
  .oq-tile .dl:hover { text-decoration: underline; }
  .oq-foot { display: flex; justify-content: flex-end; gap: 10px; margin: 22px 0 6px; }
  html[data-theme="dark"] .oq-qr { background: var(--surface); }
  @media (max-width: 640px){ .oq-card { grid-template-columns: 1fr; text-align: center; } .oq-qr { margin: 0 auto; } .oq-url span { max-width: 60vw; } }
  `;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

  // ── drawer ───────────────────────────────────────────────────────────────
  window.Kiwi.handlers['order-qr'] = () => {
    const t = tr(), b = biz();
    const venueUrl = orderUrl('');
    const body = `<div class="oq-wrap">
      ${!isReal() ? `<div class="oq-note">${esc(t.demoNote)}</div>` : ''}
      <div class="oq-card">
        <div class="oq-qr" data-oq-venue>${qrSvg(venueUrl, 220)}</div>
        <div>
          <h3>${esc(t.venueH)}</h3>
          <p>${esc(t.venueP)}</p>
          <div class="oq-url"><span data-oq-url>${esc(venueUrl)}</span></div>
          <div class="oq-actions">
            <button class="oq-btn" data-oq-copy>${esc(t.copy)}</button>
            <button class="oq-btn" data-oq-dl>${esc(t.dl)}</button>
            <button class="oq-btn primary" data-oq-print-venue>${esc(t.print)}</button>
          </div>
        </div>
      </div>

      <div class="oq-sec">
        <div class="oq-sec-h"><h3>${esc(t.tablesH)}</h3></div>
        <p>${esc(t.tablesP)}</p>
        <div class="oq-gen">
          <div class="oq-field"><label>${esc(t.count)}</label><input type="number" min="1" max="200" value="12" data-oq-count></div>
          <button class="oq-btn" data-oq-gen>${esc(t.gen)}</button>
          <button class="oq-btn" data-oq-print-tables hidden>${esc(t.printSheet)}</button>
        </div>
        <div class="oq-tiles" data-oq-tiles></div>
      </div>
    </div>`;

    const d = drawer({ title: t.title, subtitle: t.sub, fullpage: true, body });
    const root = d.el;
    const tilesEl = root.querySelector('[data-oq-tiles]');
    const printTablesBtn = root.querySelector('[data-oq-print-tables]');

    function renderTiles() {
      const input = root.querySelector('[data-oq-count]');
      let n = parseInt(input.value, 10); if (isNaN(n) || n < 1) n = 1; if (n > 200) n = 200; input.value = n;
      let html = '';
      for (let i = 1; i <= n; i++) {
        html += `<div class="oq-tile" data-tn="${i}">
          <div class="t">${esc(t.table)} ${i}</div>
          <div class="oq-qr">${qrSvg(orderUrl(String(i)), 120)}</div>
          <button class="dl" data-oq-dl-table="${i}">${esc(t.dlOne)}</button>
        </div>`;
      }
      tilesEl.innerHTML = html;
      printTablesBtn.hidden = false;
    }

    root.addEventListener('click', (e) => {
      const slug = biz().slug || 'kiwi';
      if (e.target.closest('[data-oq-copy]')) {
        const txt = root.querySelector('[data-oq-url]').textContent;
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
          .then(() => toast(t.copied, { type: 'success' }))
          .catch(() => { try { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast(t.copied, { type: 'success' }); } catch (_) {} });
        return;
      }
      if (e.target.closest('[data-oq-dl]')) { downloadQr(venueUrl, 'kiwi-qr-' + slug + '.png'); return; }
      if (e.target.closest('[data-oq-print-venue]')) { printSheet([{ url: venueUrl, label: '' }]); return; }
      if (e.target.closest('[data-oq-gen]')) { renderTiles(); return; }
      if (e.target.closest('[data-oq-print-tables]')) {
        const tiles = [...tilesEl.querySelectorAll('[data-tn]')].map((el) => {
          const i = el.getAttribute('data-tn');
          return { url: orderUrl(i), label: t.table + ' ' + i };
        });
        if (tiles.length) printSheet(tiles);
        return;
      }
      const dlt = e.target.closest('[data-oq-dl-table]');
      if (dlt) { const i = dlt.getAttribute('data-oq-dl-table'); downloadQr(orderUrl(i), 'kiwi-qr-' + slug + '-table-' + i + '.png'); return; }
    });
  };
})();
