/* Fournisseurs · une seule destination pour ce que nous devons et pour qui
 * mérite la prochaine commande (Inyad « took / gave », en mieux). Chargé à la
 * première ouverture (LAZY_SECTIONS, assets/pages-pro.js).
 *
 * Trois onglets (lentille liquide) :
 *   · Ce que je dois : soldes, ancienneté par échéance (délai de paiement de
 *     chaque fiche : pas encore échu / en retard), recherche et tri ;
 *   · Classement : le tableau de assets/stock/suppliers.js, monté ici
 *     (conteneur data-sr-board) ; l'onglet Fournisseurs du stock y mène ;
 *   · À approuver : réceptions et retours saisis par l'équipe (tout
 *     approuver d'un geste) et réceptions d'un bon sans fiche, à rattacher.
 *
 * Données réelles : /api/suppliers (liste, soldes, ancienneté, en attente,
 * sans fiche ; `migrated:false` tant que la base n'a pas 0028 : « mise à jour
 * en cours »), /api/suppliers/statement (relevé sur une période avec report,
 * bons et reste à payer par bon, tableau du fournisseur), /api/suppliers/entry
 * (paiement, facture, dette d'avant Kiwi, annulation, accord, rattachement),
 * /api/cashbook. Convention de signe : functions/api/_ledger.js.
 *
 * Le serveur n'écrit aucun libellé : chaque ligne est mise en mots ici, dans
 * la langue du lecteur (ou celle choisie pour le relevé envoyé au fournisseur).
 * Une session de démonstration voit des fournisseurs d'exemple, en mémoire.
 */
