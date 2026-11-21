/* Fournisseurs · ce que nous devons, à qui, depuis quand (Inyad « took / gave »,
 * en mieux). Chargé à la première ouverture (LAZY_SECTIONS, assets/pages-pro.js).
 *
 * Données réelles : /api/suppliers (liste + soldes + ancienneté),
 * /api/suppliers/statement (relevé, solde courant, tableau du fournisseur),
 * /api/suppliers/entry (paiement, facture, dette d'avant Kiwi, annulation),
 * /api/cashbook (livre de caisse). Le grand livre et sa convention de signe :
 * functions/api/_ledger.js (solde > 0 = nous devons au fournisseur).
 *
 * Une session de démonstration voit des fournisseurs d'exemple, tenus en
 * mémoire et jamais envoyés. Un compte réel ne voit jamais d'exemple.
 * Relevé imprimable, export CSV, brouillon WhatsApp (wa.me, rien n'est envoyé
 * sans que le patron appuie sur Envoyer), ancienneté 0–30 / 31–60 / 61–90 / 90+.
 */
(() => {
  'use strict';
  const K = window.Kiwi;
  if (!K || !K.handlers) return;
  const H = K.handlers;
  const lang = () => (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
  const L = (fr, en, ar) => { const l = lang(); return l === 'en' ? en : l === 'ar' ? ar : fr; };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => (window.KiwiNumber && window.KiwiNumber.format ? window.KiwiNumber.format(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (Math.round(n * 100) / 100).toFixed(2));
  const mad = (cents) => num((Number(cents) || 0) / 100) + ' ' + L('MAD', 'MAD', 'درهم');
  const todayYmd = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dmy = (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(ymd || ''); };
  const idem = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  const slug = () => { try { return (window.KiwiStore && window.KiwiStore.slugFor && window.KiwiStore.slugFor()) || ''; } catch (_) { return ''; } };
  const isReal = () => {
    try { if (window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()) return true; } catch (_) {}
    try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); } catch (_) { return false; }
  };

  /* Material Symbols, Outlined 400 (assets/icons/material/). */
  const P = {
    truck: 'M155-195q-35-35-35-85H40v-440q0-33 23.5-56.5T120-800h560v160h120l120 160v200h-80q0 50-35 85t-85 35q-50 0-85-35t-35-85H360q0 50-35 85t-85 35q-50 0-85-35Zm113.5-56.5Q280-263 280-280t-11.5-28.5Q257-320 240-320t-28.5 11.5Q200-297 200-280t11.5 28.5Q223-240 240-240t28.5-11.5ZM120-360h32q17-18 39-29t49-11q27 0 49 11t39 29h272v-360H120v360Zm628.5 108.5Q760-263 760-280t-11.5-28.5Q737-320 720-320t-28.5 11.5Q680-297 680-280t11.5 28.5Q703-240 720-240t28.5-11.5ZM680-440h170l-90-120h-80v120ZM360-540Z',
    pay: 'M560-440q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35ZM280-320q-33 0-56.5-23.5T200-400v-320q0-33 23.5-56.5T280-800h560q33 0 56.5 23.5T920-720v320q0 33-23.5 56.5T840-320H280Zm80-80h400q0-33 23.5-56.5T840-480v-160q-33 0-56.5-23.5T760-720H360q0 33-23.5 56.5T280-640v160q33 0 56.5 23.5T360-400Zm440 240H120q-33 0-56.5-23.5T40-240v-440h80v440h680v80ZM280-400v-320 320Z',
    chat: 'M240-400h320v-80H240v80Zm0-120h480v-80H240v80Zm0-120h480v-80H240v80ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z',
    print: 'M640-640v-120H320v120h-80v-200h480v200h-80Zm-480 80h640-640Zm560 100q17 0 28.5-11.5T760-500q0-17-11.5-28.5T720-540q-17 0-28.5 11.5T680-500q0 17 11.5 28.5T720-460Zm-80 260v-160H320v160h320Zm80 80H240v-160H80v-240q0-51 35-85.5t85-34.5h560q51 0 85.5 34.5T880-520v240H720v160Zm80-240v-160q0-17-11.5-28.5T760-560H200q-17 0-28.5 11.5T160-520v160h80v-80h480v80h80Z',
    csv: 'M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z',
    add: 'M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z',
    edit: 'M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z',
    archive: 'm480-240 160-160-56-56-64 64v-168h-80v168l-64-64-56 56 160 160ZM200-640v440h560v-440H200Zm0 520q-33 0-56.5-23.5T120-200v-499q0-14 4.5-27t13.5-24l50-61q11-14 27.5-21.5T250-840h460q18 0 34.5 7.5T772-811l50 61q9 11 13.5 24t4.5 27v499q0 33-23.5 56.5T760-120H200Zm16-600h528l-34-40H250l-34 40Zm264 300Z',
    search: 'M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z',
    back: 'm313-440 224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z',
    bill: 'M240-80q-50 0-85-35t-35-85v-120h120v-560l60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60v680q0 50-35 85t-85 35H240Zm480-80q17 0 28.5-11.5T760-200v-560H320v440h360v120q0 17 11.5 28.5T720-160ZM360-600v-80h240v80H360Zm0 120v-80h240v80H360Zm320-120q-17 0-28.5-11.5T640-640q0-17 11.5-28.5T680-680q17 0 28.5 11.5T720-640q0 17-11.5 28.5T680-600Zm0 120q-17 0-28.5-11.5T640-520q0-17 11.5-28.5T680-560q17 0 28.5 11.5T720-520q0 17-11.5 28.5T680-480ZM240-160h360v-80H200v40q0 17 11.5 28.5T240-160Zm-40 0v-80 80Z',
    wallet: 'M200-200v-560 560Zm0 80q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v100h-80v-100H200v560h560v-100h80v100q0 33-23.5 56.5T760-120H200Zm320-160q-33 0-56.5-23.5T440-360v-240q0-33 23.5-56.5T520-680h280q33 0 56.5 23.5T880-600v240q0 33-23.5 56.5T800-280H520Zm280-80v-240H520v240h280Zm-117.5-77.5Q700-455 700-480t-17.5-42.5Q665-540 640-540t-42.5 17.5Q580-505 580-480t17.5 42.5Q615-420 640-420t42.5-17.5Z',
    call: 'M798-120q-125 0-247-54.5T329-329Q229-429 174.5-551T120-798q0-18 12-30t30-12h162q14 0 25 9.5t13 22.5l26 140q2 16-1 27t-11 19l-97 98q20 37 47.5 71.5T387-386q31 31 65 57.5t72 48.5l94-94q9-9 23.5-13.5T670-390l138 28q14 4 23 14.5t9 23.5v162q0 18-12 30t-30 12ZM241-600l66-66-17-94h-89q5 41 14 81t26 79Zm358 358q39 17 79.5 27t81.5 13v-88l-94-19-67 67ZM241-600Zm358 358Z',
  };
  const ic = (k) => `<svg class="sp-i" viewBox="0 -960 960 960" aria-hidden="true" fill="currentColor"><path d="${P[k]}"/></svg>`;

  const METHODS = ['cash', 'transfer', 'cheque', 'card', 'other'];
  const methodLabel = (m) => ({
    cash: L('Espèces', 'Cash', 'نقدًا'), transfer: L('Virement', 'Transfer', 'تحويل'), cheque: L('Chèque', 'Cheque', 'شيك'),
    card: L('Carte', 'Card', 'بطاقة'), other: L('Autre', 'Other', 'أخرى'),
  }[m] || m);
  const kindLabel = (k) => ({
    purchase: L('Réception', 'Goods received', 'استلام سلعة'), bill: L('Facture', 'Bill', 'فاتورة'),
    payment: L('Paiement', 'Payment', 'أداء'), return: L('Retour', 'Return', 'إرجاع'),
    expense: L('Dépense', 'Expense', 'مصروف'), 'expense-payment': L('Réglé à la dépense', 'Paid with the expense', 'تخلّص مع المصروف'),
    opening: L("Dette d'avant Kiwi", 'Balance before Kiwi', 'دين قبل Kiwi'), manual: L('Mouvement', 'Entry', 'حركة'),
    adjustment: L('Ajustement', 'Adjustment', 'تسوية'),
  }[k] || k);
  const AGE = () => [['0-30', L('0 à 30 j', '0–30 d', '0 إلى 30 يوم')], ['31-60', L('31 à 60 j', '31–60 d', '31 إلى 60 يوم')], ['61-90', L('61 à 90 j', '61–90 d', '61 إلى 90 يوم')], ['90+', L('plus de 90 j', '90+ d', 'أكثر من 90 يوم')]];

  /* Qui doit à qui, en mots. Solde > 0 : nous devons au fournisseur. */
  function owedChip(balance) {
    const b = Number(balance) || 0;
    if (b > 0) return `<span class="sp-chip owe">${esc(L('Vous devez', 'You owe', 'باقي عليك'))} ${esc(mad(b))}</span>`;
    if (b < 0) return `<span class="sp-chip adv">${esc(L('Il vous doit', 'Owes you', 'باقي عليه لك'))} ${esc(mad(-b))}</span>`;
    return `<span class="sp-chip ok">${esc(L('À jour', 'Settled', 'مخلّص'))}</span>`;
  }

  function css() {
    if (document.getElementById('sp-css')) return;
    const s = document.createElement('style');
    s.id = 'sp-css';
    s.textContent = `
.sp-i{width:18px;height:18px;flex:none}
.sp-wrap{display:grid;gap:14px}
.sp-card{border:1px solid var(--n-200,rgba(10,15,13,.12));border-radius:var(--r-xl,18px);background:var(--paper-elev,var(--paper,#F7F5F0));padding:18px;min-width:0}
.sp-kpis{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.sp-kpi .k{font-size:12px;color:var(--n-500,#667);letter-spacing:.02em}
.sp-kpi .v{font-size:24px;font-weight:600;margin-top:4px;font-variant-numeric:tabular-nums}
.sp-kpi .v.owe{color:var(--danger,#B42318)}
.sp-kpi .v.ok{color:var(--atlas,#0B6E4F)}
.sp-age{display:flex;height:10px;border-radius:999px;overflow:hidden;background:var(--n-100,rgba(10,15,13,.06));margin-top:12px}
.sp-age i{display:block;height:100%}
.sp-age i.a0{background:var(--atlas,#0B6E4F)}.sp-age i.a1{background:var(--warning,#C98A1B)}.sp-age i.a2{background:var(--warn-ink,#9A5B00)}.sp-age i.a3{background:var(--danger,#B42318)}
.sp-legend{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:10px;font-size:12.5px;color:var(--n-600,#3a4440)}
.sp-legend span{display:inline-flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums}
.sp-legend b{width:8px;height:8px;border-radius:50%;display:inline-block;font-weight:400}
.sp-legend b.a0{background:var(--atlas,#0B6E4F)}.sp-legend b.a1{background:var(--warning,#C98A1B)}.sp-legend b.a2{background:var(--warn-ink,#9A5B00)}.sp-legend b.a3{background:var(--danger,#B42318)}
.sp-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.sp-search{flex:1 1 220px;display:flex;align-items:center;gap:8px;padding:0 12px;height:40px;border-radius:12px;border:1px solid var(--n-200,rgba(10,15,13,.12));background:var(--surface,#FDFCF9);color:var(--n-500,#667)}
.sp-search input{flex:1;border:0;background:transparent;font:inherit;color:var(--ink,#0A0F0D);outline:none;min-width:0}
.sp-pills{display:inline-flex;gap:4px;padding:4px;border-radius:12px;background:var(--n-100,rgba(10,15,13,.06))}
.sp-pills button{border:0;background:transparent;font:inherit;font-size:13px;padding:6px 12px;border-radius:9px;color:var(--n-600,#3a4440);cursor:pointer}
.sp-pills button.on{background:var(--surface,#FDFCF9);color:var(--ink,#0A0F0D)}
.sp-btn{display:inline-flex;align-items:center;gap:6px}
.sp-list{display:grid}
.sp-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 14px;align-items:center;padding:13px 4px;border-top:1px solid var(--n-100,rgba(10,15,13,.08));cursor:pointer}
.sp-row:first-child{border-top:0}
.sp-row:hover{background:var(--n-50,rgba(10,15,13,.03))}
.sp-row .n{font-weight:600;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-row .m{font-size:12.5px;color:var(--n-500,#667);display:flex;gap:10px;flex-wrap:wrap}
.sp-row .r{display:grid;justify-items:end;gap:4px}
.sp-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;font-size:12.5px;font-variant-numeric:tabular-nums;white-space:nowrap}
.sp-chip.owe{background:rgba(180,35,24,.09);color:var(--danger,#B42318)}
.sp-chip.adv{background:var(--mint-soft,rgba(125,242,176,.18));color:var(--riad,#053B2C)}
.sp-chip.ok{background:var(--n-100,rgba(10,15,13,.06));color:var(--n-600,#3a4440)}
.sp-chip.late{background:var(--warn-soft,rgba(201,138,27,.14));color:var(--warn-ink,#9A5B00)}
.sp-empty{text-align:center;padding:36px 12px;color:var(--n-600,#3a4440)}
.sp-empty .sp-i{width:36px;height:36px;color:var(--atlas,#0B6E4F)}
.sp-head{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;justify-content:space-between}
.sp-head h2{margin:0;font-size:20px;font-weight:600}
.sp-meta{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:6px;font-size:13px;color:var(--n-600,#3a4440)}
.sp-meta span{display:inline-flex;align-items:center;gap:5px}
.sp-big{font-size:30px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:4px}
.sp-big.owe{color:var(--danger,#B42318)}.sp-big.adv{color:var(--atlas,#0B6E4F)}
.sp-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.sp-grid{display:grid;gap:14px}
@media(min-width:1000px){.sp-grid{grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)}}
.sp-score{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.sp-score .k{font-size:12px;color:var(--n-500,#667)}
.sp-score .v{font-size:17px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:2px}
.sp-meter{height:6px;border-radius:999px;background:var(--n-100,rgba(10,15,13,.06));margin-top:6px;overflow:hidden}
.sp-meter i{display:block;height:100%;background:var(--atlas,#0B6E4F)}
.sp-h3{margin:0 0 10px;font-size:14.5px;font-weight:600}
.sp-scroll{overflow-x:auto;margin:0 -4px}
.sp-table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
.sp-table th{text-align:start;font-weight:500;color:var(--n-500,#667);font-size:12px;padding:8px 6px;border-bottom:1px solid var(--n-200,rgba(10,15,13,.12));white-space:nowrap}
.sp-table td{padding:9px 6px;border-bottom:1px solid var(--n-100,rgba(10,15,13,.07));vertical-align:top}
.sp-table .num{text-align:end;white-space:nowrap}
.sp-table .lbl{min-width:160px}
.sp-table .lbl small{display:block;color:var(--n-500,#667);font-size:11.5px;margin-top:2px}
.sp-void{border:0;background:transparent;color:var(--n-400,#889);cursor:pointer;font:inherit;font-size:12px;padding:2px 4px}
.sp-void:hover{color:var(--danger,#B42318)}
.sp-po{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:9px 0;border-top:1px solid var(--n-100,rgba(10,15,13,.07));font-size:13px}
.sp-po:first-of-type{border-top:0}
.sp-link{border:0;background:transparent;color:var(--atlas,#0B6E4F);cursor:pointer;font:inherit;display:inline-flex;align-items:center;gap:6px;padding:0}
.sp-form{display:grid;gap:12px}
.sp-form label{display:grid;gap:6px;font-size:12.5px;color:var(--n-600,#3a4440)}
.sp-form input,.sp-form textarea,.sp-form select{font:inherit;font-size:14px;padding:10px 12px;border-radius:10px;border:1px solid var(--n-200,rgba(10,15,13,.14));background:var(--surface,#FDFCF9);color:var(--ink,#0A0F0D)}
.sp-form .two{display:grid;gap:12px;grid-template-columns:1fr 1fr}
.sp-form input.sp-amt{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums}
.sp-seg{display:flex;flex-wrap:wrap;gap:6px}
.sp-seg button{border:1px solid var(--n-200,rgba(10,15,13,.14));background:var(--surface,#FDFCF9);color:var(--ink,#0A0F0D);font:inherit;font-size:13px;padding:7px 12px;border-radius:999px;cursor:pointer}
.sp-seg button.on{background:var(--atlas,#0B6E4F);border-color:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0)}
.sp-hint{font-size:12.5px;color:var(--n-500,#667);margin:0}
.sp-foot{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
@media(max-width:560px){.sp-form .two{grid-template-columns:1fr}.sp-big{font-size:26px}}
`;
    document.head.appendChild(s);
  }

  /* ── Démo : des fournisseurs d'exemple, en mémoire seulement ───────── */
  const DEMO = (() => {
    let seeded = null;
    const day = (n) => { const d = new Date(Date.now() - n * 86400000); return d.toISOString().slice(0, 10); };
    function seed() {
      if (seeded) return seeded;
      const sup = (id, name, phone, ice, terms) => ({ id, name, phone, email: '', ice, rib: '', bank: '', address: 'Casablanca', notes: '', termsDays: terms, archived: false });
      const l = (sid, n, dir, cents, kind, method, note) => ({ id: 'd' + Math.random().toString(36).slice(2, 9), partyId: sid, date: day(n), direction: dir, amountCents: cents, kind, method, note, createdAt: Date.now() - n * 86400000 });
      seeded = {
        suppliers: [sup('demo-atlas', 'Atlas Coffee Roasters', '0661234567', '001525487000045', 30), sup('demo-frais', 'Distrib Frais SARL', '0522445566', '002201145000077', 15),
          sup('demo-lait', 'Laiterie Centrale', '0600112233', '', 7), sup('demo-emb', 'Emballages du Souss', '0528221100', '001889201000012', 60)],
        lines: [
          l('demo-atlas', 95, 'in', 860000, 'purchase', 'other', 'Réception BC-2026-000012'), l('demo-atlas', 70, 'out', 500000, 'payment', 'transfer', ''),
          l('demo-atlas', 40, 'in', 640000, 'purchase', 'other', 'Réception BC-2026-000019'), l('demo-atlas', 12, 'in', 420000, 'purchase', 'other', 'Réception BC-2026-000024'),
          l('demo-frais', 25, 'in', 312000, 'purchase', 'other', 'Réception BL-4471'), l('demo-frais', 20, 'out', 312000, 'payment', 'cash', ''),
          l('demo-frais', 6, 'in', 188000, 'purchase', 'other', 'Réception BL-4502'),
          l('demo-lait', 3, 'in', 96000, 'bill', 'other', 'Facture lait semaine 47'), l('demo-lait', 1, 'out', 120000, 'payment', 'cash', 'Avance semaine 48'),
          l('demo-emb', 130, 'in', 245000, 'opening', 'other', "Dette d'avant Kiwi"),
        ],
        cash: [l('main', 4, 'in', 500000, 'manual', 'cash', 'Apport du patron'), l('main', 2, 'out', 80000, 'manual', 'cash', 'Réparation frigo')],
      };
      return seeded;
    }
    const live = (sid) => seed().lines.filter((x) => x.partyId === sid);
    const bal = (lines) => lines.reduce((s, x) => s + (x.direction === 'in' ? x.amountCents : -x.amountCents), 0);
    function ageing(lines) {
      const debts = [], cents = [0, 0, 0, 0]; let credit = 0, oldest = 0;
      lines.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((x) => { if (x.direction === 'in') debts.push({ date: x.date, left: x.amountCents }); else credit += x.amountCents; });
      debts.forEach((d) => { const u = Math.min(d.left, credit); d.left -= u; credit -= u; if (d.left <= 0) return;
        const days = Math.floor((Date.parse(todayYmd()) - Date.parse(d.date)) / 86400000); cents[days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3] += d.left; oldest = Math.max(oldest, days); });
      return { totalCents: cents.reduce((a, b) => a + b, 0), buckets: ['0-30', '31-60', '61-90', '90+'].map((key, i) => ({ key, cents: cents[i] })), oldestDays: oldest };
    }
    function statement(lines) {
      let run = 0;
      return { openingCents: 0, lines: lines.slice().sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt).map((x) => { run += x.direction === 'in' ? x.amountCents : -x.amountCents; return { ...x, inCents: x.direction === 'in' ? x.amountCents : 0, outCents: x.direction === 'out' ? x.amountCents : 0, runningCents: run }; }), closingCents: run };
    }
    return {
      list() {
        const d = seed(); let weOwe = 0, theyOwe = 0;
        const suppliers = d.suppliers.filter((s) => !s.archived).map((s) => { const ls = live(s.id), b = bal(ls); if (b > 0) weOwe += b; else theyOwe -= b;
          return { ...s, balanceCents: b, lines: ls.length, lastDate: ls.map((x) => x.date).sort().pop() || '', ageing: ageing(ls) }; });
        return { ok: true, demo: true, suppliers, totals: { weOweCents: weOwe, theyOweCents: theyOwe, count: suppliers.length, ageing: ageing(d.lines.filter((x) => x.partyId !== 'main')) } };
      },
      statement(id) {
        const s = seed().suppliers.find((x) => x.id === id); if (!s) return null;
        const ls = live(id), purchased = ls.filter((x) => x.direction === 'in').reduce((a, x) => a + x.amountCents, 0), paid = ls.filter((x) => x.kind === 'payment').reduce((a, x) => a + x.amountCents, 0), b = bal(ls);
        return { ok: true, demo: true, supplier: s, balance: { balanceCents: b }, statement: statement(ls), ageing: ageing(ls), orders: [],
          scorecard: { orderCount: ls.filter((x) => x.kind === 'purchase').length, orderedCents: purchased, averageOrderCents: Math.round(purchased / Math.max(1, ls.filter((x) => x.kind === 'purchase').length)), receivedPct: 100, notReceivedCents: 0, returnRatePct: 0, purchasedCents: purchased, paidCents: paid, paidPct: purchased ? Math.min(100, Math.round((paid / purchased) * 1000) / 10) : null, unpaidCents: Math.max(0, b) } };
      },
      post(sid, dir, cents, kind, method, note, date) { seed().lines.push({ id: 'd' + idem(), partyId: sid, date: date || todayYmd(), direction: dir, amountCents: cents, kind, method, note, createdAt: Date.now() }); },
      cash() { const d = seed(); return { ok: true, demo: true, balance: { balanceCents: bal(d.cash) }, statement: statement(d.cash) }; },
      cashPost(dir, cents, method, note, date) { seed().cash.push({ id: 'd' + idem(), partyId: 'main', date: date || todayYmd(), direction: dir, amountCents: cents, kind: 'manual', method, note, createdAt: Date.now() }); },
      add(s) { const row = { id: 'demo-' + idem(), archived: false, termsDays: 0, ...s }; seed().suppliers.push(row); return row; },
      edit(id, patch) { const s = seed().suppliers.find((x) => x.id === id); if (s) Object.assign(s, patch); return s; },
      void(id) { const d = seed(); d.lines = d.lines.filter((x) => x.id !== id); d.cash = d.cash.filter((x) => x.id !== id); },
    };
  })();

  /* ── Serveur ───────────────────────────────────────────────────────── */
  async function api(path, body) {
    const init = body ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: slug(), ...body }) }
      : { credentials: 'same-origin' };
    const url = body ? path : path + (path.includes('?') ? '&' : '?') + 'merchant=' + encodeURIComponent(slug());
    const r = await fetch(url, init);
    let j = null; try { j = await r.json(); } catch (_) { j = null; }
    if (!r.ok || !j || j.error) { const e = new Error((j && j.error) || 'http-' + r.status); e.code = (j && j.error) || 'http-' + r.status; throw e; }
    return j;
  }
  function errText(code) {
    return ({
      'owner-required': L('Réservé au propriétaire du commerce.', 'Owner only.', 'خاص بمول المحل.'),
      'bad-amount': L('Montant invalide.', 'Invalid amount.', 'المبلغ غير صحيح.'),
      'name-required': L('Le nom est obligatoire.', 'Name is required.', 'الاسم ضروري.'),
      unmigrated: L('Le grand livre arrive : la base de ce compte n\'est pas encore à jour.', 'The ledger is not ready on this account yet.', 'دفتر الحسابات مازال ما واجدش فهاد الحساب.'),
    }[code]) || L('Impossible pour le moment. Réessayez.', 'Not possible right now. Try again.', 'ما تقدرش دابا. عاود من بعد.');
  }

  const S = { list: null, sort: 'owe', q: '', view: 'list', id: '', detail: null, cash: null };

  /* ── Liste ─────────────────────────────────────────────────────────── */
  function ageBar(ageing) {
    const total = (ageing && ageing.totalCents) || 0;
    const buckets = (ageing && ageing.buckets) || [];
    const labels = AGE();
    const bar = total ? buckets.map((b, i) => b.cents ? `<i class="a${i}" style="width:${(b.cents / total) * 100}%"></i>` : '').join('') : '';
    return `<div class="sp-age" role="img" aria-label="${esc(L('Ancienneté de ce que vous devez', 'Age of what you owe', 'قدم الديون'))}">${bar}</div>
      <div class="sp-legend">${buckets.map((b, i) => `<span><b class="a${i}"></b>${esc(labels[i][1])} · ${esc(mad(b.cents))}</span>`).join('')}</div>`;
  }

  function sorted(list) {
    const q = S.q.trim().toLowerCase();
    const rows = list.filter((s) => !q || [s.name, s.phone, s.ice, s.email].some((v) => String(v || '').toLowerCase().includes(q)));
    if (S.sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name));
    else if (S.sort === 'recent') rows.sort((a, b) => String(b.lastDate || '').localeCompare(String(a.lastDate || '')));
    else rows.sort((a, b) => b.balanceCents - a.balanceCents || a.name.localeCompare(b.name));
    return rows;
  }

  function rowHtml(s) {
    const late = s.ageing && s.balanceCents > 0 && s.ageing.oldestDays > 60
      ? `<span class="sp-chip late">${esc(L('plus ancien', 'oldest', 'الأقدم'))} ${esc(String(s.ageing.oldestDays))} ${esc(L('j', 'd', 'يوم'))}</span>` : '';
    return `<div class="sp-row" data-action="sup-open" data-arg="${esc(s.id)}" role="button" tabindex="0">
      <div><div class="n">${esc(s.name)}</div><div class="m">${s.phone ? `<span>${esc(s.phone)}</span>` : ''}${s.lastDate ? `<span>${esc(L('dernier mouvement', 'last entry', 'آخر حركة'))} ${esc(dmy(s.lastDate))}</span>` : `<span>${esc(L('aucun mouvement', 'no entries yet', 'حتى حركة'))}</span>`}</div></div>
      <div class="r">${owedChip(s.balanceCents)}${late}</div></div>`;
  }

  function listBody() {
    const d = S.list;
    if (!d) return `<div class="sp-card sp-empty">${esc(L('Chargement des fournisseurs…', 'Loading suppliers…', 'كنجيبو الموردين…'))}</div>`;
    const t = d.totals || {};
    const rows = sorted(d.suppliers || []);
    const pill = (k, label) => `<button type="button" class="${S.sort === k ? 'on' : ''}" data-lens-item data-action="sup-sort" data-arg="${k}">${esc(label)}</button>`;
    return `<div class="sp-wrap">
      <div class="sp-card"><div class="sp-kpis">
        <div class="sp-kpi"><div class="k">${esc(L('Vous devez à vos fournisseurs', 'You owe your suppliers', 'عليك للموردين'))}</div><div class="v ${t.weOweCents ? 'owe' : 'ok'}">${esc(mad(t.weOweCents))}</div></div>
        <div class="sp-kpi"><div class="k">${esc(L('Avances chez eux', 'Advances with them', 'تسبيقات عندهم'))}</div><div class="v">${esc(mad(t.theyOweCents))}</div></div>
        <div class="sp-kpi"><div class="k">${esc(L('Fournisseurs', 'Suppliers', 'الموردون'))}</div><div class="v">${esc(String(t.count || 0))}</div></div>
      </div>${ageBar(t.ageing)}</div>
      <div class="sp-bar">
        <label class="sp-search">${ic('search')}<input type="search" data-sp-q value="${esc(S.q)}" placeholder="${esc(L('Chercher un fournisseur, un téléphone, un ICE', 'Search a supplier, phone or ICE', 'قلّب على مورد، تيليفون ولا ICE'))}" aria-label="${esc(L('Chercher', 'Search', 'بحث'))}"></label>
        <div class="sp-pills" data-lens-demo role="group" aria-label="${esc(L('Trier', 'Sort', 'ترتيب'))}">${pill('owe', L('Je dois le plus', 'I owe most', 'اللي عليا ليه كثر'))}${pill('recent', L('Récents', 'Recent', 'الأحدث'))}${pill('name', L('Nom', 'Name', 'الاسم'))}</div>
        <button type="button" class="kb ghost sp-btn" data-action="sup-cashbook">${ic('wallet')}${esc(L('Livre de caisse', 'Cash book', 'دفتر الصندوق'))}</button>
        <button type="button" class="kb atlas sp-btn" data-action="sup-new">${ic('add')}${esc(L('Nouveau fournisseur', 'New supplier', 'مورد جديد'))}</button>
      </div>
      <div class="sp-card">${rows.length ? `<div class="sp-list">${rows.map(rowHtml).join('')}</div>` : `<div class="sp-empty">${ic('truck')}<p>${esc((d.suppliers || []).length
        ? L('Aucun fournisseur ne correspond.', 'No supplier matches.', 'حتى مورد ما كيطابق.')
        : L('Ajoutez votre premier fournisseur : chaque réception de bon de commande inscrira ce que vous lui devez, chaque paiement le réduira.', 'Add your first supplier: every received purchase order records what you owe, every payment reduces it.', 'زيد أول مورد: كل سلعة توصلات كتتسجل عليك، وكل أداء كينقص منها.'))}</p></div>`}</div>
    </div>`;
  }

  function paint() {
    css();
    const title = L('Fournisseurs', 'Suppliers', 'الموردون');
    let body = '', sub = '';
    if (S.view === 'supplier') { body = detailBody(); sub = S.detail ? S.detail.supplier.name : ''; }
    else if (S.view === 'cashbook') { body = cashBody(); sub = L('Livre de caisse', 'Cash book', 'دفتر الصندوق'); }
    else { body = listBody(); sub = L('Ce que vous devez, à qui, depuis quand', 'What you owe, to whom, since when', 'شنو عليك، لمن، ومن إمتى'); }
    if (!isReal()) sub += ' · ' + L('démo', 'demo', 'تجريبي');
    const r = K.appPage('fournisseurs', { title, subtitle: sub, body });
    const root = r && r.el ? r.el : document.querySelector('.dash-genpage');
    const q = root && root.querySelector('[data-sp-q]');
    if (q) q.addEventListener('input', () => {
      S.q = q.value;
      const host = root.querySelector('.sp-list') || root.querySelector('.sp-empty');
      const card = host && host.closest('.sp-card');
      const rows = sorted((S.list && S.list.suppliers) || []);
      if (card) card.innerHTML = rows.length ? `<div class="sp-list">${rows.map(rowHtml).join('')}</div>` : `<div class="sp-empty">${ic('truck')}<p>${esc(L('Aucun fournisseur ne correspond.', 'No supplier matches.', 'حتى مورد ما كيطابق.'))}</p></div>`;
    });
  }

  async function loadList() {
    if (!isReal()) { S.list = DEMO.list(); return; }
    try { S.list = await api('/api/suppliers'); }
    catch (e) { S.list = { suppliers: [], totals: {} }; K.toast(errText(e.code), { type: 'warning' }); }
  }

  async function showList() {
    S.view = 'list'; S.id = ''; S.detail = null;
    if (!S.list) paint();
    await loadList();
    if (S.view === 'list') paint();
  }

  /* ── Fiche fournisseur ─────────────────────────────────────────────── */
  function pctLine(label, pct, sub) {
    const p = pct == null ? null : Math.max(0, Math.min(100, Number(pct)));
    return `<div><div class="k">${esc(label)}</div><div class="v">${p == null ? '·' : esc(num(p).replace(/[.,]00$/, '')) + ' %'}</div>${p == null ? '' : `<div class="sp-meter"><i style="width:${p}%"></i></div>`}${sub ? `<div class="k" style="margin-top:4px">${esc(sub)}</div>` : ''}</div>`;
  }

  function detailBody() {
    const d = S.detail;
    if (!d) return `<div class="sp-card sp-empty">${esc(L('Chargement du relevé…', 'Loading statement…', 'كنجيبو الكشف…'))}</div>`;
    const s = d.supplier, b = (d.balance && d.balance.balanceCents) || 0, sc = d.scorecard || {};
    const lines = (d.statement && d.statement.lines) || [];
    const big = b > 0 ? `<div class="k">${esc(L('Vous lui devez', 'You owe', 'باقي عليك ليه'))}</div><div class="sp-big owe">${esc(mad(b))}</div>`
      : b < 0 ? `<div class="k">${esc(L('Il vous doit (avance)', 'Owes you (advance)', 'باقي عليه ليك (تسبيق)'))}</div><div class="sp-big adv">${esc(mad(-b))}</div>`
        : `<div class="k">${esc(L('Solde', 'Balance', 'الرصيد'))}</div><div class="sp-big">${esc(L('À jour', 'Settled', 'مخلّص'))}</div>`;
    const meta = [s.phone ? `<span>${ic('call')}${esc(s.phone)}</span>` : '', s.ice ? `<span>ICE ${esc(s.ice)}</span>` : '', s.rib ? `<span>RIB ${esc(s.rib)}</span>` : '',
      s.termsDays ? `<span>${esc(L('Paiement à', 'Terms', 'أجل الأداء'))} ${esc(String(s.termsDays))} ${esc(L('j', 'd', 'يوم'))}</span>` : ''].join('');
    const table = lines.length ? `<div class="sp-scroll"><table class="sp-table"><thead><tr><th>${esc(L('Date', 'Date', 'التاريخ'))}</th><th>${esc(L('Libellé', 'Description', 'البيان'))}</th>
      <th class="num">${esc(L('Reçu de lui', 'Received', 'توصلت منو'))}</th><th class="num">${esc(L('Payé', 'Paid', 'خلّصت'))}</th><th class="num">${esc(L('Je dois', 'I owe', 'باقي عليا'))}</th><th></th></tr></thead><tbody>
      ${d.statement.openingCents ? `<tr><td></td><td class="lbl">${esc(L('Report', 'Brought forward', 'المرحّل'))}</td><td></td><td></td><td class="num">${esc(mad(d.statement.openingCents))}</td><td></td></tr>` : ''}
      ${lines.map((l) => `<tr><td>${esc(dmy(l.date))}</td><td class="lbl">${esc(kindLabel(l.kind))}${l.direction === 'out' && l.method && l.kind === 'payment' ? ' · ' + esc(methodLabel(l.method)) : ''}${l.note ? `<small>${esc(l.note)}</small>` : ''}</td>
        <td class="num">${l.inCents ? esc(mad(l.inCents)) : ''}</td><td class="num">${l.outCents ? esc(mad(l.outCents)) : ''}</td><td class="num">${esc(mad(l.runningCents))}</td>
        <td>${['payment', 'bill', 'opening'].includes(l.kind) ? `<button type="button" class="sp-void" data-action="sup-void" data-arg="${esc(l.id)}">${esc(L('Annuler', 'Void', 'إلغاء'))}</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : `<p class="sp-hint">${esc(L('Aucun mouvement. Une réception de bon de commande, une facture ou un paiement apparaîtra ici.', 'No entries yet. A received purchase order, a bill or a payment will show here.', 'حتى حركة. السلعة اللي توصلات، الفواتير والأداءات غادي يبانو هنا.'))}</p>`;
    const orders = (d.orders || []).filter((o) => o.status !== 'cancelled' && o.status !== 'draft');
    const ordersHtml = orders.length ? `<div class="sp-card"><h3 class="sp-h3">${esc(L('Bons de commande', 'Purchase orders', 'أوامر الشراء'))}</h3>${orders.map((o) => `<div class="sp-po"><span><b style="font-weight:600">${esc(o.number)}</b> · ${esc(mad(o.totalCents))}</span>
      ${o.status === 'received' || o.status === 'partial' ? `<button type="button" class="sp-link" data-action="sup-pay-po" data-arg="${esc(s.id + '|' + o.number + '|' + o.totalCents)}">${ic('pay')}${esc(L('Payer ce bon', 'Pay this order', 'خلّص هاد الأمر'))}</button>` : `<span class="sp-chip ok">${esc(L('en attente', 'pending', 'فالانتظار'))}</span>`}</div>`).join('')}</div>` : '';
    return `<div class="sp-wrap">
      <div><button type="button" class="sp-link" data-action="sup-back">${ic('back')}${esc(L('Tous les fournisseurs', 'All suppliers', 'جميع الموردين'))}</button></div>
      <div class="sp-card"><div class="sp-head"><div><h2>${esc(s.name)}</h2><div class="sp-meta">${meta}</div></div><div>${big}</div></div>
        <div class="sp-acts">
          <button type="button" class="kb atlas sp-btn" data-action="sup-pay" data-arg="${esc(s.id)}">${ic('pay')}${esc(L('Enregistrer un paiement', 'Record a payment', 'سجّل أداء'))}</button>
          <button type="button" class="kb ghost sp-btn" data-action="sup-bill" data-arg="${esc(s.id)}">${ic('bill')}${esc(L('Ajouter une facture', 'Add a bill', 'زيد فاتورة'))}</button>
          <button type="button" class="kb ghost sp-btn" data-action="sup-wa" data-arg="${esc(s.id)}">${ic('chat')}${esc(L('Relevé WhatsApp', 'WhatsApp statement', 'الكشف فواتساب'))}</button>
          <button type="button" class="kb ghost sp-btn" data-action="sup-print" data-arg="${esc(s.id)}">${ic('print')}${esc(L('Imprimer', 'Print', 'طبع'))}</button>
          <button type="button" class="kb ghost sp-btn" data-action="sup-csv" data-arg="${esc(s.id)}">${ic('csv')}CSV</button>
          <button type="button" class="kb ghost sp-btn" data-action="sup-edit" data-arg="${esc(s.id)}">${ic('edit')}${esc(L('Modifier', 'Edit', 'تعديل'))}</button>
          <button type="button" class="kb ghost sp-btn" data-action="sup-archive" data-arg="${esc(s.id)}">${ic('archive')}${esc(L('Archiver', 'Archive', 'أرشفة'))}</button>
        </div></div>
      <div class="sp-grid">
        <div class="sp-card"><h3 class="sp-h3">${esc(L('Relevé', 'Statement', 'كشف الحساب'))}</h3>${table}</div>
        <div class="sp-wrap">
          <div class="sp-card"><h3 class="sp-h3">${esc(L('Depuis quand je dois', 'How old is what I owe', 'من إمتى عليا هاد الدين'))}</h3>${ageBar(d.ageing)}</div>
          <div class="sp-card"><h3 class="sp-h3">${esc(L('Tableau du fournisseur', 'Supplier scorecard', 'بطاقة المورد'))}</h3><div class="sp-score">
            <div><div class="k">${esc(L('Commandé', 'Ordered', 'المطلوب'))}</div><div class="v">${esc(mad(sc.orderedCents || sc.purchasedCents))}</div><div class="k">${esc(String(sc.orderCount || 0))} ${esc(L('bons', 'orders', 'أوامر'))}</div></div>
            <div><div class="k">${esc(L('Panier moyen', 'Average order', 'متوسط الطلب'))}</div><div class="v">${esc(mad(sc.averageOrderCents))}</div></div>
            ${pctLine(L('Reçu', 'Received', 'توصلت'), sc.receivedPct, sc.notReceivedCents ? L('reste à recevoir', 'still to receive', 'باقي ما وصل') + ' ' + mad(sc.notReceivedCents) : '')}
            ${pctLine(L('Payé', 'Paid', 'تخلّص'), sc.paidPct, sc.unpaidCents ? L('reste dû', 'still owed', 'باقي عليك') + ' ' + mad(sc.unpaidCents) : '')}
            ${pctLine(L('Taux de retour', 'Return rate', 'نسبة الإرجاع'), sc.returnRatePct, '')}
          </div></div>
          ${ordersHtml}
        </div>
      </div>
    </div>`;
  }

  async function loadDetail(id) {
    if (!isReal()) { S.detail = DEMO.statement(id); return !!S.detail; }
    try { S.detail = await api('/api/suppliers/statement?id=' + encodeURIComponent(id)); return true; }
    catch (e) { K.toast(errText(e.code), { type: 'warning' }); return false; }
  }

  async function openSupplier(id) {
    if (!id) return;
    S.view = 'supplier'; S.id = id; S.detail = null; paint();
    const ok = await loadDetail(id);
    if (S.view === 'supplier' && S.id === id) { if (ok) paint(); else showList(); }
  }

  async function refreshDetail() {
    S.list = null;
    if (S.view === 'supplier' && S.id) { await loadDetail(S.id); paint(); } else if (S.view === 'cashbook') { await loadCash(); paint(); }
  }

  /* ── Saisie : paiement, facture, livre de caisse ───────────────────── */
  function segHtml(on) {
    return `<div class="sp-seg" data-sp-methods>${METHODS.map((m) => `<button type="button" data-m="${m}" class="${m === on ? 'on' : ''}" aria-pressed="${m === on}">${esc(methodLabel(m))}</button>`).join('')}</div>`;
  }
  function readAmount(v) {
    const raw = String(v || '').replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return NaN;
    return Math.round(Number(raw) * 100);
  }
  function centsInput(c) { return c > 0 ? (c / 100).toFixed(2).replace(/\.00$/, '') : ''; }

  /* Une fenêtre de saisie de montant. `mode` : payment | bill | cash-in | cash-out. */
  function moneyModal(opts) {
    const o = opts || {};
    const key = idem();
    let method = o.method || 'cash';
    const owed = Number(o.owedCents) || 0;
    const m = K.modal({
      tag: o.tag || '', title: o.title, width: 480,
      body: `<form class="sp-form" data-sp-form novalidate>
        <label>${esc(L('Montant (MAD)', 'Amount (MAD)', 'المبلغ (درهم)'))}<input class="sp-amt" name="amount" inputmode="decimal" autocomplete="off" value="${esc(centsInput(o.amountCents))}" required></label>
        ${o.mode === 'payment' && owed > 0 ? `<button type="button" class="sp-link" data-sp-all>${esc(L('Tout payer', 'Pay it all', 'خلّص كلشي'))} · ${esc(mad(owed))}</button>` : ''}
        ${o.mode === 'bill' ? `<label style="display:flex;align-items:center;gap:8px;grid-template-columns:none"><input type="checkbox" name="opening" style="width:auto">${esc(L("C'est une dette d'avant Kiwi", 'This is a balance from before Kiwi', 'هادا دين من قبل Kiwi'))}</label>` : ''}
        ${o.mode === 'bill' ? '' : `<div><div style="font-size:12.5px;color:var(--n-600,#3a4440);margin-bottom:6px">${esc(L('Moyen', 'Method', 'طريقة الأداء'))}</div>${segHtml(method)}</div>`}
        <div class="two"><label>${esc(L('Date', 'Date', 'التاريخ'))}<input type="date" name="date" value="${esc(todayYmd())}" max="${esc(todayYmd())}"></label>
          <label>${esc(L('Note', 'Note', 'ملاحظة'))}<input name="note" maxlength="200" placeholder="${esc(o.notePh || '')}" value="${esc(o.note || '')}"></label></div>
        ${o.hint ? `<p class="sp-hint">${esc(o.hint)}</p>` : ''}
        <div class="sp-foot"><button type="button" class="kb ghost" data-dismiss>${esc(L('Annuler', 'Cancel', 'إلغاء'))}</button><button type="submit" class="kb atlas">${esc(o.cta)}</button></div>
      </form>`,
    });
    const form = m.el.querySelector('[data-sp-form]');
    form.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (b) { method = b.dataset.m; form.querySelectorAll('[data-m]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }); return; }
      if (e.target.closest('[data-sp-all]')) form.amount.value = centsInput(owed);
    });
    setTimeout(() => { try { form.amount.focus(); } catch (_) {} }, 60);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cents = readAmount(form.amount.value);
      if (!(cents > 0)) { K.toast(errText('bad-amount'), { type: 'warning' }); return; }
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try {
        await o.save({ cents, method, date: form.date.value || todayYmd(), note: form.note.value.trim(), opening: !!(form.opening && form.opening.checked), idemKey: key });
        m.close();
      } catch (err) { btn.disabled = false; K.toast(errText(err && err.code), { type: 'warning' }); }
    });
    return m;
  }

  function currentName(id) {
    const d = S.detail && S.detail.supplier && S.detail.supplier.id === id ? S.detail.supplier : ((S.list && S.list.suppliers) || []).find((s) => s.id === id);
    return d ? d.name : '';
  }

  async function ensureDetail(id) {
    if (S.detail && S.detail.supplier && S.detail.supplier.id === id) return true;
    return loadDetail(id);
  }

  async function payModal(id, preset) {
    if (!id || !(await ensureDetail(id))) return;
    const owed = Math.max(0, (S.detail.balance && S.detail.balance.balanceCents) || 0);
    moneyModal({
      mode: 'payment', tag: currentName(id), title: L('Enregistrer un paiement', 'Record a payment', 'سجّل أداء'), cta: L('Enregistrer le paiement', 'Save payment', 'سجّل الأداء'),
      owedCents: owed, amountCents: preset && preset.cents ? Math.min(preset.cents, owed || preset.cents) : owed, method: 'transfer',
      note: preset && preset.po ? preset.po : '', notePh: L('N° de chèque, référence du virement…', 'Cheque no., transfer reference…', 'رقم الشيك، مرجع التحويل…'),
      hint: L("Le paiement réduit ce que vous devez. Kiwi ne déplace pas d'argent : vous payez comme d'habitude, Kiwi tient le compte.", 'A payment reduces what you owe. Kiwi moves no money: you pay as usual, Kiwi keeps the books.', 'الأداء كينقص من الدين. Kiwi ما كيحرّك حتى درهم: نتا كتخلّص بحال العادة وKiwi كيحسب.'),
      async save(v) {
        if (!isReal()) DEMO.post(id, 'out', v.cents, 'payment', v.method, v.note, v.date);
        else await api('/api/suppliers/entry', { supplierId: id, type: 'payment', amountCents: v.cents, method: v.method, date: v.date, note: v.note, idemKey: v.idemKey, po: preset && preset.po || '' });
        K.toast(L('Paiement enregistré', 'Payment recorded', 'تسجّل الأداء'), { type: 'success', desc: mad(v.cents) });
        if (S.view === 'supplier' && S.id === id) refreshDetail(); else { S.list = null; S.detail = null; }
      },
    });
  }

  async function billModal(id) {
    if (!id || !(await ensureDetail(id))) return;
    moneyModal({
      mode: 'bill', tag: currentName(id), title: L('Ajouter une facture', 'Add a bill', 'زيد فاتورة'), cta: L('Ajouter', 'Add', 'زيد'),
      notePh: L('N° de facture ou de bon de livraison', 'Invoice or delivery note no.', 'رقم الفاتورة ولا وصل التسليم'),
      hint: L("Une marchandise reçue à crédit hors bon de commande. Une réception de bon de commande s'inscrit toute seule.", 'Goods received on credit outside a purchase order. A received purchase order is recorded automatically.', 'سلعة توصلتي بها بالكريدي بلا أمر شراء. أوامر الشراء كيتسجلو بوحدهم.'),
      async save(v) {
        const type = v.opening ? 'opening' : 'bill';
        if (!isReal()) DEMO.post(id, 'in', v.cents, type, 'other', v.note, v.date);
        else await api('/api/suppliers/entry', { supplierId: id, type, amountCents: v.cents, method: 'other', date: v.date, note: v.note, idemKey: v.idemKey });
        K.toast(L('Facture ajoutée', 'Bill added', 'تزادت الفاتورة'), { type: 'success', desc: mad(v.cents) });
        refreshDetail();
      },
    });
  }

  /* ── Fiche : création et modification ──────────────────────────────── */
  function supplierModal(row) {
    const s = row || {};
    const f = (name, label, attrs) => `<label>${esc(label)}<input name="${name}" value="${esc(s[name] == null ? '' : s[name])}" ${attrs || ''}></label>`;
    const m = K.modal({
      title: row ? L('Modifier le fournisseur', 'Edit supplier', 'تعديل المورد') : L('Nouveau fournisseur', 'New supplier', 'مورد جديد'), width: 520,
      body: `<form class="sp-form" data-sp-sup novalidate>
        ${f('name', L('Nom', 'Name', 'الاسم'), 'maxlength="120" required')}
        <div class="two">${f('phone', L('Téléphone (WhatsApp)', 'Phone (WhatsApp)', 'التيليفون (واتساب)'), 'inputmode="tel" maxlength="40"')}${f('email', 'E-mail', 'type="email" maxlength="120"')}</div>
        <div class="two">${f('ice', 'ICE', 'inputmode="numeric" maxlength="30"')}${f('termsDays', L('Paiement à (jours)', 'Payment terms (days)', 'أجل الأداء (أيام)'), 'inputmode="numeric" maxlength="3"')}</div>
        <div class="two">${f('bank', L('Banque', 'Bank', 'البنك'), 'maxlength="80"')}${f('rib', 'RIB', 'inputmode="numeric" maxlength="40"')}</div>
        ${f('address', L('Adresse', 'Address', 'العنوان'), 'maxlength="240"')}
        <label>${esc(L('Notes', 'Notes', 'ملاحظات'))}<textarea name="notes" rows="2" maxlength="500">${esc(s.notes || '')}</textarea></label>
        <div class="sp-foot"><button type="button" class="kb ghost" data-dismiss>${esc(L('Annuler', 'Cancel', 'إلغاء'))}</button><button type="submit" class="kb atlas">${esc(L('Enregistrer', 'Save', 'سجّل'))}</button></div>
      </form>`,
    });
    const form = m.el.querySelector('[data-sp-sup]');
    const key = 'sup-' + idem();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = {}; ['name', 'phone', 'email', 'ice', 'bank', 'rib', 'address', 'notes', 'termsDays'].forEach((k) => { v[k] = form[k].value.trim(); });
      if (!v.name) { K.toast(errText('name-required'), { type: 'warning' }); return; }
      v.termsDays = Math.max(0, Math.min(365, parseInt(v.termsDays, 10) || 0));
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try {
        let saved;
        if (!isReal()) saved = row ? DEMO.edit(row.id, v) : DEMO.add(v);
        else saved = (await api('/api/suppliers', row ? { action: 'update', id: row.id, supplier: v } : { action: 'create', id: key, supplier: v })).supplier;
        m.close();
        K.toast(L('Fournisseur enregistré', 'Supplier saved', 'تسجّل المورد'), { type: 'success' });
        S.list = null;
        if (saved && saved.id) openSupplier(saved.id); else showList();
      } catch (err) { btn.disabled = false; K.toast(errText(err && err.code), { type: 'warning' }); }
    });
    setTimeout(() => { try { form.name.focus(); } catch (_) {} }, 60);
  }

  /* ── Relevé : impression, CSV, WhatsApp ────────────────────────────── */
  function shopName() {
    try { const v = window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData(); if (v && v.name) return String(v.name); } catch (_) {}
    return '';
  }
  function balanceSentence(b) {
    return b > 0 ? L('Nous vous devons', 'We owe you', 'باقي علينا ليكم') + ' ' + mad(b)
      : b < 0 ? L('Vous nous devez', 'You owe us', 'باقي عليكم لينا') + ' ' + mad(-b)
        : L('Compte soldé, rien ne reste dû.', 'Account settled, nothing is due.', 'الحساب مخلّص، ما باقي والو.');
  }
  function waPhone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 10 && d.startsWith('0')) d = '212' + d.slice(1);
    if (d.length === 9 && /^[5-7]/.test(d)) d = '212' + d;
    return d.length >= 11 ? d : '';
  }
  async function whatsapp(id) {
    if (!(await ensureDetail(id))) return;
    const d = S.detail, s = d.supplier, b = (d.balance && d.balance.balanceCents) || 0;
    const last = ((d.statement && d.statement.lines) || []).slice(-6);
    const text = [
      L('Bonjour', 'Hello', 'السلام') + ' ' + s.name + ',',
      L('Voici notre relevé au', 'Here is our statement as of', 'هادا كشف الحساب ديالنا إلى غاية') + ' ' + dmy(todayYmd()) + (shopName() ? ' (' + shopName() + ')' : '') + '.',
      '',
      ...(last.length ? [L('Derniers mouvements :', 'Latest entries:', 'آخر الحركات:'), ...last.map((l) => `• ${dmy(l.date)} ${kindLabel(l.kind)}${l.note ? ' ' + l.note : ''} : ${l.direction === 'in' ? '+' : '-'}${mad(l.amountCents)}`), ''] : []),
      balanceSentence(b) + (b > 0 && d.ageing && d.ageing.oldestDays ? ' (' + L('plus ancien', 'oldest', 'الأقدم') + ' : ' + d.ageing.oldestDays + ' ' + L('jours', 'days', 'يوم') + ')' : '') + '.',
      L('Merci.', 'Thank you.', 'شكرا.'),
    ].join('\n');
    const phone = waPhone(s.phone);
    const url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text);
    const w = window.open(url, '_blank', 'noopener');
    if (!w) location.href = url;
    if (!phone) K.toast(L('Pas de téléphone sur la fiche : choisissez le contact dans WhatsApp.', 'No phone on file: pick the contact in WhatsApp.', 'ما كاينش تيليفون فالبطاقة: ختار الكونطاكت فواتساب.'), { type: 'info' });
  }
  function statementRows() {
    const d = S.detail;
    return ((d && d.statement && d.statement.lines) || []).map((l) => [dmy(l.date), kindLabel(l.kind) + (l.note ? ' · ' + l.note : ''), l.inCents ? num(l.inCents / 100) : '', l.outCents ? num(l.outCents / 100) : '', num(l.runningCents / 100)]);
  }
  async function csv(id) {
    if (!(await ensureDetail(id))) return;
    const head = [L('Date', 'Date', 'التاريخ'), L('Libellé', 'Description', 'البيان'), L('Reçu (MAD)', 'Received (MAD)', 'توصلت (درهم)'), L('Payé (MAD)', 'Paid (MAD)', 'خلّصت (درهم)'), L('Solde (MAD)', 'Balance (MAD)', 'الرصيد (درهم)')];
    const cell = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const body = [head, ...statementRows()].map((r) => r.map(cell).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'releve-' + S.detail.supplier.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + todayYmd() + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function print(id) {
    if (!(await ensureDetail(id))) return;
    const d = S.detail, s = d.supplier, b = (d.balance && d.balance.balanceCents) || 0;
    const rtl = lang() === 'ar';
    const rows = statementRows().map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td class="n">${esc(r[2])}</td><td class="n">${esc(r[3])}</td><td class="n">${esc(r[4])}</td></tr>`).join('');
    const html = `<!doctype html><html lang="${esc(lang())}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(L('Relevé', 'Statement', 'كشف الحساب'))} ${esc(s.name)}</title>
<style>body{font-family:'Inter Tight',${rtl ? "'IBM Plex Sans Arabic'," : ''}system-ui,sans-serif;color:#0A0F0D;margin:32px;font-size:13px}h1{font-size:20px;font-weight:600;margin:0 0 4px}p{margin:2px 0;color:#3a4440}
table{width:100%;border-collapse:collapse;margin-top:18px;font-variant-numeric:tabular-nums}th,td{padding:7px 6px;border-bottom:1px solid #ddd;text-align:start}th{font-weight:500;color:#667;font-size:12px}.n{text-align:end}
.bal{margin-top:18px;font-size:16px;font-weight:600}</style></head><body>
<h1>${esc(L('Relevé fournisseur', 'Supplier statement', 'كشف حساب المورد'))} · ${esc(s.name)}</h1>
<p>${esc(shopName())}${shopName() ? ' · ' : ''}${esc(L('au', 'as of', 'إلى غاية'))} ${esc(dmy(todayYmd()))}</p>${s.ice ? `<p>ICE ${esc(s.ice)}</p>` : ''}
<table><thead><tr><th>${esc(L('Date', 'Date', 'التاريخ'))}</th><th>${esc(L('Libellé', 'Description', 'البيان'))}</th><th class="n">${esc(L('Reçu', 'Received', 'توصلت'))}</th><th class="n">${esc(L('Payé', 'Paid', 'خلّصت'))}</th><th class="n">${esc(L('Solde', 'Balance', 'الرصيد'))}</th></tr></thead><tbody>${rows}</tbody></table>
<div class="bal">${esc(balanceSentence(b))}</div></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { K.toast(L('Autorisez les fenêtres pour imprimer.', 'Allow pop-ups to print.', 'سمح بالنوافذ باش تطبع.'), { type: 'warning' }); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (_) {} }, 250);
  }

  /* ── Livre de caisse ───────────────────────────────────────────────── */
  async function loadCash() {
    if (!isReal()) { S.cash = DEMO.cash(); return; }
    try { S.cash = await api('/api/cashbook'); } catch (e) { S.cash = { balance: { balanceCents: 0 }, statement: { lines: [] } }; K.toast(errText(e.code), { type: 'warning' }); }
  }
  function cashBody() {
    const c = S.cash;
    if (!c) return `<div class="sp-card sp-empty">${esc(L('Chargement…', 'Loading…', 'كنجيبو…'))}</div>`;
    const lines = (c.statement && c.statement.lines) || [];
    return `<div class="sp-wrap">
      <div><button type="button" class="sp-link" data-action="sup-back">${ic('back')}${esc(L('Tous les fournisseurs', 'All suppliers', 'جميع الموردين'))}</button></div>
      <div class="sp-card"><div class="sp-head"><div><div class="k" style="font-size:12px;color:var(--n-500,#667)">${esc(L('Solde du livre de caisse', 'Cash book balance', 'رصيد دفتر الصندوق'))}</div><div class="sp-big">${esc(mad(c.balance && c.balance.balanceCents))}</div>
        <p class="sp-hint">${esc(L("Ce que vous notez vous-même : apports, retraits, frais payés de votre poche. Les ventes de la caisse n'y sont pas recopiées.", 'What you note yourself: contributions, withdrawals, costs paid out of pocket. Till sales are not copied here.', 'اللي كتسجل بيدك: دخول وخروج الفلوس من جيبك. مبيعات الكاسة ما كتتنسخش هنا.'))}</p></div>
        <div class="sp-acts" style="margin-top:0"><button type="button" class="kb atlas sp-btn" data-action="sup-cash-add" data-arg="in">${ic('add')}${esc(L('Entrée', 'Money in', 'دخول'))}</button><button type="button" class="kb ghost sp-btn" data-action="sup-cash-add" data-arg="out">${ic('pay')}${esc(L('Sortie', 'Money out', 'خروج'))}</button></div></div></div>
      <div class="sp-card">${lines.length ? `<div class="sp-scroll"><table class="sp-table"><thead><tr><th>${esc(L('Date', 'Date', 'التاريخ'))}</th><th>${esc(L('Libellé', 'Description', 'البيان'))}</th><th class="num">${esc(L('Entrée', 'In', 'دخول'))}</th><th class="num">${esc(L('Sortie', 'Out', 'خروج'))}</th><th class="num">${esc(L('Solde', 'Balance', 'الرصيد'))}</th><th></th></tr></thead><tbody>
        ${lines.map((l) => `<tr><td>${esc(dmy(l.date))}</td><td class="lbl">${esc(l.note || methodLabel(l.method))}<small>${esc(methodLabel(l.method))}</small></td><td class="num">${l.inCents ? esc(mad(l.inCents)) : ''}</td><td class="num">${l.outCents ? esc(mad(l.outCents)) : ''}</td><td class="num">${esc(mad(l.runningCents))}</td>
          <td><button type="button" class="sp-void" data-action="sup-void" data-arg="${esc('cash:' + l.id)}">${esc(L('Annuler', 'Void', 'إلغاء'))}</button></td></tr>`).join('')}</tbody></table></div>`
        : `<p class="sp-hint">${esc(L('Aucun mouvement pour le moment.', 'No entries yet.', 'حتى حركة دابا.'))}</p>`}</div></div>`;
  }

  /* ── Handlers (enregistrés d'un coup : LAZY_SECTIONS les compte) ───── */
  H['nav-fournisseurs'] = () => { S.list = null; showList(); };
  H['sup-open'] = (_el, id) => openSupplier(String(id || ''));
  H['sup-back'] = () => showList();
  H['sup-sort'] = (_el, k) => {
    S.sort = ['owe', 'recent', 'name'].includes(k) ? k : 'owe';
    /* Basculer .on suffit : la lentille liquide fait glisser la pastille. */
    document.querySelectorAll('[data-action="sup-sort"]').forEach((b) => b.classList.toggle('on', b.dataset.arg === S.sort));
    const card = document.querySelector('.dash-genpage .sp-list');
    if (card) card.innerHTML = sorted((S.list && S.list.suppliers) || []).map(rowHtml).join('');
  };
  H['sup-new'] = () => supplierModal(null);
  H['sup-edit'] = async (_el, id) => { if (await ensureDetail(String(id || ''))) supplierModal(S.detail.supplier); };
  H['sup-archive'] = async (_el, id) => {
    id = String(id || '');
    const b = S.detail && S.detail.balance ? S.detail.balance.balanceCents : 0;
    const msg = b ? L('Ce fournisseur a encore un solde. Il sortira de la liste, son relevé reste consultable.', 'This supplier still has a balance. It leaves the list, its statement stays readable.', 'هاد المورد باقي عندو رصيد. غادي يخرج من اللائحة والكشف ديالو يبقى.')
      : L('Il sortira de la liste, son relevé reste consultable.', 'It leaves the list, its statement stays readable.', 'غادي يخرج من اللائحة والكشف ديالو يبقى.');
    if (!window.confirm(msg)) return;
    try {
      if (!isReal()) DEMO.edit(id, { archived: true });
      else await api('/api/suppliers', { action: 'archive', id });
      K.toast(L('Fournisseur archivé', 'Supplier archived', 'تأرشف المورد'), { type: 'success' });
      S.list = null; showList();
    } catch (e) { K.toast(errText(e.code), { type: 'warning' }); }
  };
  H['sup-pay'] = (_el, id) => payModal(String(id || ''));
  H['sup-pay-po'] = (_el, arg) => {
    const [id, po, cents] = String(arg || '').split('|');
    payModal(id, { po: po || '', cents: Number(cents) || 0 });
  };
  H['sup-bill'] = (_el, id) => billModal(String(id || ''));
  H['sup-void'] = async (_el, arg) => {
    const raw = String(arg || ''), cash = raw.startsWith('cash:'), id = cash ? raw.slice(5) : raw;
    if (!window.confirm(L('Annuler cette ligne ? Elle sort du solde et reste dans l\'historique.', 'Void this entry? It leaves the balance and stays in the history.', 'نلغيو هاد السطر؟ غادي يخرج من الرصيد ويبقى فالتاريخ.'))) return;
    try {
      if (!isReal()) DEMO.void(id);
      else await api(cash ? '/api/cashbook' : '/api/suppliers/entry', { action: 'archive', id });
      K.toast(L('Ligne annulée', 'Entry voided', 'تلغى السطر'), { type: 'success' });
      refreshDetail();
    } catch (e) { K.toast(errText(e.code), { type: 'warning' }); }
  };
  H['sup-wa'] = (_el, id) => whatsapp(String(id || ''));
  H['sup-print'] = (_el, id) => print(String(id || ''));
  H['sup-csv'] = (_el, id) => csv(String(id || ''));
  H['sup-cashbook'] = async () => { S.view = 'cashbook'; S.cash = null; paint(); await loadCash(); if (S.view === 'cashbook') paint(); };
  H['sup-cash-add'] = (_el, dir) => {
    const out = dir === 'out';
    moneyModal({
      mode: out ? 'cash-out' : 'cash-in', title: out ? L("Sortie d'argent", 'Money out', 'خروج الفلوس') : L("Entrée d'argent", 'Money in', 'دخول الفلوس'), cta: L('Enregistrer', 'Save', 'سجّل'),
      notePh: out ? L('Réparation, achat urgent…', 'Repair, urgent purchase…', 'إصلاح، شراء مستعجل…') : L('Apport, remboursement…', 'Contribution, repayment…', 'مساهمة، استرجاع…'),
      async save(v) {
        if (!isReal()) DEMO.cashPost(out ? 'out' : 'in', v.cents, v.method, v.note, v.date);
        else await api('/api/cashbook', { type: out ? 'out' : 'in', amountCents: v.cents, method: v.method, date: v.date, note: v.note, idemKey: v.idemKey });
        K.toast(L('Mouvement enregistré', 'Entry saved', 'تسجّلات الحركة'), { type: 'success', desc: mad(v.cents) });
        await loadCash(); if (S.view === 'cashbook') paint();
      },
    });
  };

  window.addEventListener('kiwi:langchange', () => {
    if (document.body.classList.contains('page-genpage') && document.querySelector('.dash-genpage .sp-wrap, .dash-genpage .sp-card')) paint();
  });
})();