(() => {
  'use strict';
  const K = window.Kiwi;
  if (!K || !K.handlers) return;
  const handlers = K.handlers;
  const lang = () => (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
  /* `LX(lg, …)` : une langue donnée (relevé envoyé au fournisseur) ; `L` : celle de l'écran. */
  const LX = (lg, fr, en, ar) => (lg === 'en' ? en : lg === 'ar' ? ar : fr);
  const L = (fr, en, ar) => LX(lang(), fr, en, ar);
  /* Pluriels : français et anglais un / plusieurs ; arabe un, deux, 3 à 10, 11 et plus. */
  const pl = (n, one, many) => (Number(n) === 1 ? one : many);
  const arPl = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? few : many);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => (window.KiwiNumber && window.KiwiNumber.format ? window.KiwiNumber.format(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (Math.round(n * 100) / 100).toFixed(2));
  const madX = (lg, cents) => num((Number(cents) || 0) / 100) + ' ' + LX(lg, 'MAD', 'MAD', 'درهم');
  const mad = (cents) => madX(lang(), cents);
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
    done: 'm382-354 339-339q12-12 28-12t28 12q12 12 12 28.5T777-636L410-268q-12 12-28 12t-28-12L182-440q-12-12-11.5-28.5T183-497q12-12 28.5-12t28.5 12l142 143Z',
    link: 'M440-280H280q-83 0-141.5-58.5T80-480q0-83 58.5-141.5T280-680h160v80H280q-50 0-85 35t-35 85q0 50 35 85t85 35h160v80ZM320-440v-80h320v80H320Zm200 160v-80h160q50 0 85-35t35-85q0-50-35-85t-85-35H520v-80h160q83 0 141.5 58.5T880-480q0 83-58.5 141.5T680-280H520Z',
    sync: 'M160-160v-80h110l-16-14q-52-46-73-105t-21-119q0-111 66.5-197.5T400-790v84q-72 26-116 88.5T240-478q0 45 17 87.5t53 78.5l10 10v-98h80v240H160Zm400-10v-84q72-26 116-88.5T720-482q0-45-17-87.5T650-648l-10-10v98h-80v-240h240v80H690l16 14q49 49 71.5 106.5T800-482q0 111-66.5 197.5T560-170Z',
  };
  const icon = (k, cls) => `<svg class="sp-i${cls ? ' ' + cls : ''}" viewBox="0 -960 960 960" aria-hidden="true" fill="currentColor"><path d="${P[k]}"/></svg>`;

  const METHODS = ['cash', 'transfer', 'cheque', 'card', 'other'];
  const methodLabel = (m, lg) => {
    const g = lg || lang();
    return ({
      cash: LX(g, 'Espèces', 'Cash', 'نقدًا'), transfer: LX(g, 'Virement', 'Transfer', 'تحويل'), cheque: LX(g, 'Chèque', 'Cheque', 'شيك'),
      card: LX(g, 'Carte', 'Card', 'بطاقة'), other: LX(g, 'Autre', 'Other', 'أخرى'),
    }[m] || m);
  };
  const kindLabel = (k, lg) => {
    const g = lg || lang();
    return ({
      purchase: LX(g, 'Réception', 'Goods received', 'استلام سلعة'), bill: LX(g, 'Facture', 'Bill', 'فاتورة'),
      payment: LX(g, 'Paiement', 'Payment', 'أداء'), return: LX(g, 'Retour', 'Return', 'إرجاع'),
      expense: LX(g, 'Dépense', 'Expense', 'مصروف'), 'expense-payment': LX(g, 'Réglé à la dépense', 'Paid with the expense', 'تخلّص مع المصروف'),
      opening: LX(g, "Dette d'avant Kiwi", 'Balance before Kiwi', 'دين قبل Kiwi'), manual: LX(g, 'Mouvement', 'Entry', 'حركة'),
      adjustment: LX(g, 'Ajustement', 'Adjustment', 'تسوية'),
    }[k] || k);
  };
  /* Le libellé d'une ligne : son genre, son bon ou sa référence, son moyen. */
  const lineLabel = (l, lg) => [kindLabel(l.kind, lg), l.poNumber || l.ref || '', l.kind === 'payment' && l.method && l.method !== 'other' ? methodLabel(l.method, lg) : ''].filter(Boolean).join(' · ');
  /* Vu du fournisseur (relevé qu'on lui envoie) : livré / payé / repris. */
  const theirSide = (l, lg) => (l.direction === 'in'
    ? (l.kind === 'opening' ? LX(lg, 'Solde d\'avant', 'Earlier balance', 'رصيد سابق') : LX(lg, 'Livré par vous', 'Delivered by you', 'سلّمتوه لينا'))
    : l.kind === 'return' ? LX(lg, 'Rendu chez vous', 'Returned to you', 'رجّعناه ليكم') : LX(lg, 'Payé par nous', 'Paid by us', 'خلّصناكم'));
  const AGE = () => [['0-30', L('0 à 30 j', '0 to 30 d', '0 إلى 30 يوم')], ['31-60', L('31 à 60 j', '31 to 60 d', '31 إلى 60 يوم')], ['61-90', L('61 à 90 j', '61 to 90 d', '61 إلى 90 يوم')], ['90+', L('plus de 90 j', 'over 90 d', 'أكثر من 90 يوم')]];
  const daysTxt = (n) => L(pl(n, `${n} jour`, `${n} jours`), pl(n, `${n} day`, `${n} days`), arPl(n, 'يوم واحد', 'يومان', `${n} أيام`, `${n} يوم`));

  /* Qui doit à qui, en mots. Solde > 0 : nous devons au fournisseur. */
  function owedChip(balance) {
    const b = Number(balance) || 0;
    if (b > 0) return `<span class="sp-chip owe">${esc(L('Vous devez', 'You owe', 'باقي عليك'))} ${esc(mad(b))}</span>`;
    if (b < 0) return `<span class="sp-chip adv">${esc(L('Il vous doit', 'Owes you', 'باقي عليه لك'))} ${esc(mad(-b))}</span>`;
    return `<span class="sp-chip ok">${esc(L('À jour', 'Settled', 'مخلّص'))}</span>`;
  }

  function css() {
    if (document.getElementById('sp-css')) return;
    const style = document.createElement('style');
    style.id = 'sp-css';
    style.textContent = `
.sp-i{width:18px;height:18px;flex:none}
[dir="rtl"] .sp-i.flip{transform:scaleX(-1)}
.sp-wrap{display:grid;gap:14px}
.sp-card{border:1px solid var(--n-200,rgba(10,15,13,.12));border-radius:var(--r-xl,18px);background:var(--paper-elev,var(--paper,#F7F5F0));padding:18px;min-width:0}
.sp-kpis{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}
.sp-kpi .k{font-size:12px;color:var(--n-500,#667);letter-spacing:.02em}
.sp-kpi .v{font-size:24px;font-weight:600;margin-top:4px;font-variant-numeric:tabular-nums}
.sp-kpi .v.owe{color:var(--danger,#B42318)}
.sp-kpi .v.ok{color:var(--atlas,#0B6E4F)}
.sp-kpi .v.late{color:var(--warn-ink,#8A6210)}
.sp-age{display:flex;height:10px;border-radius:999px;overflow:hidden;background:var(--n-100,rgba(10,15,13,.06));margin-top:12px;gap:2px}
.sp-age i{display:block;height:100%}
.sp-age .a0,.sp-legend .a0{background:var(--atlas,#0B6E4F)}
.sp-age .a1,.sp-legend .a1{background:var(--warning,#D99A2B)}
.sp-age .a2,.sp-legend .a2{background:color-mix(in srgb,var(--warning,#D99A2B) 35%,var(--danger,#C94A3A))}
.sp-age .a3,.sp-legend .a3{background:var(--riad,#053B2C)}
.sp-legend{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:10px;font-size:12.5px;color:var(--n-600,#3a4440)}
.sp-legend span{display:inline-flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums}
.sp-legend b{width:10px;height:10px;border-radius:3px;display:inline-block;font-weight:400}
.sp-due{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px;font-size:13px}
.sp-due span{display:inline-flex;gap:6px;align-items:center}
.sp-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.sp-search{flex:1 1 220px;display:flex;align-items:center;gap:8px;padding:0 12px;height:40px;border-radius:12px;border:1px solid var(--n-200,rgba(10,15,13,.12));background:var(--surface,#FDFCF9);color:var(--n-500,#667)}
.sp-search input{flex:1;border:0;background:transparent;font:inherit;color:var(--ink,#0A0F0D);outline:none;min-width:0}
.sp-pills{display:inline-flex;gap:4px;padding:4px;border-radius:12px;background:var(--n-100,rgba(10,15,13,.06));flex-wrap:wrap}
.sp-pills button{border:0;background:transparent;font:inherit;font-size:13px;padding:6px 12px;border-radius:9px;color:var(--n-600,#3a4440);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.sp-pills button.on{color:var(--paper,#F7F5F0)}
.sp-tabs{display:flex;gap:4px;padding:4px;border-radius:14px;background:var(--n-100,rgba(10,15,13,.06));width:max-content;max-width:100%;overflow-x:auto}
.sp-tabs button{border:0;background:transparent;font:inherit;font-size:14px;padding:8px 16px;border-radius:10px;color:var(--n-600,#3a4440);cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
.sp-tabs button.on{color:var(--paper,#F7F5F0)}
.sp-tabs .n{font-size:11.5px;min-width:18px;padding:0 5px;border-radius:999px;background:var(--danger,#C94A3A);color:var(--paper,#F7F5F0);font-variant-numeric:tabular-nums}
.sp-btn{display:inline-flex;align-items:center;gap:6px}
.sp-list{display:grid}
.sp-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 14px;align-items:center;padding:13px 4px;border-top:1px solid var(--n-100,rgba(10,15,13,.08));cursor:pointer}
.sp-row:first-child{border-top:0}
.sp-row:hover{background:var(--n-50,rgba(10,15,13,.03))}
.sp-row .n{font-weight:600;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-row .m{font-size:12.5px;color:var(--n-500,#667);display:flex;gap:10px;flex-wrap:wrap}
.sp-row .r{display:grid;justify-items:end;gap:4px}
.sp-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;font-size:12.5px;font-variant-numeric:tabular-nums;white-space:nowrap}
.sp-chip.owe{background:color-mix(in srgb,var(--danger,#C94A3A) 10%,transparent);color:var(--danger,#C94A3A)}
.sp-chip.adv{background:var(--mint-soft,#C9F6DC);color:var(--riad,#053B2C)}
.sp-chip.ok{background:var(--n-100,rgba(10,15,13,.06));color:var(--n-600,#3a4440)}
.sp-chip.late{background:var(--warn-soft,#FFF4DD);color:var(--warn-ink,#8A6210)}
.sp-chip.paid{background:color-mix(in srgb,var(--atlas,#0B6E4F) 11%,transparent);color:var(--atlas,#0B6E4F)}
.sp-empty{text-align:center;padding:36px 12px;color:var(--n-600,#3a4440)}
.sp-empty .sp-i{width:36px;height:36px;color:var(--atlas,#0B6E4F)}
.sp-head{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;justify-content:space-between}
.sp-head h2{margin:0;font-size:20px;font-weight:600}
.sp-meta{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:6px;font-size:13px;color:var(--n-600,#3a4440)}
.sp-meta span{display:inline-flex;align-items:center;gap:5px}
.sp-big{font-size:30px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:4px}
.sp-big.owe{color:var(--danger,#C94A3A)}.sp-big.adv{color:var(--atlas,#0B6E4F)}
.sp-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.sp-grid{display:grid;gap:14px}
@media(min-width:1000px){.sp-grid{grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)}}
.sp-score{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.sp-score .k{font-size:12px;color:var(--n-500,#667)}
.sp-score .v{font-size:17px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:2px}
.sp-meter{height:6px;border-radius:999px;background:var(--n-100,rgba(10,15,13,.06));margin-top:6px;overflow:hidden}
.sp-meter i{display:block;height:100%;background:var(--atlas,#0B6E4F)}
.sp-h3{margin:0 0 10px;font-size:14.5px;font-weight:600;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.sp-table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
.sp-table th{text-align:start;font-weight:500;color:var(--n-500,#667);font-size:12px;padding:8px 6px;border-bottom:1px solid var(--n-200,rgba(10,15,13,.12));white-space:nowrap}
.sp-table td{padding:9px 6px;border-bottom:1px solid var(--n-100,rgba(10,15,13,.07));vertical-align:top}
.sp-table .num{text-align:end;white-space:nowrap}
.sp-table .lbl{min-width:150px}
.sp-table .lbl small,.sp-st small{display:block;color:var(--n-500,#667);font-size:11.5px;margin-top:2px}
.sp-st{display:none}
.sp-st-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;padding:11px 0;border-bottom:1px solid var(--n-100,rgba(10,15,13,.07));font-size:13.5px}
.sp-st-row .amt{text-align:end;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.sp-st-row .amt.in{color:var(--danger,#C94A3A)}.sp-st-row .amt.out{color:var(--atlas,#0B6E4F)}
.sp-st-row .run{text-align:end;font-size:12px;color:var(--n-500,#667);font-variant-numeric:tabular-nums;white-space:nowrap}
@media(max-width:700px){.sp-tablewrap{display:none}.sp-st{display:block}}
.sp-void{border:0;background:transparent;color:var(--n-500,#6F6C65);cursor:pointer;font:inherit;font-size:12px;padding:2px 4px}
.sp-void:hover{color:var(--danger,#C94A3A)}
.sp-po{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--n-100,rgba(10,15,13,.07));font-size:13px;flex-wrap:wrap}
.sp-po:first-of-type{border-top:0}
.sp-po .sub{display:block;color:var(--n-500,#667);font-size:12px;margin-top:2px;font-variant-numeric:tabular-nums}
.sp-link{border:0;background:transparent;color:var(--atlas,#0B6E4F);cursor:pointer;font:inherit;display:inline-flex;align-items:center;gap:6px;padding:0}
.sp-link:disabled{color:var(--n-500,#6F6C65);cursor:default}
.sp-form{display:grid;gap:12px}
.sp-form label{display:grid;gap:6px;font-size:12.5px;color:var(--n-600,#3a4440)}
.sp-form input,.sp-form textarea,.sp-form select{font:inherit;font-size:14px;padding:10px 12px;border-radius:10px;border:1px solid var(--n-200,rgba(10,15,13,.14));background:var(--surface,#FDFCF9);color:var(--ink,#0A0F0D)}
.sp-form .two{display:grid;gap:12px;grid-template-columns:1fr 1fr}
.sp-form input.sp-amt{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums}
.sp-seg{display:inline-flex;flex-wrap:wrap;gap:4px;padding:4px;border-radius:12px;background:var(--n-100,rgba(10,15,13,.06))}
.sp-seg button{border:0;background:transparent;color:var(--n-600,#3a4440);font:inherit;font-size:13px;padding:7px 12px;border-radius:9px;cursor:pointer}
.sp-seg button.on{color:var(--paper,#F7F5F0)}
/* La lentille liquide peint la pastille ; sans elle (pas encore attachée), le choix reste lisible. */
.sp-tabs:not([data-kw-lens]) button.on,.sp-pills:not([data-kw-lens]) button.on,.sp-seg:not([data-kw-lens]) button.on{background:var(--atlas,#0B6E4F)}
.sp-hint{font-size:12.5px;color:var(--n-500,#667);margin:0}
.sp-foot{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.sp-rank{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:center}
.sp-ring{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;font-weight:600;font-size:18px;font-variant-numeric:tabular-nums;background:conic-gradient(var(--atlas,#0B6E4F) calc(var(--p) * 1%),var(--n-100,rgba(10,15,13,.08)) 0)}
.sp-ring b{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:var(--paper-elev,var(--paper,#F7F5F0));font-weight:600}
.sp-verdict{display:inline-flex;padding:3px 10px;border-radius:999px;font-size:12.5px;margin-top:4px}
.sp-verdict.good{color:var(--atlas,#0B6E4F);background:color-mix(in srgb,var(--atlas,#0B6E4F) 11%,transparent)}
.sp-verdict.watch{color:var(--warn-ink,#8A6210);background:var(--warn-soft,#FFF4DD)}
.sp-verdict.bad{color:var(--danger,#C94A3A);background:color-mix(in srgb,var(--danger,#C94A3A) 10%,transparent)}
.sp-verdict.ok,.sp-verdict.idle{color:var(--n-600,#3a4440);background:var(--n-100,rgba(10,15,13,.06))}
.sp-inbox-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 14px;align-items:center;padding:12px 0;border-top:1px solid var(--n-100,rgba(10,15,13,.07))}
.sp-inbox-row:first-child{border-top:0}
.sp-inbox-row .who{font-weight:600}
.sp-inbox-row .sub{font-size:12.5px;color:var(--n-500,#667);margin-top:2px}
.sp-attach{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.sp-attach select{font:inherit;font-size:13.5px;padding:8px 10px;border-radius:10px;border:1px solid var(--n-200,rgba(10,15,13,.14));background:var(--surface,#FDFCF9);color:var(--ink,#0A0F0D);max-width:240px}
@media(max-width:560px){.sp-form .two{grid-template-columns:1fr}.sp-big{font-size:26px}.sp-inbox-row{grid-template-columns:1fr}}
`;
    document.head.appendChild(style);
  }

  /* ── Démo : des fournisseurs d'exemple, en mémoire seulement ───────── */
  const DEMO = (() => {
    let seeded = null;
    const day = (n) => { const d = new Date(Date.now() - n * 86400000); return d.toISOString().slice(0, 10); };
    function seed() {
      if (seeded) return seeded;
      const sup = (id, name, phone, ice, terms) => ({ id, name, phone, email: '', ice, rib: '', bank: '', address: 'Casablanca', notes: '', termsDays: terms, archived: false });
      const l = (sid, n, dir, cents, kind, method, ref, extra) => ({ id: 'd' + Math.random().toString(36).slice(2, 9), partyId: sid, date: day(n), direction: dir, amountCents: cents, kind, method, ref: ref || '', poNumber: /^BC-/.test(ref || '') ? ref : '', note: '', createdAt: Date.now() - n * 86400000, ...(extra || {}) });
      seeded = {
        suppliers: [sup('demo-atlas', 'Atlas Coffee Roasters', '0661234567', '001525487000045', 30), sup('demo-frais', 'Distrib Frais SARL', '0522445566', '002201145000077', 15),
          sup('demo-lait', 'Laiterie Centrale', '0600112233', '', 7), sup('demo-emb', 'Emballages du Souss', '0528221100', '001889201000012', 60)],
        lines: [
          l('demo-atlas', 95, 'in', 860000, 'purchase', 'other', 'BC-2026-000012'), l('demo-atlas', 70, 'out', 500000, 'payment', 'transfer', ''),
          l('demo-atlas', 40, 'in', 640000, 'purchase', 'other', 'BC-2026-000019'), l('demo-atlas', 12, 'in', 420000, 'purchase', 'other', 'BC-2026-000024'),
          l('demo-frais', 25, 'in', 312000, 'purchase', 'other', 'BL-4471'), l('demo-frais', 20, 'out', 312000, 'payment', 'cash', ''),
          l('demo-frais', 6, 'in', 188000, 'purchase', 'other', 'BL-4502'),
          l('demo-lait', 3, 'in', 96000, 'bill', 'other', 'F-47'), l('demo-lait', 1, 'out', 120000, 'payment', 'cash', ''),
          l('demo-emb', 130, 'in', 245000, 'opening', 'other', ''),
        ],
        pending: [l('demo-frais', 1, 'in', 54000, 'purchase', 'other', 'BC-2026-000031', { pending: true, createdBy: 'Yassine' })],
        unlinked: [{ party: 'po:BC-2026-000033', number: 'BC-2026-000033', supplierName: 'Grossiste du Derb', netCents: 76000, count: 1, firstDate: day(2), by: 'Yassine' }],
        orders: { 'demo-atlas': [
          { id: 'o24', number: 'BC-2026-000024', status: 'partial', totalCents: 700000, receivedCents: 420000, paidCents: 0, dueCents: 420000, payState: 'unpaid' },
          { id: 'o19', number: 'BC-2026-000019', status: 'received', totalCents: 640000, receivedCents: 640000, paidCents: 0, dueCents: 640000, payState: 'unpaid' },
          { id: 'o12', number: 'BC-2026-000012', status: 'received', totalCents: 860000, receivedCents: 860000, paidCents: 500000, dueCents: 360000, payState: 'partial' }] },
        cash: [l('main', 4, 'in', 500000, 'manual', 'cash', ''), l('main', 2, 'out', 80000, 'manual', 'cash', '')],
      };
      seeded.cash[0].note = L('Apport du patron', "Owner's contribution", 'مساهمة المول');
      seeded.cash[1].note = L('Réparation frigo', 'Fridge repair', 'إصلاح الثلاجة');
      return seeded;
    }
    const live = (sid) => seed().lines.filter((x) => x.partyId === sid);
    const bal = (lines) => lines.reduce((s, x) => s + (x.direction === 'in' ? x.amountCents : -x.amountCents), 0);
    const termsOf = (sid) => ((seed().suppliers.find((s) => s.id === sid) || {}).termsDays) || 0;
    function ageing(lines) {
      const cents = [0, 0, 0, 0]; let oldest = 0, notDue = 0, overdue = 0, oldestOverdue = 0;
      const by = new Map(); lines.forEach((x) => { if (!by.has(x.partyId)) by.set(x.partyId, []); by.get(x.partyId).push(x); });
      by.forEach((list, sid) => {
        const debts = []; let credit = 0; const terms = termsOf(sid);
        list.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((x) => { if (x.direction === 'in') debts.push({ date: x.date, left: x.amountCents }); else credit += x.amountCents; });
        debts.forEach((d) => { const u = Math.min(d.left, credit); d.left -= u; credit -= u; if (d.left <= 0) return;
          const days = Math.floor((Date.parse(todayYmd()) - Date.parse(d.date)) / 86400000); cents[days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3] += d.left; oldest = Math.max(oldest, days);
          if (days > terms) { overdue += d.left; oldestOverdue = Math.max(oldestOverdue, days - terms); } else notDue += d.left; });
      });
      return { totalCents: cents.reduce((a, b) => a + b, 0), buckets: ['0-30', '31-60', '61-90', '90+'].map((key, i) => ({ key, cents: cents[i] })), oldestDays: oldest, notDueCents: notDue, overdueCents: overdue, oldestOverdueDays: oldestOverdue };
    }
    function statement(lines, from, to) {
      const all = lines.slice().sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
      const opening = from ? bal(all.filter((x) => x.date < from)) : 0;
      let run = opening;
      const shown = all.filter((x) => (!from || x.date >= from) && (!to || x.date <= to));
      return { openingCents: opening, lines: shown.map((x) => { run += x.direction === 'in' ? x.amountCents : -x.amountCents; return { ...x, inCents: x.direction === 'in' ? x.amountCents : 0, outCents: x.direction === 'out' ? x.amountCents : 0, runningCents: run }; }), closingCents: run };
    }
    return {
      list() {
        const d = seed(); let weOwe = 0, theyOwe = 0;
        const pendingBy = (sid) => d.pending.filter((x) => x.partyId === sid).length;
        const suppliers = d.suppliers.filter((s) => !s.archived).map((s) => { const ls = live(s.id), b = bal(ls); if (b > 0) weOwe += b; else theyOwe -= b;
          return { ...s, balanceCents: b, lines: ls.length, lastDate: ls.map((x) => x.date).sort().pop() || '', pending: pendingBy(s.id), ageing: ageing(ls) }; });
        const inbox = d.pending.map((x) => ({ ...x, supplierName: (d.suppliers.find((s) => s.id === x.partyId) || {}).name || '' }));
        return { ok: true, demo: true, migrated: true, suppliers, inbox, unlinked: d.unlinked.slice(),
          totals: { weOweCents: weOwe, theyOweCents: theyOwe, count: suppliers.length, pending: inbox.length, unlinked: d.unlinked.length, ageing: ageing(d.lines.filter((x) => x.partyId !== 'main')) } };
      },
      statement(id, from, to) {
        const s = seed().suppliers.find((x) => x.id === id); if (!s) return null;
        const ls = live(id), purchased = ls.filter((x) => x.direction === 'in').reduce((a, x) => a + x.amountCents, 0), paid = ls.filter((x) => x.kind === 'payment').reduce((a, x) => a + x.amountCents, 0), b = bal(ls);
        return { ok: true, demo: true, supplier: s, balance: { balanceCents: b }, statement: statement(ls, from, to), ageing: ageing(ls), orders: seed().orders[id] || [],
          pending: seed().pending.filter((x) => x.partyId === id),
          scorecard: { orderCount: ls.filter((x) => x.kind === 'purchase').length, orderedCents: purchased, averageOrderCents: Math.round(purchased / Math.max(1, ls.filter((x) => x.kind === 'purchase').length)), receivedPct: 100, notReceivedCents: 0, returnRatePct: 0, purchasedCents: purchased, paidCents: paid, paidPct: purchased ? Math.min(100, Math.round((paid / purchased) * 1000) / 10) : null, unpaidCents: Math.max(0, b) } };
      },
      post(sid, dir, cents, kind, method, note, date, ref) { seed().lines.push({ id: 'd' + idem(), partyId: sid, date: date || todayYmd(), direction: dir, amountCents: cents, kind, method, note, ref: ref || '', poNumber: /^BC-/.test(ref || '') ? ref : '', createdAt: Date.now() }); },
      payPo(sid, number, cents) { const o = (seed().orders[sid] || []).find((x) => x.number === number); if (o) { o.paidCents += cents; o.dueCents = Math.max(0, o.receivedCents - o.paidCents); o.payState = o.dueCents ? 'partial' : 'paid'; } },
      approve(id) { const d = seed(); const x = d.pending.find((p) => p.id === id); d.pending = d.pending.filter((p) => p.id !== id); if (x) d.lines.push({ ...x, pending: false }); },
      approveAll(sid) { seed().pending.filter((p) => !sid || p.partyId === sid).map((p) => p.id).forEach((id) => this.approve(id)); },
      attach(number, sid) { const d = seed(); const u = d.unlinked.find((x) => x.number === number); d.unlinked = d.unlinked.filter((x) => x.number !== number); if (u) d.lines.push({ id: 'd' + idem(), partyId: sid, date: u.firstDate, direction: 'in', amountCents: u.netCents, kind: 'purchase', method: 'other', ref: number, poNumber: number, note: '', createdAt: Date.now() }); },
      cash() { const d = seed(); return { ok: true, demo: true, balance: { balanceCents: bal(d.cash) }, statement: statement(d.cash) }; },
      cashPost(dir, cents, method, note, date) { seed().cash.push({ id: 'd' + idem(), partyId: 'main', date: date || todayYmd(), direction: dir, amountCents: cents, kind: 'manual', method, note, createdAt: Date.now() }); },
      add(s) { const row = { id: 'demo-' + idem(), archived: false, termsDays: 0, ...s }; seed().suppliers.push(row); return row; },
      edit(id, patch) { const s = seed().suppliers.find((x) => x.id === id); if (s) Object.assign(s, patch); return s; },
      void(id) { const d = seed(); d.lines = d.lines.filter((x) => x.id !== id); d.cash = d.cash.filter((x) => x.id !== id); d.pending = d.pending.filter((x) => x.id !== id); },
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
  function tr(code) {
    return ({
      'owner-required': L('Réservé au propriétaire du commerce.', 'Owner only.', 'خاص بمول المحل.'),
      'bad-amount': L('Montant invalide.', 'Invalid amount.', 'المبلغ غير صحيح.'),
      'name-required': L('Le nom est obligatoire.', 'Name is required.', 'الاسم ضروري.'),
      'supplier-archived': L('Ce fournisseur est archivé : restaurez-le pour lui payer ou ajouter une facture.', 'This supplier is archived: restore it to pay or add a bill.', 'هاد المورد مؤرشف: رجّعو باش تخلّصو ولا تزيد فاتورة.'),
      'attach-required': L("Rattachez d'abord cette réception à une fiche.", 'Attach this receipt to a supplier first.', 'ربط هاد الاستلام بمورد قبل.'),
      unmigrated: L('Mise à jour en cours : le grand livre des fournisseurs arrive sur ce compte.', 'Update in progress: the supplier ledger is coming to this account.', 'التحديث فطور الخدمة: دفتر الموردين جاي لهاد الحساب.'),
    }[code]) || L('Impossible pour le moment. Réessayez.', 'Not possible right now. Try again.', 'ما تقدرش دابا. عاود من بعد.');
  }

  const S = { list: null, tab: 'owe', sort: 'owe', q: '', view: 'list', id: '', detail: null, cash: null };

  /* ── Liste ─────────────────────────────────────────────────────────── */
  function ageBar(ageing) {
    const total = (ageing && ageing.totalCents) || 0;
    const buckets = (ageing && ageing.buckets) || [];
    const labels = AGE();
    const bar = total ? buckets.map((b, i) => b.cents ? `<i class="a${i}" style="width:${(b.cents / total) * 100}%"></i>` : '').join('') : '';
    const due = ageing && (ageing.overdueCents || ageing.notDueCents) ? `<div class="sp-due">
      ${ageing.overdueCents ? `<span class="sp-chip late">${esc(L('En retard', 'Overdue', 'متأخر'))} ${esc(mad(ageing.overdueCents))}</span>` : ''}
      ${ageing.notDueCents ? `<span class="sp-chip ok">${esc(L('Pas encore échu', 'Not yet due', 'مازال ما حلّ أجلو'))} ${esc(mad(ageing.notDueCents))}</span>` : ''}
      ${ageing.oldestOverdueDays ? `<span class="sp-hint">${esc(L('le plus ancien retard :', 'longest overdue:', 'أقدم تأخير:'))} ${esc(daysTxt(ageing.oldestOverdueDays))}</span>` : ''}</div>` : '';
    return `<div class="sp-age" role="img" aria-label="${esc(L('Ancienneté de ce que vous devez', 'Age of what you owe', 'قدم الديون'))}">${bar}</div>
      <div class="sp-legend">${buckets.map((b, i) => `<span><b class="a${i}"></b>${esc(labels[i][1])} · ${esc(mad(b.cents))}</span>`).join('')}</div>${due}`;
  }

  function sorted(list) {
    const q = S.q.trim().toLowerCase();
    const rows = list.filter((s) => !q || [s.name, s.phone, s.ice, s.email].some((v) => String(v || '').toLowerCase().includes(q)));
    if (S.sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name));
    else if (S.sort === 'recent') rows.sort((a, b) => String(b.lastDate || '').localeCompare(String(a.lastDate || '')));
    else if (S.sort === 'late') rows.sort((a, b) => ((b.ageing && b.ageing.overdueCents) || 0) - ((a.ageing && a.ageing.overdueCents) || 0) || b.balanceCents - a.balanceCents);
    else rows.sort((a, b) => b.balanceCents - a.balanceCents || a.name.localeCompare(b.name));
    return rows;
  }

  function rowHtml(s) {
    const a = s.ageing || {};
    const late = s.balanceCents > 0 && a.overdueCents ? `<span class="sp-chip late">${esc(L('en retard', 'overdue', 'متأخر'))} ${esc(mad(a.overdueCents))}</span>` : '';
    const pend = s.pending ? `<span class="sp-chip late">${esc(L(pl(s.pending, '1 réception en attente', `${s.pending} réceptions en attente`), pl(s.pending, '1 receipt pending', `${s.pending} receipts pending`), arPl(s.pending, 'استلام واحد فالانتظار', 'جوج استلامات فالانتظار', `${s.pending} استلامات فالانتظار`, `${s.pending} استلام فالانتظار`)))}</span>` : '';
    return `<div class="sp-row" data-action="sup-open" data-arg="${esc(s.id)}" role="button" tabindex="0">
      <div><div class="n">${esc(s.name)}</div><div class="m">${s.phone ? `<span dir="ltr">${esc(s.phone)}</span>` : ''}${s.lastDate ? `<span>${esc(L('dernier mouvement', 'last entry', 'آخر حركة'))} ${esc(dmy(s.lastDate))}</span>` : `<span>${esc(L('aucun mouvement', 'no entries yet', 'حتى حركة'))}</span>`}${s.termsDays ? `<span>${esc(L('paiement à', 'terms', 'الأجل'))} ${esc(daysTxt(s.termsDays))}</span>` : ''}</div></div>
      <div class="r">${owedChip(s.balanceCents)}${late}${pend}</div></div>`;
  }

  function tabsHtml() {
    const t = (S.list && S.list.totals) || {};
    const waiting = (t.pending || 0) + (t.unlinked || 0);
    const tab = (k, label, extra) => `<button type="button" class="${S.tab === k ? 'on' : ''}" data-lens-item data-action="sup-tab" data-arg="${k}" role="tab" aria-selected="${S.tab === k}">${esc(label)}${extra || ''}</button>`;
    return `<div class="sp-tabs" data-lens-demo role="tablist" aria-label="${esc(L('Fournisseurs', 'Suppliers', 'الموردون'))}">
      ${tab('owe', L('Ce que je dois', 'What I owe', 'شنو عليا'))}${tab('rank', L('Classement', 'Ranking', 'الترتيب'))}${tab('inbox', L('À approuver', 'To approve', 'للموافقة'), waiting ? ` <span class="n">${esc(String(waiting))}</span>` : '')}</div>`;
  }

  function oweTab(d) {
    const rows = sorted(d.suppliers || []);
    const pill = (k, label) => `<button type="button" class="${S.sort === k ? 'on' : ''}" data-lens-item data-action="sup-sort" data-arg="${k}">${esc(label)}</button>`;
    return `<div class="sp-bar">
        <label class="sp-search">${icon('search')}<input type="search" data-sp-q value="${esc(S.q)}" placeholder="${esc(L('Chercher un fournisseur, un téléphone, un ICE', 'Search a supplier, phone or ICE', 'قلّب على مورد، تيليفون ولا ICE'))}" aria-label="${esc(L('Chercher', 'Search', 'بحث'))}"></label>
        <div class="sp-pills" data-lens-demo role="group" aria-label="${esc(L('Trier', 'Sort', 'ترتيب'))}">${pill('owe', L('Je dois le plus', 'I owe most', 'اللي عليا ليه كثر'))}${pill('late', L('En retard', 'Overdue', 'متأخر'))}${pill('recent', L('Récents', 'Recent', 'الأحدث'))}${pill('name', L('Nom', 'Name', 'الاسم'))}</div>
        <button type="button" class="kb ghost sp-btn" data-action="sup-cashbook">${icon('wallet')}${esc(L('Livre de caisse', 'Cash book', 'دفتر الصندوق'))}</button>
        <button type="button" class="kb atlas sp-btn" data-action="sup-new">${icon('add')}${esc(L('Nouveau fournisseur', 'New supplier', 'مورد جديد'))}</button>
      </div>
      <div class="sp-card">${rows.length ? `<div class="sp-list">${rows.map(rowHtml).join('')}</div>` : `<div class="sp-empty">${icon('truck')}<p>${esc((d.suppliers || []).length
        ? L('Aucun fournisseur ne correspond.', 'No supplier matches.', 'حتى مورد ما كيطابق.')
        : L('Ajoutez votre premier fournisseur : chaque réception de bon de commande inscrira ce que vous lui devez, chaque paiement le réduira.', 'Add your first supplier: every received purchase order records what you owe, every payment reduces it.', 'زيد أول مورد: كل سلعة توصلات كتتسجل عليك، وكل أداء كينقص منها.'))}</p></div>`}</div>`;
  }

  function supplierOptions(selected) {
    return ((S.list && S.list.suppliers) || []).map((s) => `<option value="${esc(s.id)}"${s.id === selected ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  }
  /* La fiche la plus proche du nom écrit sur le bon (mots en commun). */
  function guessSupplier(name) {
    const words = (v) => String(v || '').toLowerCase().split(/[^a-z0-9À-ɏ؀-ۿ]+/).filter((w) => w.length > 2);
    const want = new Set(words(name));
    let best = '', score = 0;
    ((S.list && S.list.suppliers) || []).forEach((s) => { const n = words(s.name).filter((w) => want.has(w)).length; if (n > score) { score = n; best = s.id; } });
    return best;
  }

  function inboxTab(d) {
    const inbox = d.inbox || [], unlinked = d.unlinked || [];
    if (!inbox.length && !unlinked.length) return `<div class="sp-card sp-empty">${icon('done')}<p>${esc(L("Rien n'attend votre accord.", 'Nothing awaits your approval.', 'حتى حاجة ما كتسنى الموافقة ديالك.'))}</p></div>`;
    const pendHtml = inbox.length ? `<div class="sp-card"><h3 class="sp-h3"><span>${esc(L(pl(inbox.length, '1 réception saisie par l\'équipe', `${inbox.length} réceptions saisies par l'équipe`), pl(inbox.length, '1 receipt entered by your team', `${inbox.length} receipts entered by your team`), arPl(inbox.length, 'استلام واحد دخّلو الفريق', 'جوج استلامات دخّلهم الفريق', `${inbox.length} استلامات دخّلهم الفريق`, `${inbox.length} استلام دخّلو الفريق`)))}</span>
        <button type="button" class="kb atlas sp-btn" data-action="sup-approve-all">${icon('done')}${esc(L('Tout approuver', 'Approve all', 'وافق على الكل'))}</button></h3>
      <p class="sp-hint" style="margin-bottom:6px">${esc(L("Hors des soldes tant que vous n'approuvez pas.", 'Not in the balances until you approve.', 'ما كيدخلوش فالحسابات حتى توافق.'))}</p>
      ${inbox.map((l) => `<div class="sp-inbox-row"><div><div class="who">${esc(l.supplierName || '')}</div>
        <div class="sub">${esc(dmy(l.date))} · ${esc(lineLabel(l))} · <b style="font-weight:600">${esc(mad(l.amountCents))}</b>${l.createdBy ? ' · ' + esc(l.createdBy) : ''}</div></div>
        <div style="display:inline-flex;gap:12px"><button type="button" class="sp-link" data-action="sup-approve" data-arg="${esc(l.id)}">${esc(L('Approuver', 'Approve', 'وافق'))}</button><button type="button" class="sp-void" data-action="sup-void" data-arg="${esc(l.id)}">${esc(L('Refuser', 'Reject', 'رفض'))}</button></div></div>`).join('')}</div>` : '';
    const unlHtml = unlinked.length ? `<div class="sp-card"><h3 class="sp-h3"><span>${esc(L('Réceptions sans fiche', 'Receipts without a supplier card', 'استلامات بلا بطاقة مورد'))}</span></h3>
      <p class="sp-hint" style="margin-bottom:6px">${esc(L("L'équipe a reçu un bon d'un fournisseur sans fiche. Choisissez la fiche : le bon y est relié et la dette entre dans son solde.", 'Your team received an order from a supplier with no card. Pick the card: the order is linked and the debt enters its balance.', 'الفريق استلم أمر من مورد بلا بطاقة. ختار البطاقة: الأمر كيترابط والدين كيدخل فالحساب ديالو.'))}</p>
      ${unlinked.map((u) => `<div class="sp-inbox-row"><div><div class="who">${esc(u.supplierName || u.number)}</div>
        <div class="sub">${esc(u.number)} · ${esc(dmy(u.firstDate))} · <b style="font-weight:600">${esc(mad(u.netCents))}</b>${u.by ? ' · ' + esc(u.by) : ''}</div></div>
        <div class="sp-attach" data-sp-attach="${esc(u.number)}"><select aria-label="${esc(L('Fiche fournisseur', 'Supplier card', 'بطاقة المورد'))}"><option value="">${esc(L('Choisir une fiche', 'Pick a card', 'ختار بطاقة'))}</option>${supplierOptions(guessSupplier(u.supplierName))}<option value="__new">${esc(L('Nouvelle fiche à ce nom', 'New card with this name', 'بطاقة جديدة بهاد الاسم'))}</option></select>
          <button type="button" class="kb atlas sp-btn" data-action="sup-attach" data-arg="${esc(u.number)}">${icon('link')}${esc(L('Rattacher', 'Attach', 'ربط'))}</button></div></div>`).join('')}</div>` : '';
    return pendHtml + unlHtml;
  }

  function rankTab() {
    return `<div class="sp-card" data-sp-rank-wait hidden><p class="sp-hint">${esc(L('Le classement se prépare avec le stock de la boutique. Ouvrez le Stock une fois, puis revenez ici.', 'The ranking loads with the shop stock. Open Stock once, then come back.', 'الترتيب كيتوجد مع ستوك المحل. حلّ الستوك مرة ورجع لهنا.'))}</p></div>
      <div class="st-section sr-board" data-sr-board></div>`;
  }

  function listBody() {
    const d = S.list;
    if (!d) return `<div class="sp-card sp-empty">${esc(L('Chargement des fournisseurs…', 'Loading suppliers…', 'كنجيبو الموردين…'))}</div>`;
    if (d.migrated === false) return `<div class="sp-wrap">${tabsHtml()}${S.tab === 'rank' ? rankTab() : `<div class="sp-card sp-empty">${icon('sync')}<p><b style="font-weight:600">${esc(L('Mise à jour en cours', 'Update in progress', 'التحديث فطور الخدمة'))}</b></p><p class="sp-hint">${esc(L('Les soldes fournisseurs arrivent sur ce compte. Vos bons de commande et réceptions continuent de marcher comme avant.', 'Supplier balances are coming to this account. Purchase orders and receipts keep working as before.', 'حسابات الموردين جاية لهاد الحساب. أوامر الشراء والاستلام خدامين بحال قبل.'))}</p></div>`}</div>`;
    const t = d.totals || {};
    const a = t.ageing || {};
    const body = S.tab === 'rank' ? rankTab() : S.tab === 'inbox' ? inboxTab(d) : oweTab(d);
    return `<div class="sp-wrap">
      <div class="sp-card"><div class="sp-kpis">
        <div class="sp-kpi"><div class="k">${esc(L('Vous devez à vos fournisseurs', 'You owe your suppliers', 'عليك للموردين'))}</div><div class="v ${t.weOweCents ? 'owe' : 'ok'}">${esc(mad(t.weOweCents))}</div></div>
        <div class="sp-kpi"><div class="k">${esc(L('Dont en retard', 'Of which overdue', 'منها متأخر'))}</div><div class="v ${a.overdueCents ? 'late' : 'ok'}">${esc(mad(a.overdueCents))}</div></div>
        <div class="sp-kpi"><div class="k">${esc(L('Avances chez eux', 'Advances with them', 'تسبيقات عندهم'))}</div><div class="v">${esc(mad(t.theyOweCents))}</div></div>
      </div>${ageBar(a)}</div>
      ${tabsHtml()}
      ${body}
    </div>`;
  }

  function paint() {
    css();
    const title = L('Fournisseurs', 'Suppliers', 'الموردون');
    let body = '', sub = '';
    if (S.view === 'supplier') { body = detailBody(); sub = S.detail ? S.detail.supplier.name : ''; }
    else if (S.view === 'cashbook') { body = cashBody(); sub = L('Livre de caisse', 'Cash book', 'دفتر الصندوق'); }
    else { body = listBody(); sub = L('Ce que vous devez, à qui, depuis quand, et qui mérite la prochaine commande', 'What you owe, to whom, since when, and who deserves the next order', 'شنو عليك، لمن، من إمتى، وشكون يستاهل الطلبية الجاية'); }
    if (!isReal()) sub += ' · ' + L('démo', 'demo', 'تجريبي');
    const r = K.appPage('fournisseurs', { title, subtitle: sub, body });
    const root = r && r.el ? r.el : document.querySelector('.dash-genpage');
    const q = root && root.querySelector && root.querySelector('[data-sp-q]');
    if (q) q.addEventListener('input', () => {
      S.q = q.value;
      const host = root.querySelector('.sp-list') || root.querySelector('.sp-empty');
      const card = host && host.closest('.sp-card');
      const rows = sorted((S.list && S.list.suppliers) || []);
      if (card) card.innerHTML = rows.length ? `<div class="sp-list">${rows.map(rowHtml).join('')}</div>` : `<div class="sp-empty">${icon('truck')}<p>${esc(L('Aucun fournisseur ne correspond.', 'No supplier matches.', 'حتى مورد ما كيطابق.'))}</p></div>`;
    });
    /* Le classement est monté par assets/stock/suppliers.js ; s'il n'est pas chargé, on le dit. */
    if (S.view === 'list' && S.tab === 'rank' && root && root.querySelector) {
      setTimeout(() => {
        const board = root.querySelector('[data-sr-board]'), wait = root.querySelector('[data-sp-rank-wait]');
        if (board && wait && !board.dataset.srReady) wait.hidden = false;
      }, 2500);
    }
    if (S.view === 'supplier' && S.detail) fillRank(root);
  }

  async function loadList() {
    if (!isReal()) { S.list = DEMO.list(); return; }
    try { S.list = await api('/api/suppliers'); }
    catch (e) { S.list = { suppliers: [], totals: {}, inbox: [], unlinked: [], migrated: e.code === 'unmigrated' ? false : undefined }; if (e.code !== 'unmigrated') K.toast(tr(e.code), { type: 'warning' }); }
  }

  async function showList(tab) {
    if (tab) S.tab = ['owe', 'rank', 'inbox'].includes(tab) ? tab : 'owe';
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
  const payStateChip = (o) => ({
    paid: `<span class="sp-chip paid">${esc(L('Payé', 'Paid', 'مخلّص'))}</span>`,
    partial: `<span class="sp-chip late">${esc(L('Payé en partie', 'Partly paid', 'مخلّص شوية'))}</span>`,
    unpaid: `<span class="sp-chip owe">${esc(L('À payer', 'To pay', 'للأداء'))}</span>`,
  }[o.payState] || `<span class="sp-chip ok">${esc(L('Pas encore reçu', 'Not received yet', 'مازال ما توصل'))}</span>`);

  function statementHtml(st, canVoid) {
    const lines = (st && st.lines) || [];
    if (!lines.length && !(st && st.openingCents)) return `<p class="sp-hint">${esc(L('Aucun mouvement. Une réception de bon de commande, une facture ou un paiement apparaîtra ici.', 'No entries yet. A received purchase order, a bill or a payment will show here.', 'حتى حركة. السلعة اللي توصلات، الفواتير والأداءات غادي يبانو هنا.'))}</p>`;
    const voidBtn = (l) => canVoid && ['payment', 'bill', 'opening'].includes(l.kind) ? `<button type="button" class="sp-void" data-action="sup-void" data-arg="${esc(l.id)}">${esc(L('Annuler', 'Void', 'إلغاء'))}</button>` : '';
    const sub = (l) => String(l.note || '');
    const table = `<div class="sp-tablewrap"><table class="sp-table"><thead><tr><th>${esc(L('Date', 'Date', 'التاريخ'))}</th><th>${esc(L('Libellé', 'Description', 'البيان'))}</th>
      <th class="num">${esc(L('Reçu de lui', 'Received', 'توصلت منو'))}</th><th class="num">${esc(L('Payé', 'Paid', 'خلّصت'))}</th><th class="num">${esc(L('Je dois', 'I owe', 'باقي عليا'))}</th><th></th></tr></thead><tbody>
      ${st.openingCents ? `<tr><td></td><td class="lbl">${esc(L('Report', 'Brought forward', 'المرحّل'))}</td><td></td><td></td><td class="num">${esc(mad(st.openingCents))}</td><td></td></tr>` : ''}
      ${lines.map((l) => `<tr><td>${esc(dmy(l.date))}</td><td class="lbl">${esc(lineLabel(l))}${sub(l) ? `<small>${esc(sub(l))}</small>` : ''}</td>
        <td class="num">${l.inCents ? esc(mad(l.inCents)) : ''}</td><td class="num">${l.outCents ? esc(mad(l.outCents)) : ''}</td><td class="num">${esc(mad(l.runningCents))}</td><td>${voidBtn(l)}</td></tr>`).join('')}
      </tbody></table></div>`;
    /* Téléphone : des lignes empilées, rien ne glisse de côté (en arabe non plus). */
    const stack = `<div class="sp-st">${st.openingCents ? `<div class="sp-st-row"><div>${esc(L('Report', 'Brought forward', 'المرحّل'))}</div><div class="run">${esc(mad(st.openingCents))}</div></div>` : ''}
      ${lines.slice().reverse().map((l) => `<div class="sp-st-row"><div>${esc(lineLabel(l))}<small>${esc(dmy(l.date))}${sub(l) ? ' · ' + esc(sub(l)) : ''}</small></div>
        <div><div class="amt ${l.direction}">${l.direction === 'in' ? '+' : '−'}${esc(mad(l.amountCents))}</div><div class="run">${esc(L('je dois', 'I owe', 'باقي عليا'))} ${esc(mad(l.runningCents))}</div>${voidBtn(l)}</div></div>`).join('')}</div>`;
    return table + stack;
  }

  function detailBody() {
    const d = S.detail;
    if (!d) return `<div class="sp-card sp-empty">${esc(L('Chargement du relevé…', 'Loading statement…', 'كنجيبو الكشف…'))}</div>`;
    const s = d.supplier, b = (d.balance && d.balance.balanceCents) || 0, sc = d.scorecard || {}, a = d.ageing || {};
    const big = b > 0 ? `<div class="k">${esc(L('Vous lui devez', 'You owe', 'باقي عليك ليه'))}</div><div class="sp-big owe">${esc(mad(b))}</div>`
      : b < 0 ? `<div class="k">${esc(L('Il vous doit (avance)', 'Owes you (advance)', 'باقي عليه ليك (تسبيق)'))}</div><div class="sp-big adv">${esc(mad(-b))}</div>`
        : `<div class="k">${esc(L('Solde', 'Balance', 'الرصيد'))}</div><div class="sp-big">${esc(L('À jour', 'Settled', 'مخلّص'))}</div>`;
    const due = b > 0 && (a.overdueCents || a.notDueCents) ? `<div class="sp-due">${a.overdueCents ? `<span class="sp-chip late">${esc(L('en retard', 'overdue', 'متأخر'))} ${esc(mad(a.overdueCents))}</span>` : ''}${a.notDueCents ? `<span class="sp-chip ok">${esc(L('pas encore échu', 'not yet due', 'مازال ما حلّ'))} ${esc(mad(a.notDueCents))}</span>` : ''}</div>` : '';
    const meta = [s.phone ? `<span>${icon('call')}<span dir="ltr">${esc(s.phone)}</span></span>` : '', s.ice ? `<span>ICE <span dir="ltr">${esc(s.ice)}</span></span>` : '', s.rib ? `<span>RIB <span dir="ltr">${esc(s.rib)}</span></span>` : '',
      s.termsDays ? `<span>${esc(L('Paiement à', 'Terms', 'أجل الأداء'))} ${esc(daysTxt(s.termsDays))}</span>` : '', s.archived ? `<span class="sp-chip ok">${esc(L('Archivé', 'Archived', 'مؤرشف'))}</span>` : ''].join('');
    const pend = d.pending || [];
    const pendHtml = pend.length ? `<div class="sp-card"><h3 class="sp-h3"><span>${esc(L(pl(pend.length, '1 ligne attend votre accord', `${pend.length} lignes attendent votre accord`), pl(pend.length, '1 entry awaits your approval', `${pend.length} entries await your approval`), arPl(pend.length, 'سطر واحد كيتسنى الموافقة ديالك', 'جوج سطور كيتسناو الموافقة ديالك', `${pend.length} سطور كيتسناو الموافقة ديالك`, `${pend.length} سطر كيتسناو الموافقة ديالك`)))}</span>
      ${pend.length > 1 ? `<button type="button" class="sp-link" data-action="sup-approve-all" data-arg="${esc(s.id)}">${icon('done')}${esc(L('Tout approuver', 'Approve all', 'وافق على الكل'))}</button>` : ''}</h3>
      <p class="sp-hint" style="margin-bottom:8px">${esc(L("Saisi par l'équipe. Hors du solde tant que vous n'approuvez pas.", 'Entered by your team. Not in the balance until you approve.', 'دخّلو الفريق. ما كيدخلش فالرصيد حتى توافق.'))}</p>
      ${pend.map((l) => `<div class="sp-po"><span>${esc(dmy(l.date))} · ${esc(lineLabel(l))} · <b style="font-weight:600">${esc(mad(l.amountCents))}</b>${l.createdBy ? `<span class="sub">${esc(l.createdBy)}</span>` : ''}</span>
        <span style="display:inline-flex;gap:12px"><button type="button" class="sp-link" data-action="sup-approve" data-arg="${esc(l.id)}">${esc(L('Approuver', 'Approve', 'وافق'))}</button><button type="button" class="sp-void" data-action="sup-void" data-arg="${esc(l.id)}">${esc(L('Refuser', 'Reject', 'رفض'))}</button></span></div>`).join('')}</div>` : '';
    const orders = (d.orders || []).filter((o) => o.status !== 'cancelled' && o.status !== 'draft');
    const ordersHtml = orders.length ? `<div class="sp-card"><h3 class="sp-h3">${esc(L('Bons de commande', 'Purchase orders', 'أوامر الشراء'))}</h3>${orders.map((o) => `<div class="sp-po"><span><b style="font-weight:600">${esc(o.number)}</b> ${payStateChip(o)}
        <span class="sub">${esc(L('reçu', 'received', 'توصل'))} ${esc(mad(o.receivedCents))} · ${esc(L('payé', 'paid', 'تخلّص'))} ${esc(mad(o.paidCents))}${o.dueCents ? ' · ' + esc(L('reste', 'due', 'الباقي')) + ' ' + esc(mad(o.dueCents)) : ''}</span></span>
      ${o.dueCents > 0 && !s.archived ? `<button type="button" class="sp-link" data-action="sup-pay-po" data-arg="${esc(s.id + '|' + o.number + '|' + o.dueCents)}">${icon('pay')}${esc(L('Payer ce bon', 'Pay this order', 'خلّص هاد الأمر'))}</button>` : ''}</div>`).join('')}</div>` : '';
    const acts = s.archived
      ? `<button type="button" class="kb atlas sp-btn" data-action="sup-restore" data-arg="${esc(s.id)}">${icon('archive')}${esc(L('Restaurer', 'Restore', 'رجّع'))}</button>`
      : `<button type="button" class="kb atlas sp-btn" data-action="sup-pay" data-arg="${esc(s.id)}">${icon('pay')}${esc(L('Enregistrer un paiement', 'Record a payment', 'سجّل أداء'))}</button>
          <button type="button" class="kb ghost sp-btn" data-action="sup-bill" data-arg="${esc(s.id)}">${icon('bill')}${esc(L('Ajouter une facture', 'Add a bill', 'زيد فاتورة'))}</button>`;
    return `<div class="sp-wrap">
      <div><button type="button" class="sp-link" data-action="sup-back">${icon('back', 'flip')}${esc(L('Tous les fournisseurs', 'All suppliers', 'جميع الموردين'))}</button></div>
      <div class="sp-card"><div class="sp-head"><div><h2>${esc(s.name)}</h2><div class="sp-meta">${meta}</div></div><div>${big}${due}</div></div>
        <div class="sp-acts">${acts}
          <button type="button" class="kb ghost sp-btn" data-action="sup-statement" data-arg="${esc(s.id)}">${icon('print')}${esc(L('Relevé : imprimer, WhatsApp, CSV', 'Statement: print, WhatsApp, CSV', 'الكشف: طبع، واتساب، CSV'))}</button>
          <button type="button" class="kb ghost sp-btn" data-action="sup-edit" data-arg="${esc(s.id)}">${icon('edit')}${esc(L('Modifier', 'Edit', 'تعديل'))}</button>
          ${s.archived ? '' : `<button type="button" class="kb ghost sp-btn" data-action="sup-archive" data-arg="${esc(s.id)}">${icon('archive')}${esc(L('Archiver', 'Archive', 'أرشفة'))}</button>`}
        </div></div>
      ${pendHtml}
      <div class="sp-grid">
        <div class="sp-card"><h3 class="sp-h3">${esc(L('Relevé', 'Statement', 'كشف الحساب'))}</h3>${statementHtml(d.statement, true)}</div>
        <div class="sp-wrap">
          <div class="sp-card" data-sp-rank hidden></div>
          <div class="sp-card"><h3 class="sp-h3">${esc(L('Depuis quand je dois', 'How old is what I owe', 'من إمتى عليا هاد الدين'))}</h3>${ageBar(a)}</div>
          ${ordersHtml}
          <div class="sp-card"><h3 class="sp-h3">${esc(L('Tableau du fournisseur', 'Supplier scorecard', 'بطاقة المورد'))}</h3><div class="sp-score">
            <div><div class="k">${esc(L('Commandé', 'Ordered', 'المطلوب'))}</div><div class="v">${esc(mad(sc.orderedCents || sc.purchasedCents))}</div><div class="k">${esc(L(pl(sc.orderCount || 0, '1 bon', `${sc.orderCount || 0} bons`), pl(sc.orderCount || 0, '1 order', `${sc.orderCount || 0} orders`), arPl(sc.orderCount || 0, 'أمر واحد', 'جوج أوامر', `${sc.orderCount || 0} أوامر`, `${sc.orderCount || 0} أمر`)))}</div></div>
            <div><div class="k">${esc(L('Panier moyen', 'Average order', 'متوسط الطلب'))}</div><div class="v">${esc(mad(sc.averageOrderCents))}</div></div>
            ${pctLine(L('Reçu', 'Received', 'توصلت'), sc.receivedPct, sc.notReceivedCents ? L('reste à recevoir', 'still to receive', 'باقي ما وصل') + ' ' + mad(sc.notReceivedCents) : '')}
            ${pctLine(L('Payé', 'Paid', 'تخلّص'), sc.paidPct, sc.unpaidCents ? L('reste dû', 'still owed', 'باقي عليك') + ' ' + mad(sc.unpaidCents) : '')}
            ${pctLine(L('Taux de retour', 'Return rate', 'نسبة الإرجاع'), sc.returnRatePct, '')}
          </div></div>
        </div>
      </div>
    </div>`;
  }

  /* Le classement à côté du solde : score, place, verdict, à réassortir
     (assets/stock/suppliers.js, mêmes ids de fiche). Absent : rien ne s'affiche. */
  async function fillRank(root) {
    const host = root && root.querySelector && root.querySelector('[data-sp-rank]');
    const id = S.id;
    if (!host || !handlers['sr-brief']) return;
    let b = null;
    try { b = await handlers['sr-brief'](null, id); } catch (_) { b = null; }
    if (!b || S.id !== id || !host.isConnected) return;
    const place = L(`${b.rank === 1 ? '1er' : b.rank + 'e'} sur ${b.of}`, `#${b.rank} of ${b.of}`, `${b.rank} من ${b.of}`);
    host.innerHTML = `<h3 class="sp-h3">${esc(L('Classement', 'Ranking', 'الترتيب'))}</h3>
      <div class="sp-rank"><div class="sp-ring" style="--p:${Math.max(0, Math.min(100, b.score))}"><b>${esc(String(b.score))}</b></div>
        <div><div>${esc(place)}</div><span class="sp-verdict ${esc(b.tone)}">${esc(b.label)}</span><p class="sp-hint" style="margin-top:6px">${esc(b.say)}</p></div></div>
      <div class="sp-acts" style="margin-top:10px"><button type="button" class="kb ghost sp-btn" data-action="sup-rank-open" data-arg="${esc(id)}">${icon('truck')}${esc(b.reorder > 0
        ? L(pl(b.reorder, 'Préparer la commande · 1 pièce', `Préparer la commande · ${b.reorder} pièces`), pl(b.reorder, 'Prepare the order · 1 piece', `Prepare the order · ${b.reorder} pieces`), arPl(b.reorder, 'حضّر الطلبية · قطعة وحدة', 'حضّر الطلبية · جوج قطع', `حضّر الطلبية · ${b.reorder} قطع`, `حضّر الطلبية · ${b.reorder} قطعة`))
        : L('Voir le détail du score', 'See the score detail', 'شوف تفاصيل النقطة'))}</button></div>`;
    host.hidden = false;
  }

  async function loadDetail(id, period) {
    const p = period || {};
    if (!isReal()) { S.detail = DEMO.statement(id, p.from, p.to); return !!S.detail; }
    try {
      const q = '/api/suppliers/statement?id=' + encodeURIComponent(id) + (p.from ? '&from=' + p.from : '') + (p.to ? '&to=' + p.to : '');
      S.detail = await api(q); return true;
    } catch (e) { K.toast(tr(e.code), { type: 'warning' }); return false; }
  }

  async function openSupplier(id) {
    if (!id) return;
    S.view = 'supplier'; S.id = id; S.detail = null; paint();
    const ok = await loadDetail(id);
    if (S.view === 'supplier' && S.id === id) { if (ok) paint(); else showList(); }
  }

  async function refreshDetail() {
    S.list = null;
    if (S.view === 'supplier' && S.id) { await loadDetail(S.id); paint(); }
    else if (S.view === 'cashbook') { await loadCash(); paint(); }
    else showList();
  }

  /* ── Saisie : paiement, facture, livre de caisse ───────────────────── */
  function segHtml(on, items, attr) {
    return `<div class="sp-seg" data-lens-demo ${attr}>${items.map(([k, label]) => `<button type="button" data-lens-item data-k="${esc(k)}" class="${k === on ? 'on' : ''}" aria-pressed="${k === on}">${esc(label)}</button>`).join('')}</div>`;
  }
  const methodItems = () => METHODS.map((m) => [m, methodLabel(m)]);
  /* Hors des fenêtres : un nom d'attribut ou de langue n'est pas un libellé à traduire. */
  const SEG = { methods: 'data-sp-methods', lang: 'data-sp-lang', langs: [['fr', 'Français'], ['ar', 'العربية'], ['en', 'English']] };
  function wireSeg(root, sel, onPick) {
    const seg = root.querySelector(sel);
    if (!seg) return;
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      seg.querySelectorAll('[data-k]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
      onPick(b.dataset.k);
    });
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
    let method = o.method || METHODS[0];
    const owed = Number(o.owedCents) || 0;
    const m = K.modal({
      tag: o.tag || '', title: o.title, width: 480,
      body: `<form class="sp-form" data-sp-form novalidate>
        <label>${esc(L('Montant (MAD)', 'Amount (MAD)', 'المبلغ (درهم)'))}<input class="sp-amt" name="amount" inputmode="decimal" autocomplete="off" value="${esc(centsInput(o.amountCents))}" required></label>
        ${o.mode === 'payment' && owed > 0 ? `<button type="button" class="sp-link" data-sp-all>${esc(L('Tout payer', 'Pay it all', 'خلّص كلشي'))} · ${esc(mad(owed))}</button>` : ''}
        ${o.mode === 'bill' ? `<label style="display:flex;align-items:center;gap:8px;grid-template-columns:none"><input type="checkbox" name="opening" style="width:auto">${esc(L("C'est une dette d'avant Kiwi", 'This is a balance from before Kiwi', 'هادا دين من قبل Kiwi'))}</label>` : ''}
        ${o.mode === 'bill' ? '' : `<div><div style="font-size:12.5px;color:var(--n-600,#3a4440);margin-bottom:6px">${esc(L('Moyen', 'Method', 'طريقة الأداء'))}</div>${segHtml(method, methodItems(), SEG.methods)}</div>`}
        <div class="two"><label>${esc(L('Date', 'Date', 'التاريخ'))}<input type="date" name="date" value="${esc(todayYmd())}" max="${esc(todayYmd())}"></label>
          <label>${esc(L('Note', 'Note', 'ملاحظة'))}<input name="note" maxlength="200" placeholder="${esc(o.notePh || '')}" value="${esc(o.note || '')}"></label></div>
        ${o.hint ? `<p class="sp-hint">${esc(o.hint)}</p>` : ''}
        <div class="sp-foot"><button type="button" class="kb ghost" data-dismiss>${esc(L('Annuler', 'Cancel', 'إلغاء'))}</button><button type="submit" class="kb atlas">${esc(o.cta)}</button></div>
      </form>`,
    });
    const form = m.el.querySelector('[data-sp-form]');
    wireSeg(form, '[data-sp-methods]', (k) => { method = k; });
    form.addEventListener('click', (e) => { if (e.target.closest('[data-sp-all]')) form.amount.value = centsInput(owed); });
    setTimeout(() => { try { form.amount.focus(); } catch (_) {} }, 60);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cents = readAmount(form.amount.value);
      if (!(cents > 0)) { K.toast(tr('bad-amount'), { type: 'warning' }); return; }
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try {
        await o.save({ cents, method, date: form.date.value || todayYmd(), note: form.note.value.trim(), opening: !!(form.opening && form.opening.checked), idemKey: key });
        m.close();
      } catch (err) { btn.disabled = false; K.toast(tr(err && err.code), { type: 'warning' }); }
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
    if (S.detail.supplier.archived) { K.toast(tr('supplier-archived'), { type: 'warning' }); return; }
    const owed = Math.max(0, (S.detail.balance && S.detail.balance.balanceCents) || 0);
    const po = preset && preset.po ? preset.po : '';
    moneyModal({
      mode: 'payment', tag: currentName(id) + (po ? ' · ' + po : ''), title: L('Enregistrer un paiement', 'Record a payment', 'سجّل أداء'), cta: L('Enregistrer le paiement', 'Save payment', 'سجّل الأداء'),
      owedCents: owed, amountCents: preset && preset.cents ? Math.min(preset.cents, owed || preset.cents) : owed, method: 'transfer',
      notePh: L('N° de chèque, référence du virement…', 'Cheque no., transfer reference…', 'رقم الشيك، مرجع التحويل…'),
      hint: L("Le paiement réduit ce que vous devez. Kiwi ne déplace pas d'argent : vous payez comme d'habitude, Kiwi tient le compte.", 'A payment reduces what you owe. Kiwi moves no money: you pay as usual, Kiwi keeps the books.', 'الأداء كينقص من الدين. Kiwi ما كيحرّك حتى درهم: نتا كتخلّص بحال العادة وKiwi كيحسب.'),
      async save(v) {
        if (!isReal()) { DEMO.post(id, 'out', v.cents, 'payment', v.method, v.note, v.date, po); if (po) DEMO.payPo(id, po, v.cents); }
        else await api('/api/suppliers/entry', { supplierId: id, type: 'payment', amountCents: v.cents, method: v.method, date: v.date, note: v.note, idemKey: v.idemKey, po });
        K.toast(L('Paiement enregistré', 'Payment recorded', 'تسجّل الأداء'), { type: 'success', desc: mad(v.cents) });
        if (S.view === 'supplier' && S.id === id) refreshDetail(); else { S.list = null; S.detail = null; }
      },
    });
  }

  async function billModal(id) {
    if (!id || !(await ensureDetail(id))) return;
    if (S.detail.supplier.archived) { K.toast(tr('supplier-archived'), { type: 'warning' }); return; }
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
    /* Champs montés avant la fenêtre : la fenêtre ne lit que des libellés traduits. */
    const fld = {
      name: f('name', L('Nom', 'Name', 'الاسم'), 'maxlength="120" required'),
      phone: f('phone', L('Téléphone (WhatsApp)', 'Phone (WhatsApp)', 'التيليفون (واتساب)'), 'inputmode="tel" maxlength="40" dir="ltr"'),
      email: f('email', L('E-mail', 'Email', 'الإيميل'), 'type="email" maxlength="120" dir="ltr"'),
      ice: f('ice', 'ICE', 'inputmode="numeric" maxlength="30" dir="ltr"'),
      terms: f('termsDays', L('Paiement à (jours)', 'Payment terms (days)', 'أجل الأداء (أيام)'), 'inputmode="numeric" maxlength="3"'),
      bank: f('bank', L('Banque', 'Bank', 'البنك'), 'maxlength="80"'),
      rib: f('rib', 'RIB', 'inputmode="numeric" maxlength="40" dir="ltr"'),
      address: f('address', L('Adresse', 'Address', 'العنوان'), 'maxlength="240"'),
    };
    const m = K.modal({
      title: row ? L('Modifier le fournisseur', 'Edit supplier', 'تعديل المورد') : L('Nouveau fournisseur', 'New supplier', 'مورد جديد'), width: 520,
      body: `<form class="sp-form" data-sp-sup novalidate>
        ${fld.name}
        <div class="two">${fld.phone}${fld.email}</div>
        <div class="two">${fld.ice}${fld.terms}</div>
        <div class="two">${fld.bank}${fld.rib}</div>
        ${fld.address}
        <label>${esc(L('Notes', 'Notes', 'ملاحظات'))}<textarea name="notes" rows="2" maxlength="500">${esc(s.notes || '')}</textarea></label>
        <div class="sp-foot"><button type="button" class="kb ghost" data-dismiss>${esc(L('Annuler', 'Cancel', 'إلغاء'))}</button><button type="submit" class="kb atlas">${esc(L('Enregistrer', 'Save', 'سجّل'))}</button></div>
      </form>`,
    });
    const form = m.el.querySelector('[data-sp-sup]');
    const key = 'sup-' + idem();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = {}; ['name', 'phone', 'email', 'ice', 'bank', 'rib', 'address', 'notes', 'termsDays'].forEach((k) => { v[k] = form[k].value.trim(); });
      if (!v.name) { K.toast(tr('name-required'), { type: 'warning' }); return; }
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
      } catch (err) { btn.disabled = false; K.toast(tr(err && err.code), { type: 'warning' }); }
    });
    setTimeout(() => { try { form.name.focus(); } catch (_) {} }, 60);
  }

  /* ── Relevé à envoyer : période, langue du fournisseur, impression, WhatsApp, CSV ── */
  function shopName() {
    try { const v = window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData(); if (v && v.name) return String(v.name); } catch (_) {}
    return '';
  }
  /* Le solde dit du côté du fournisseur : « nous vous devons ». */
  function balanceSentence(b, lg) {
    return b > 0 ? LX(lg, 'Nous vous devons', 'We owe you', 'باقي علينا ليكم') + ' ' + madX(lg, b)
      : b < 0 ? LX(lg, 'Vous nous devez', 'You owe us', 'باقي عليكم لينا') + ' ' + madX(lg, -b)
        : LX(lg, 'Compte soldé, rien ne reste dû.', 'Account settled, nothing is due.', 'الحساب مخلّص، ما باقي والو.');
  }
  function waPhone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 10 && d.startsWith('0')) d = '212' + d.slice(1);
    if (d.length === 9 && /^[5-7]/.test(d)) d = '212' + d;
    return d.length >= 11 ? d : '';
  }
  const periodText = (p, lg) => (p.from || p.to)
    ? LX(lg, 'du', 'from', 'من') + ' ' + dmy(p.from || '…') + ' ' + LX(lg, 'au', 'to', 'إلى') + ' ' + dmy(p.to || todayYmd())
    : LX(lg, 'au', 'as of', 'إلى غاية') + ' ' + dmy(todayYmd());

  async function periodDetail(id, p) {
    const keep = S.detail;
    const ok = await loadDetail(id, p);
    const got = S.detail;
    if (keep && keep.supplier && keep.supplier.id === id) S.detail = keep;
    return ok ? got : null;
  }
  function whatsappText(d, p, lg) {
    const s = d.supplier, st = d.statement || {}, lines = (st.lines || []).slice(-12);
    const closing = p.from || p.to ? st.closingCents : (d.balance && d.balance.balanceCents) || 0;
    return [
      LX(lg, 'Bonjour', 'Hello', 'السلام عليكم') + ' ' + s.name + ',',
      LX(lg, 'Voici notre relevé', 'Here is our statement', 'هادا كشف الحساب ديالنا') + ' ' + periodText(p, lg) + (shopName() ? ' (' + shopName() + ')' : '') + '.',
      '',
      ...(st.openingCents ? [LX(lg, 'Solde reporté', 'Brought forward', 'الرصيد المرحّل') + ' : ' + balanceSentence(st.openingCents, lg), ''] : []),
      ...lines.map((l) => `• ${dmy(l.date)} · ${theirSide(l, lg)}${l.poNumber || l.ref ? ' · ' + (l.poNumber || l.ref) : ''} · ${madX(lg, l.amountCents)}`),
      '',
      balanceSentence(closing, lg) + '.',
      LX(lg, 'Merci.', 'Thank you.', 'شكرا.'),
    ].join('\n');
  }
  function printHtml(d, p, lg) {
    const s = d.supplier, st = d.statement || {}, rtl = lg === 'ar';
    const closing = p.from || p.to ? st.closingCents : (d.balance && d.balance.balanceCents) || 0;
    const rows = (st.lines || []).map((l) => `<tr><td>${esc(dmy(l.date))}</td><td>${esc(theirSide(l, lg))}${l.poNumber || l.ref ? ' · ' + esc(l.poNumber || l.ref) : ''}${l.note ? `<small>${esc(l.note)}</small>` : ''}</td>
      <td class="n">${l.inCents ? esc(num(l.inCents / 100)) : ''}</td><td class="n">${l.outCents ? esc(num(l.outCents / 100)) : ''}</td><td class="n">${esc(num(l.runningCents / 100))}</td></tr>`).join('');
    return `<!doctype html><html lang="${esc(lg)}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(LX(lg, 'Relevé', 'Statement', 'كشف الحساب'))} ${esc(s.name)}</title>
<style>@page{margin:16mm}body{font-family:'Inter Tight',${rtl ? "'IBM Plex Sans Arabic'," : ''}system-ui,sans-serif;color:#0A0F0D;margin:0;font-size:12.5px}h1{font-size:19px;font-weight:600;margin:0 0 4px}p{margin:2px 0;color:#3a4440}
table{width:100%;border-collapse:collapse;margin-top:16px;font-variant-numeric:tabular-nums}th,td{padding:7px 6px;border-bottom:1px solid #ddd;text-align:start;vertical-align:top}th{font-weight:500;color:#6F6C65;font-size:11.5px}.n{text-align:end;white-space:nowrap}small{display:block;color:#6F6C65}
.bal{margin-top:16px;font-size:15px;font-weight:600}.head{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}</style></head><body>
<div class="head"><div><h1>${esc(LX(lg, 'Relevé de compte', 'Account statement', 'كشف الحساب'))} · ${esc(s.name)}</h1><p>${esc(periodText(p, lg))}</p>${s.ice ? `<p>ICE ${esc(s.ice)}</p>` : ''}</div><div><p><b>${esc(shopName())}</b></p><p>${esc(LX(lg, 'Montants en MAD', 'Amounts in MAD', 'المبالغ بالدرهم'))}</p></div></div>
<table><thead><tr><th>${esc(LX(lg, 'Date', 'Date', 'التاريخ'))}</th><th>${esc(LX(lg, 'Opération', 'Entry', 'العملية'))}</th><th class="n">${esc(LX(lg, 'Livré par vous', 'Delivered by you', 'سلّمتوه لينا'))}</th><th class="n">${esc(LX(lg, 'Payé ou rendu par nous', 'Paid or returned by us', 'خلّصناه ولا رجّعناه'))}</th><th class="n">${esc(LX(lg, 'Nous vous devons', 'We owe you', 'باقي علينا'))}</th></tr></thead><tbody>
${st.openingCents ? `<tr><td></td><td>${esc(LX(lg, 'Solde reporté', 'Brought forward', 'الرصيد المرحّل'))}</td><td></td><td></td><td class="n">${esc(num(st.openingCents / 100))}</td></tr>` : ''}${rows}</tbody></table>
<div class="bal">${esc(balanceSentence(closing, lg))}</div></body></html>`;
  }
  function csvOut(d, lg) {
    const head = [LX(lg, 'Date', 'Date', 'التاريخ'), LX(lg, 'Libellé', 'Description', 'البيان'), LX(lg, 'Reçu (MAD)', 'Received (MAD)', 'توصلت (درهم)'), LX(lg, 'Payé (MAD)', 'Paid (MAD)', 'خلّصت (درهم)'), LX(lg, 'Solde (MAD)', 'Balance (MAD)', 'الرصيد (درهم)')];
    const st = d.statement || {};
    const rows = [...(st.openingCents ? [['', LX(lg, 'Report', 'Brought forward', 'المرحّل'), '', '', num(st.openingCents / 100)]] : []),
      ...(st.lines || []).map((l) => [dmy(l.date), lineLabel(l, lg) + (l.note ? ' · ' + l.note : ''), l.inCents ? num(l.inCents / 100) : '', l.outCents ? num(l.outCents / 100) : '', num(l.runningCents / 100)])];
    const cell = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const blob = new Blob(['﻿' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'releve-' + d.supplier.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + todayYmd() + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  async function statementModal(id) {
    if (!(await ensureDetail(id))) return;
    let lg = lang();
    const first = todayYmd().slice(0, 8) + '01';
    const m = K.modal({
      tag: currentName(id), title: L('Relevé à envoyer', 'Statement to send', 'كشف للإرسال'), width: 500,
      body: `<form class="sp-form" data-sp-stm novalidate>
        <div class="two"><label>${esc(L('Du', 'From', 'من'))}<input type="date" name="from" max="${esc(todayYmd())}" value=""></label>
          <label>${esc(L('Au', 'To', 'إلى'))}<input type="date" name="to" max="${esc(todayYmd())}" value="${esc(todayYmd())}"></label></div>
        <div class="sp-bar"><button type="button" class="sp-link" data-sp-month>${esc(L('Ce mois', 'This month', 'هاد الشهر'))}</button><button type="button" class="sp-link" data-sp-allp>${esc(L('Tout l\'historique', 'Whole history', 'كل التاريخ'))}</button></div>
        <div><div style="font-size:12.5px;color:var(--n-600,#3a4440);margin-bottom:6px">${esc(L('Langue du fournisseur', "Supplier's language", 'لغة المورد'))}</div>${segHtml(lg, SEG.langs, SEG.lang)}</div>
        <p class="sp-hint">${esc(L('Le solde d\'avant la période est reporté en tête. Pour un PDF, choisissez « Enregistrer en PDF » dans la fenêtre d\'impression.', 'The balance before the period is carried forward at the top. For a PDF, pick "Save as PDF" in the print window.', 'الرصيد ديال قبل الفترة كيترحّل فالفوق. باش يكون PDF، ختار «حفظ كـ PDF» فنافذة الطبع.'))}</p>
        <div class="sp-foot"><button type="button" class="kb ghost sp-btn" data-sp-out="csv">${icon('csv')}${esc(L('CSV', 'CSV', 'CSV'))}</button><button type="button" class="kb ghost sp-btn" data-sp-out="wa">${icon('chat')}${esc(L('WhatsApp', 'WhatsApp', 'واتساب'))}</button><button type="button" class="kb atlas sp-btn" data-sp-out="print">${icon('print')}${esc(L('Imprimer ou PDF', 'Print or PDF', 'طبع ولا PDF'))}</button></div>
      </form>`,
    });
    const form = m.el.querySelector('[data-sp-stm]');
    wireSeg(form, '[data-sp-lang]', (k) => { lg = k; });
    form.addEventListener('click', async (e) => {
      if (e.target.closest('[data-sp-month]')) { form.from.value = first; form.to.value = todayYmd(); return; }
      if (e.target.closest('[data-sp-allp]')) { form.from.value = ''; form.to.value = todayYmd(); return; }
      const out = e.target.closest('[data-sp-out]');
      if (!out) return;
      const p = { from: form.from.value || '', to: form.to.value && form.to.value !== todayYmd() ? form.to.value : '' };
      if (p.from && p.to && p.from > p.to) { K.toast(L('La date de début vient après la date de fin.', 'The start date is after the end date.', 'تاريخ البداية من بعد تاريخ النهاية.'), { type: 'warning' }); return; }
      /* La fenêtre d'impression s'ouvre dans le geste (sinon bloquée), puis se remplit. */
      const w = out.dataset.spOut === 'print' ? window.open('', '_blank') : null;
      const d = await periodDetail(id, p);
      if (!d) { if (w) w.close(); return; }
      if (out.dataset.spOut === 'csv') csvOut(d, lg);
      else if (out.dataset.spOut === 'wa') {
        const phone = waPhone(d.supplier.phone);
        const url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(whatsappText(d, p, lg));
        const win = window.open(url, '_blank', 'noopener');
        if (!win) location.href = url;
        if (!phone) K.toast(L('Pas de téléphone sur la fiche : choisissez le contact dans WhatsApp.', 'No phone on file: pick the contact in WhatsApp.', 'ما كاينش تيليفون فالبطاقة: ختار الكونطاكت فواتساب.'), { type: 'info' });
      } else {
        if (!w) { K.toast(L('Autorisez les fenêtres pour imprimer.', 'Allow pop-ups to print.', 'سمح بالنوافذ باش تطبع.'), { type: 'warning' }); return; }
        w.document.open(); w.document.write(printHtml(d, p, lg)); w.document.close();
        setTimeout(() => { try { w.focus(); w.print(); } catch (_) {} }, 250);
      }
    });
  }

  /* ── Livre de caisse ───────────────────────────────────────────────── */
  async function loadCash() {
    if (!isReal()) { S.cash = DEMO.cash(); return; }
    try { S.cash = await api('/api/cashbook'); } catch (e) { S.cash = { balance: { balanceCents: 0 }, statement: { lines: [] } }; K.toast(tr(e.code), { type: 'warning' }); }
  }
  function cashBody() {
    const c = S.cash;
    if (!c) return `<div class="sp-card sp-empty">${esc(L('Chargement…', 'Loading…', 'كنجيبو…'))}</div>`;
    const lines = (c.statement && c.statement.lines) || [];
    return `<div class="sp-wrap">
      <div><button type="button" class="sp-link" data-action="sup-back">${icon('back', 'flip')}${esc(L('Tous les fournisseurs', 'All suppliers', 'جميع الموردين'))}</button></div>
      <div class="sp-card"><div class="sp-head"><div><div class="k" style="font-size:12px;color:var(--n-500,#667)">${esc(L('Solde du livre de caisse', 'Cash book balance', 'رصيد دفتر الصندوق'))}</div><div class="sp-big">${esc(mad(c.balance && c.balance.balanceCents))}</div>
        <p class="sp-hint">${esc(L("Ce que vous notez vous-même : apports, retraits, frais payés de votre poche. Les ventes de la caisse n'y sont pas recopiées.", 'What you note yourself: contributions, withdrawals, costs paid out of pocket. Till sales are not copied here.', 'اللي كتسجل بيدك: دخول وخروج الفلوس من جيبك. مبيعات الكاسة ما كتتنسخش هنا.'))}</p></div>
        <div class="sp-acts" style="margin-top:0"><button type="button" class="kb atlas sp-btn" data-action="sup-cash-add" data-arg="in">${icon('add')}${esc(L('Entrée', 'Money in', 'دخول'))}</button><button type="button" class="kb ghost sp-btn" data-action="sup-cash-add" data-arg="out">${icon('pay')}${esc(L('Sortie', 'Money out', 'خروج'))}</button></div></div></div>
      <div class="sp-card">${lines.length ? `<div class="sp-tablewrap"><table class="sp-table"><thead><tr><th>${esc(L('Date', 'Date', 'التاريخ'))}</th><th>${esc(L('Libellé', 'Description', 'البيان'))}</th><th class="num">${esc(L('Entrée', 'In', 'دخول'))}</th><th class="num">${esc(L('Sortie', 'Out', 'خروج'))}</th><th class="num">${esc(L('Solde', 'Balance', 'الرصيد'))}</th><th></th></tr></thead><tbody>
        ${lines.map((l) => `<tr><td>${esc(dmy(l.date))}</td><td class="lbl">${esc(l.note || methodLabel(l.method))}<small>${esc(methodLabel(l.method))}</small></td><td class="num">${l.inCents ? esc(mad(l.inCents)) : ''}</td><td class="num">${l.outCents ? esc(mad(l.outCents)) : ''}</td><td class="num">${esc(mad(l.runningCents))}</td>
          <td><button type="button" class="sp-void" data-action="sup-void" data-arg="${esc('cash:' + l.id)}">${esc(L('Annuler', 'Void', 'إلغاء'))}</button></td></tr>`).join('')}</tbody></table></div>
        <div class="sp-st">${lines.slice().reverse().map((l) => `<div class="sp-st-row"><div>${esc(l.note || methodLabel(l.method))}<small>${esc(dmy(l.date))} · ${esc(methodLabel(l.method))}</small></div><div><div class="amt">${l.direction === 'in' ? '+' : '−'}${esc(mad(l.amountCents))}</div><div class="run">${esc(mad(l.runningCents))}</div></div></div>`).join('')}</div>`
        : `<p class="sp-hint">${esc(L('Aucun mouvement pour le moment.', 'No entries yet.', 'حتى حركة دابا.'))}</p>`}</div></div>`;
  }

  /* ── Handlers (enregistrés d'un coup : LAZY_SECTIONS les compte) ───── */
  handlers['nav-fournisseurs'] = (_el, tab) => { S.list = null; showList(typeof tab === 'string' ? tab : S.tab); };
  handlers['sup-open'] = (_el, id) => openSupplier(String(id || ''));
  handlers['sup-back'] = () => showList();
  handlers['sup-tab'] = (_el, k) => {
    S.tab = ['owe', 'rank', 'inbox'].includes(k) ? k : 'owe';
    paint();
  };
  handlers['sup-sort'] = (_el, k) => {
    S.sort = ['owe', 'late', 'recent', 'name'].includes(k) ? k : 'owe';
    /* Basculer .on suffit : la lentille liquide fait glisser la pastille. */
    document.querySelectorAll('[data-action="sup-sort"]').forEach((b) => b.classList.toggle('on', b.dataset.arg === S.sort));
    const card = document.querySelector('.dash-genpage .sp-list');
    if (card) card.innerHTML = sorted((S.list && S.list.suppliers) || []).map(rowHtml).join('');
  };
  handlers['sup-new'] = () => supplierModal(null);
  handlers['sup-edit'] = async (_el, id) => { if (await ensureDetail(String(id || ''))) supplierModal(S.detail.supplier); };
  handlers['sup-archive'] = async (_el, id) => {
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
    } catch (e) { K.toast(tr(e.code), { type: 'warning' }); }
  };
  handlers['sup-restore'] = async (_el, id) => {
    id = String(id || '');
    try {
      if (!isReal()) DEMO.edit(id, { archived: false });
      else await api('/api/suppliers', { action: 'restore', id });
      K.toast(L('Fournisseur restauré', 'Supplier restored', 'ترجّع المورد'), { type: 'success' });
      refreshDetail();
    } catch (e) { K.toast(tr(e.code), { type: 'warning' }); }
  };
  handlers['sup-pay'] = (_el, id) => payModal(String(id || ''));
  handlers['sup-pay-po'] = (_el, arg) => {
    const [id, po, cents] = String(arg || '').split('|');
    payModal(id, { po: po || '', cents: Number(cents) || 0 });
  };
  handlers['sup-bill'] = (_el, id) => billModal(String(id || ''));
  handlers['sup-void'] = async (_el, arg) => {
    const raw = String(arg || ''), cash = raw.startsWith('cash:'), id = cash ? raw.slice(5) : raw;
    if (!window.confirm(L('Annuler cette ligne ? Elle sort du solde et reste dans l\'historique.', 'Void this entry? It leaves the balance and stays in the history.', 'نلغيو هاد السطر؟ غادي يخرج من الرصيد ويبقى فالتاريخ.'))) return;
    try {
      if (!isReal()) DEMO.void(id);
      else await api(cash ? '/api/cashbook' : '/api/suppliers/entry', { action: 'archive', id });
      K.toast(L('Ligne annulée', 'Entry voided', 'تلغى السطر'), { type: 'success' });
      refreshDetail();
    } catch (e) { K.toast(tr(e.code), { type: 'warning' }); }
  };
  handlers['sup-approve'] = async (_el, id) => {
    try {
      if (!isReal()) DEMO.approve(String(id || ''));
      else await api('/api/suppliers/entry', { action: 'approve', id: String(id || '') });
      K.toast(L('Ligne approuvée', 'Entry approved', 'توافق على السطر'), { type: 'success' });
      refreshDetail();
    } catch (e) { K.toast(tr(e.code), { type: 'warning' }); }
  };
  handlers['sup-approve-all'] = async (_el, sid) => {
    const one = typeof sid === 'string' && sid ? sid : '';
    try {
      let n = 0;
      if (!isReal()) { n = ((S.list && S.list.inbox) || (S.detail && S.detail.pending) || []).length; DEMO.approveAll(one); }
      else n = (await api('/api/suppliers/entry', one ? { action: 'approve-all', supplierId: one } : { action: 'approve-all' })).approved || 0;
      K.toast(L(pl(n, '1 ligne approuvée', `${n} lignes approuvées`), pl(n, '1 entry approved', `${n} entries approved`), arPl(n, 'توافق على سطر واحد', 'توافق على جوج سطور', `توافق على ${n} سطور`, `توافق على ${n} سطر`)), { type: 'success' });
      refreshDetail();
    } catch (e) { K.toast(tr(e.code), { type: 'warning' }); }
  };
  handlers['sup-attach'] = async (el, number) => {
    const box = el && el.closest ? el.closest('[data-sp-attach]') : null;
    const sel = box && box.querySelector('select');
    let sid = sel ? sel.value : '';
    const u = ((S.list && S.list.unlinked) || []).find((x) => x.number === number);
    if (!sid) { K.toast(L('Choisissez une fiche fournisseur.', 'Pick a supplier card.', 'ختار بطاقة مورد.'), { type: 'warning' }); return; }
    try {
      if (sid === '__new') {
        const name = (u && u.supplierName) || String(number || '');
        sid = isReal() ? (await api('/api/suppliers', { action: 'create', id: 'sup-' + idem(), supplier: { name } })).supplier.id : DEMO.add({ name }).id;
      }
      if (!isReal()) DEMO.attach(String(number || ''), sid);
      else await api('/api/suppliers/entry', { action: 'attach', po: String(number || ''), supplierId: sid });
      K.toast(L('Réception rattachée : elle compte dans le solde.', 'Receipt attached: it now counts in the balance.', 'الاستلام ترابط: دابا كيتحسب فالرصيد.'), { type: 'success' });
      S.list = null; showList('inbox');
    } catch (e) { K.toast(tr(e.code), { type: 'warning' }); }
  };
  handlers['sup-rank-open'] = (_el, id) => { if (handlers['sr-profile']) handlers['sr-profile'](null, String(id || '')); };
  /* Le classement prépare la commande ; ici, elle devient un vrai bon (create-po). */
  handlers['sup-make-po'] = async (_el, order) => {
    const o = order || {};
    if (!isReal()) { K.toast(L('En démonstration, le bon de commande n\'est pas créé.', 'In the demo, the purchase order is not created.', 'فالتجربة، أمر الشراء ما كيتصاوبش.'), { type: 'info' }); return null; }
    const ops = window.KiwiOperations;
    if (!ops || !ops.create) { K.toast(tr(''), { type: 'warning' }); return null; }
    try {
      const res = await ops.create('procurement', 'create-po', { supplierId: o.supplierId, supplier: o.name, lines: o.lines });
      const cmd = (res && res.command) || {};
      if (res && (res.offline || res.queued)) { K.toast(L('Hors ligne : le bon partira au retour du réseau.', 'Offline: the order will be sent when the network is back.', 'بلا ريزو: الأمر غادي يمشي ملي يرجع الريزو.'), { type: 'info' }); return null; }
      if (cmd.lastError || !cmd.result || !cmd.result.number) { K.toast(tr(cmd.lastError), { type: 'warning' }); return null; }
      S.detail = null;
      return { number: cmd.result.number };
    } catch (e) { K.toast(tr(e && e.code), { type: 'warning' }); return null; }
  };
  handlers['sup-statement'] = (_el, id) => statementModal(String(id || ''));
  /* Pour la page Dépenses : les cinq fournisseurs à qui l'on doit le plus. */
  handlers['sup-owed'] = async () => {
    if (!isReal()) return [];
    const j = await api('/api/suppliers');
    return ((j && j.suppliers) || []).filter((x) => x.balanceCents > 0).sort((a, b) => b.balanceCents - a.balanceCents).slice(0, 5);
  };
  handlers['sup-cashbook'] = async () => { S.view = 'cashbook'; S.cash = null; paint(); await loadCash(); if (S.view === 'cashbook') paint(); };
  handlers['sup-cash-add'] = (_el, dir) => {
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

  if (typeof window.addEventListener === 'function') window.addEventListener('kiwi:langchange', () => {
    if (document.body.classList.contains('page-genpage') && document.querySelector('.dash-genpage .sp-wrap, .dash-genpage .sp-card')) paint();
  });
})();
