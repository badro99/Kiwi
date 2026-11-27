/* Kiwi · IMPORT DE L'HISTORIQUE — l'écran (window.KiwiHistoryImport.mount)
 * ---------------------------------------------------------------------------
 * L'onglet « Importer » des ventes antérieures (assets/past-sales.js). On y
 * dépose ses fichiers Excel (.xlsx) ou CSV, plusieurs à la fois, de n'importe
 * quelle caisse : chaque feuille est lue dans le navigateur, son genre deviné
 * (tickets, détail des tickets, ventes par article, entrées et sorties,
 * services) et ses colonnes rattachées ; on corrige d'un menu ce qui a été mal
 * deviné, on voit ce qui va entrer et ce qui sera écarté, puis tout part en
 * envois découpés, avec une reprise si l'un échoue.
 *
 * Le moteur (engine.js) fait les calculs ; les routes /api/past-sales et
 * /api/past-cash refont toutes les vérifications. Rien ne part avant
 * « Importer ».
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const STR = {
    fr: {
      drop: 'Déposez ici vos fichiers Excel (.xlsx) ou CSV', dropSub: 'Tickets, détail des tickets, ventes par article, entrées et sorties de caisse, services. Plusieurs fichiers à la fois, de n’importe quelle caisse.',
      choose: 'Choisir des fichiers', paste: 'Ou collez des lignes copiées depuis Excel (avec la ligne des titres)', readPaste: 'Lire le collage', pasted: 'Collage',
      templates: 'Modèles :', reading: 'Lecture…', xls: 'Ce fichier est au vieux format .xls : ouvrez-le dans Excel et enregistrez-le en .xlsx ou .csv.', unreadable: 'Fichier illisible', empty: 'Aucune ligne dans ce fichier',
      kind: 'Ce fichier contient', kinds: { tickets: 'Des tickets (un par ligne)', lines: 'Le détail des tickets (articles)', items: 'Des ventes par article et par jour', moves: 'Des entrées et sorties de caisse', shifts: 'Des services (ouverture, fermeture)', skip: 'Rien à importer' },
      fields: { date: 'Date', time: 'Heure', ref: 'N° de ticket', total: 'Total', method: 'Paiement', type: 'Type (vente / remboursement)', status: 'Statut', name: 'Article', qty: 'Quantité', price: 'Prix unitaire', cat: 'Catégorie', amount: 'Montant', moveIn: 'Montant entré', moveOut: 'Montant sorti', moveType: 'Entrée ou sortie', reason: 'Motif', shift: 'N° de service', open: 'Ouverture', close: 'Fermeture', opening: 'Fond de caisse', paidIn: 'Total entré', paidOut: 'Total sorti', expected: 'Espèces attendues', counted: 'Espèces comptées', diff: 'Écart', cashier: 'Caissier' },
      none: 'Aucune colonne', rows: (n) => `${n} ligne(s)`, ready: 'Prêt', missing: (f) => `Colonne à choisir : ${f}`, remove: 'Retirer', col: (n) => `Colonne ${n}`,
      sum: 'Ce qui va entrer dans Kiwi', period: (a, b) => `Du ${a} au ${b}`, nTickets: (n, a) => `${n} ticket(s) · ${a}`, nItems: (n, a) => `${n} jour(s) de ventes par article · ${a}`,
      nShifts: (n) => `${n} service(s)`, nGap: (a) => `écart total ${a}`, nIn: (a) => `Entrées ${a}`, nOut: (a) => `Sorties ${a}`, nothing: 'Rien à importer pour l’instant.',
      itemMethod: 'Paiement des ventes par article', cash: 'Espèces', card: 'Carte', other: 'Non précisé',
      replaced: (n) => `${n} jour(s) déjà importé(s) seront remplacés.`, live: (n, d) => `${n} jour(s) déjà tenus sur Kiwi (à partir du ${d}) sont laissés de côté.`,
      future: (n) => `${n} jour(s) d’aujourd’hui ou futurs laissés de côté.`, old: (n) => `${n} jour(s) de plus de deux ans laissés de côté.`, heavy: (n) => `${n} jour(s) de plus de 1 000 tickets laissés de côté.`,
      refunds: (n, a) => `${n} remboursement(s) non importé(s) (${a}).`, cancelled: (n) => `${n} ticket(s) annulé(s) ignoré(s).`,
      issues: (n) => `${n} ligne(s) écartée(s)`, showIssues: 'Voir le détail', line: 'ligne',
      why: { badDate: 'date illisible', noRef: 'pas de n° de ticket', badTotal: 'total illisible', dupRef: 'n° de ticket en double', badOpen: 'heure d’ouverture illisible', badAmount: 'montant illisible', noMoveKind: 'ni entrée ni sortie', noName: 'article vide', badQty: 'quantité illisible', noPrice: 'pas de prix et absent de la carte', noDate: 'pas de date', itemsInTickets: 'ventes par article d’un jour déjà couvert par des tickets' },
      go: (a) => `Importer · ${a}`, goCash: 'Importer', sending: (i, n) => `Envoi ${i} sur ${n}…`, resume: 'Reprendre', done: 'Historique importé', doneDesc: (d) => `${d} jour(s). Les rapports se mettent à jour dans la minute.`,
      failed: (d, w) => `Envoi arrêté${d ? ' au ' + d : ''} : ${w}`, cashHist: 'Services et mouvements déjà importés', cashLine: (s, m) => `${s} service(s) · ${m} mouvement(s)`, delDay: 'Retirer', confirmDel: (d) => `Retirer les services et mouvements importés du ${d} ?`,
      err: { 'day-has-till-sales': 'ce jour est déjà tenu sur Kiwi', 'day-not-past': 'ce jour n’est pas passé', 'day-too-old': 'plus de deux ans', forbidden: 'réservé au propriétaire', offline: 'le serveur ne répond pas', 'ticket-day': 'l’heure d’un ticket tombe un autre jour', 'shift-open': 'ouverture de service invalide', 'shift-close': 'fermeture de service invalide', 'move-time': 'un mouvement tombe hors de son service' }, errGeneric: 'refusé par le serveur',
    },
    en: {
      drop: 'Drop your Excel (.xlsx) or CSV files here', dropSub: 'Receipts, receipt lines, sales by item, cash in and out, shifts. Several files at once, from any till.',
      choose: 'Choose files', paste: 'Or paste rows copied from Excel (with the header row)', readPaste: 'Read the paste', pasted: 'Paste',
      templates: 'Templates:', reading: 'Reading…', xls: 'This file is in the old .xls format: open it in Excel and save it as .xlsx or .csv.', unreadable: 'Unreadable file', empty: 'No rows in this file',
      kind: 'This file holds', kinds: { tickets: 'Receipts (one per row)', lines: 'Receipt lines (items)', items: 'Sales by item and day', moves: 'Cash in and out', shifts: 'Shifts (open, close)', skip: 'Nothing to import' },
      fields: { date: 'Date', time: 'Time', ref: 'Receipt no.', total: 'Total', method: 'Payment', type: 'Type (sale / refund)', status: 'Status', name: 'Item', qty: 'Quantity', price: 'Unit price', cat: 'Category', amount: 'Amount', moveIn: 'Amount in', moveOut: 'Amount out', moveType: 'In or out', reason: 'Reason', shift: 'Shift no.', open: 'Opening', close: 'Closing', opening: 'Starting cash', paidIn: 'Paid in', paidOut: 'Paid out', expected: 'Expected cash', counted: 'Counted cash', diff: 'Difference', cashier: 'Cashier' },
      none: 'No column', rows: (n) => `${n} row(s)`, ready: 'Ready', missing: (f) => `Pick a column: ${f}`, remove: 'Remove', col: (n) => `Column ${n}`,
      sum: 'What will go into Kiwi', period: (a, b) => `From ${a} to ${b}`, nTickets: (n, a) => `${n} receipt(s) · ${a}`, nItems: (n, a) => `${n} day(s) of sales by item · ${a}`,
      nShifts: (n) => `${n} shift(s)`, nGap: (a) => `total difference ${a}`, nIn: (a) => `Cash in ${a}`, nOut: (a) => `Cash out ${a}`, nothing: 'Nothing to import yet.',
      itemMethod: 'Payment for sales by item', cash: 'Cash', card: 'Card', other: 'Not specified',
      replaced: (n) => `${n} day(s) already imported will be replaced.`, live: (n, d) => `${n} day(s) already run on Kiwi (from ${d}) are left out.`,
      future: (n) => `${n} day(s) from today or later left out.`, old: (n) => `${n} day(s) older than two years left out.`, heavy: (n) => `${n} day(s) with more than 1,000 receipts left out.`,
      refunds: (n, a) => `${n} refund(s) not imported (${a}).`, cancelled: (n) => `${n} cancelled receipt(s) ignored.`,
      issues: (n) => `${n} row(s) left out`, showIssues: 'Show details', line: 'row',
      why: { badDate: 'unreadable date', noRef: 'no receipt number', badTotal: 'unreadable total', dupRef: 'duplicate receipt number', badOpen: 'unreadable opening time', badAmount: 'unreadable amount', noMoveKind: 'neither in nor out', noName: 'empty item', badQty: 'unreadable quantity', noPrice: 'no price and not on the menu', noDate: 'no date', itemsInTickets: 'sales by item for a day already covered by receipts' },
      go: (a) => `Import · ${a}`, goCash: 'Import', sending: (i, n) => `Sending ${i} of ${n}…`, resume: 'Resume', done: 'History imported', doneDesc: (d) => `${d} day(s). Reports update within a minute.`,
      failed: (d, w) => `Stopped${d ? ' at ' + d : ''}: ${w}`, cashHist: 'Shifts and cash moves already imported', cashLine: (s, m) => `${s} shift(s) · ${m} move(s)`, delDay: 'Remove', confirmDel: (d) => `Remove the imported shifts and cash moves of ${d}?`,
      err: { 'day-has-till-sales': 'this day already runs on Kiwi', 'day-not-past': 'this day has not passed', 'day-too-old': 'older than two years', forbidden: 'owner only', offline: 'the server is not answering', 'ticket-day': 'a receipt time falls on another day', 'shift-open': 'invalid shift opening', 'shift-close': 'invalid shift closing', 'move-time': 'a cash move falls outside its shift' }, errGeneric: 'refused by the server',
    },
    ar: {
      drop: 'ضع هنا ملفات Excel ‏(.xlsx) أو CSV', dropSub: 'التذاكر، تفاصيل التذاكر، المبيعات حسب الصنف، مداخيل ومصاريف الصندوق، الورديات. عدة ملفات مرة واحدة، ومن أي صندوق.',
      choose: 'اختر الملفات', paste: 'أو الصق أسطراً منسوخة من Excel (مع سطر العناوين)', readPaste: 'قراءة ما لُصق', pasted: 'لصق',
      templates: 'نماذج:', reading: 'جارٍ القراءة…', xls: 'هذا الملف بصيغة ‎.xls القديمة: افتحه في Excel واحفظه بصيغة ‎.xlsx أو ‎.csv.', unreadable: 'ملف غير مقروء', empty: 'لا أسطر في هذا الملف',
      kind: 'في هذا الملف', kinds: { tickets: 'تذاكر (تذكرة في كل سطر)', lines: 'تفاصيل التذاكر (الأصناف)', items: 'مبيعات حسب الصنف واليوم', moves: 'مداخيل ومصاريف الصندوق', shifts: 'ورديات (فتح وإغلاق)', skip: 'لا شيء للاستيراد' },
      fields: { date: 'التاريخ', time: 'الساعة', ref: 'رقم التذكرة', total: 'المجموع', method: 'الدفع', type: 'النوع (بيع / استرجاع)', status: 'الحالة', name: 'الصنف', qty: 'الكمية', price: 'ثمن الوحدة', cat: 'الفئة', amount: 'المبلغ', moveIn: 'المبلغ الداخل', moveOut: 'المبلغ الخارج', moveType: 'دخول أو خروج', reason: 'السبب', shift: 'رقم الوردية', open: 'الفتح', close: 'الإغلاق', opening: 'رصيد البداية', paidIn: 'مجموع الداخل', paidOut: 'مجموع الخارج', expected: 'النقد المتوقع', counted: 'النقد المعدود', diff: 'الفرق', cashier: 'الكاشير' },
      none: 'بدون عمود', rows: (n) => `${n} سطر`, ready: 'جاهز', missing: (f) => `اختر عموداً لـ: ${f}`, remove: 'حذف', col: (n) => `العمود ${n}`,
      sum: 'ما سيدخل إلى Kiwi', period: (a, b) => `من ${a} إلى ${b}`, nTickets: (n, a) => `${n} تذكرة · ${a}`, nItems: (n, a) => `${n} يوم من المبيعات حسب الصنف · ${a}`,
      nShifts: (n) => `${n} وردية`, nGap: (a) => `مجموع الفرق ${a}`, nIn: (a) => `الداخل ${a}`, nOut: (a) => `الخارج ${a}`, nothing: 'لا شيء للاستيراد بعد.',
      itemMethod: 'طريقة دفع المبيعات حسب الصنف', cash: 'نقداً', card: 'بطاقة', other: 'غير محدد',
      replaced: (n) => `${n} يوم سبق استيراده سيُعوَّض.`, live: (n, d) => `${n} يوم مسجّل أصلاً على Kiwi (ابتداءً من ${d}) تُرك جانباً.`,
      future: (n) => `${n} يوم من اليوم أو بعده تُرك جانباً.`, old: (n) => `${n} يوم أقدم من سنتين تُرك جانباً.`, heavy: (n) => `${n} يوم فيه أكثر من 1000 تذكرة تُرك جانباً.`,
      refunds: (n, a) => `${n} استرجاع لم يُستورد (${a}).`, cancelled: (n) => `${n} تذكرة ملغاة تم تجاهلها.`,
      issues: (n) => `${n} سطر مُستبعد`, showIssues: 'عرض التفاصيل', line: 'السطر',
      why: { badDate: 'تاريخ غير مقروء', noRef: 'بلا رقم تذكرة', badTotal: 'مجموع غير مقروء', dupRef: 'رقم تذكرة مكرر', badOpen: 'ساعة فتح غير مقروءة', badAmount: 'مبلغ غير مقروء', noMoveKind: 'لا دخول ولا خروج', noName: 'صنف فارغ', badQty: 'كمية غير مقروءة', noPrice: 'بلا سعر وغير موجود في القائمة', noDate: 'بلا تاريخ', itemsInTickets: 'مبيعات حسب الصنف ليوم تغطيه التذاكر' },
      go: (a) => `استيراد · ${a}`, goCash: 'استيراد', sending: (i, n) => `إرسال ${i} من ${n}…`, resume: 'متابعة', done: 'تم استيراد السجل', doneDesc: (d) => `${d} يوم. تتحدّث التقارير خلال دقيقة.`,
      failed: (d, w) => `توقف الإرسال${d ? ' عند ' + d : ''}: ${w}`, cashHist: 'الورديات والحركات المستوردة', cashLine: (s, m) => `${s} وردية · ${m} حركة`, delDay: 'حذف', confirmDel: (d) => `حذف الورديات والحركات المستوردة ليوم ${d}؟`,
      err: { 'day-has-till-sales': 'هذا اليوم مسجّل أصلاً على Kiwi', 'day-not-past': 'هذا اليوم لم يمضِ بعد', 'day-too-old': 'أقدم من سنتين', forbidden: 'خاص بصاحب المؤسسة', offline: 'الخادم لا يجيب', 'ticket-day': 'ساعة تذكرة تقع في يوم آخر', 'shift-open': 'فتح وردية غير صالح', 'shift-close': 'إغلاق وردية غير صالح', 'move-time': 'حركة نقدية خارج ورديتها' }, errGeneric: 'رفضه الخادم',
    },
  };
  const lang = () => { try { return (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr'; } catch (_) { return 'fr'; } };
  const S = () => STR[lang()] || STR.fr;
  const t = (k, ...a) => { const v = S()[k] != null ? S()[k] : STR.fr[k]; return typeof v === 'function' ? v(...a) : v; };
  const sub = (group, k) => ((S()[group] || {})[k]) || ((STR.fr[group] || {})[k]) || k;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmts = Object.create(null);
  const dayText = (iso) => {
    const l = lang() === 'en' ? 'en-GB' : lang() === 'ar' ? 'ar-MA' : 'fr-FR';
    const f = fmts[l] || (fmts[l] = new Intl.DateTimeFormat(l, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }));
    const ms = Date.parse(String(iso) + 'T12:00:00Z');
    return Number.isFinite(ms) ? f.format(ms) : String(iso || '');
  };
  const fmt = (c) => {
    const v = (c || 0) / 100;
    const unit = lang() === 'ar' ? 'درهم' : 'MAD';
    try { return (window.KiwiNumber ? window.KiwiNumber.format(v, { maximumFractionDigits: 2 }) : v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })) + ' ' + unit; } catch (_) { return v + ' ' + unit; }
  };
  const E = () => window.KiwiHistoryEngine;

  function css() {
    if (document.getElementById('khi-css')) return;
    const s = document.createElement('style'); s.id = 'khi-css';
    s.textContent = '.khi-drop{border:1.5px dashed var(--n-300,#c9c4b8);border-radius:14px;padding:18px;text-align:center;background:var(--n-50,#faf8f3);transition:border-color .15s,background .15s}'
      + '.khi-drop.on{border-color:var(--atlas,#0B6E4F);background:color-mix(in srgb,var(--atlas,#0B6E4F) 6%,transparent)}.khi-drop b{display:block;font-size:15px;margin-bottom:4px}'
      + '.khi-drop.small{padding:10px;text-align:start;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.khi-drop.small b{display:inline;margin:0;font-size:13px}'
      + '.khi-sub{font-size:12.5px;color:var(--n-600,#555);line-height:1.5;margin:4px 0 10px}.khi-tpl{font-size:12px;color:var(--n-600,#555);margin-top:8px}.khi-tpl button{border:0;background:none;color:var(--atlas,#0B6E4F);font:inherit;font-weight:600;cursor:pointer;padding:2px 4px}'
      + '.khi-card{border:1px solid var(--n-200,#dcd8cf);border-radius:12px;padding:12px;margin-top:10px}.khi-card h5{margin:0;font-size:13px;display:flex;gap:8px;align-items:center;justify-content:space-between}'
      + '.khi-chip{font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;background:color-mix(in srgb,var(--atlas,#0B6E4F) 12%,transparent);color:var(--atlas,#0B6E4F)}.khi-chip.bad{background:color-mix(in srgb,var(--danger,#cb5238) 12%,transparent);color:var(--danger,#cb5238)}'
      + '.khi-map{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:10px}.khi-map label,.khi-kind{display:flex;flex-direction:column;gap:3px;font-size:11.5px;color:var(--n-600,#555)}'
      + '.khi-map select,.khi-kind select,.khi-meth select{font:inherit;font-size:13px;padding:6px 8px;border:1px solid var(--n-200,#dcd8cf);border-radius:8px;background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D)}.khi-req::after{content:" *";color:var(--danger,#cb5238)}'
      + '.khi-prev{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px}.khi-prev th,.khi-prev td{padding:4px 6px;border-top:1px solid var(--n-100,#eceae4);text-align:start;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis}.khi-prev th{color:var(--n-600,#555);font-weight:600}'
      + '.khi-scroll{overflow:auto}.khi-sum{margin-top:14px;padding:14px;border-radius:12px;background:var(--n-100,#eceae4)}.khi-sum h4{margin:0 0 8px;font-size:13px}.khi-sum ul{margin:0;padding-inline-start:18px;font-size:13.5px;line-height:1.7}'
      + '.khi-note{font-size:12.5px;color:var(--n-600,#555);line-height:1.5;margin:6px 0 0}.khi-bad{color:var(--danger,#cb5238)}.khi-bar{height:6px;border-radius:99px;background:var(--n-200,#dcd8cf);overflow:hidden;margin-top:10px}.khi-bar i{display:block;height:100%;background:var(--atlas,#0B6E4F);transition:width .2s}'
      + '.khi-go{width:100%;justify-content:center;padding:12px;font-size:15px;margin-top:12px}.khi-link{border:0;background:none;color:var(--atlas,#0B6E4F);font:inherit;font-weight:600;cursor:pointer;padding:2px 6px}'
      + '.khi-paste{width:100%;min-height:90px;font-family:"JetBrains Mono",monospace;font-size:12px;box-sizing:border-box;padding:8px;border:1px solid var(--n-200,#dcd8cf);border-radius:9px;background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D);margin-top:6px}'
      + '.khi-meth{display:flex;gap:8px;align-items:center;font-size:12.5px;margin-top:8px}.khi-hist{margin-top:16px}.khi-hist h4{margin:0 0 6px;font-size:13px}.khi-hist table{width:100%;border-collapse:collapse;font-size:13px}.khi-hist td{padding:5px 6px;border-top:1px solid var(--n-100,#eceae4)}';
    document.head.appendChild(s);
  }

  /* ───────────── lecture des fichiers ───────────── */
  async function readFile(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const name = String(file.name || 'fichier');
    if (buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0) return { error: t('xls'), name };
    if (buf[0] === 0x50 && buf[1] === 0x4B) {
      const X = window.KiwiXlsx;
      if (!X) return { error: t('unreadable'), name };
      const first = await X.read(buf, { rows: 100001, sheet: 0 });
      const sheets = [{ title: first.sheets && first.sheets.length > 1 ? name + ' · ' + first.sheet : name, rows: first.rows }];
      for (let i = 1; i < (first.sheets || []).length; i++) {
        const r = await X.read(buf, { rows: 100001, sheet: i });
        sheets.push({ title: name + ' · ' + r.sheet, rows: r.rows });
      }
      return { name, sheets };
    }
    const C = window.KiwiCatalogImport;
    const text = C && C._decode ? C._decode(buf) : new TextDecoder().decode(buf);
    return { name, sheets: [{ title: name, rows: textRows(text) }] };
  }
  function textRows(text) {
    const C = window.KiwiCatalogImport;
    const p = C && C.parse ? C.parse(text) : { ok: false };
    return p.ok ? [p.headerRaw].concat(p.rows) : [];
  }

  /* ───────────── l'écran ───────────── */
  let seq = 0;
  function mount(rootEl, ctx) {
    css();
    const st = ctx.state || (ctx.state = { sources: [], errors: [], itemMethod: 'other', cash: null, sending: null, showIssues: false });
    const sales = () => ctx.salesInfo() || {};
    const engineCtx = () => {
      const i = sales(), c = st.cash || {};
      return {
        menu: ctx.menu || [], cutoff: i.cutoff != null ? i.cutoff : c.cutoff, today: i.today || c.today,
        firstSaleDay: i.firstTillDay || '', firstCashDay: c.firstLiveDay || i.firstTillDay || '',
        salesDays: (i.days || []).map((d) => d.day), cashDays: ((c.days) || []).map((d) => d.day),
      };
    };
    const ready = (s) => s.kind !== 'skip' && !E().missing(s.kind, s.map).length;
    const plan = () => E().build(st.sources.filter(ready), engineCtx());

    function sourceHtml(s) {
      const header = (s.rows[s.headerRow] || []).map((h, i) => String(h == null ? '' : h).trim() || t('col', i + 1));
      const miss = s.kind === 'skip' ? [] : E().missing(s.kind, s.map);
      const chip = s.kind === 'skip' ? '' : miss.length ? '<span class="khi-chip bad">' + esc(t('missing', miss.map((f) => sub('fields', f)).join(', '))) + '</span>' : '<span class="khi-chip">' + esc(t('ready')) + '</span>';
      const kinds = ['tickets', 'lines', 'items', 'moves', 'shifts', 'skip'].map((k) => '<option value="' + k + '"' + (k === s.kind ? ' selected' : '') + '>' + esc(sub('kinds', k)) + '</option>').join('');
      let out = '<div class="khi-card" data-khi-src="' + s.id + '"><h5><span>' + esc(s.title) + ' · <span style="font-weight:400;color:var(--n-600,#555)">' + esc(t('rows', Math.max(0, s.rows.length - s.headerRow - 1))) + '</span></span><span>' + chip + ' <button class="khi-link" type="button" data-khi-remove="' + s.id + '">' + esc(t('remove')) + '</button></span></h5>'
        + '<label class="khi-kind" style="margin-top:8px">' + esc(t('kind')) + '<select data-khi-kind="' + s.id + '">' + kinds + '</select></label>';
      if (s.kind === 'skip') return out + '</div>';
      const fields = E().fieldsOf(s.kind);
      /* Dans un fichier de services, le numéro est celui du service. */
      const label = (field) => sub('fields', s.kind === 'shifts' && field === 'ref' ? 'shift' : field);
      out += '<div class="khi-map">' + fields.map(({ field, required }) => {
        const opts = '<option value="-1">' + esc(t('none')) + '</option>' + header.map((h, i) => '<option value="' + i + '"' + (s.map[field] === i ? ' selected' : '') + '>' + esc(h) + '</option>').join('');
        return '<label><span class="' + (required ? 'khi-req' : '') + '">' + esc(label(field)) + '</span><select data-khi-map="' + s.id + '" data-f="' + field + '">' + opts + '</select></label>';
      }).join('') + '</div>';
      const used = fields.filter((f) => s.map[f.field] != null && s.map[f.field] >= 0);
      const sample = s.rows.slice(s.headerRow + 1, s.headerRow + 4);
      if (used.length && sample.length) {
        out += '<div class="khi-scroll"><table class="khi-prev"><thead><tr>' + used.map((f) => '<th>' + esc(label(f.field)) + '</th>').join('') + '</tr></thead><tbody>'
          + sample.map((r) => '<tr>' + used.map((f) => '<td>' + esc(cellText(r[s.map[f.field]], f.field)) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
      }
      return out + '</div>';
    }
    /* Un numéro de série Excel dans une colonne de date se montre en date. */
    function cellText(v, field) {
      if (typeof v === 'number' && /^(date|open|close)$/.test(field)) {
        const dt = E().parseDateTime(v);
        if (dt) return dayText(dt.day) + (dt.time ? ' ' + dt.time : '');
      }
      if (typeof v === 'number' && field === 'time') return E().parseTime(v);
      return v == null ? '' : String(v);
    }
    function summaryHtml(p) {
      const s = p.stats;
      const items = [];
      if (s.tickets) items.push(t('nTickets', s.tickets, fmt(s.ticketCents)));
      if (s.itemDays) items.push(t('nItems', s.itemDays, fmt(s.itemCents)));
      if (s.shifts) items.push(t('nShifts', s.shifts) + (s.gapCents ? ' · ' + t('nGap', fmt(s.gapCents)) : ''));
      if (s.inCents) items.push(t('nIn', fmt(s.inCents)));
      if (s.outCents) items.push(t('nOut', fmt(s.outCents)));
      let out = '<div class="khi-sum"><h4>' + esc(t('sum')) + (s.from ? ' · ' + esc(t('period', dayText(s.from), dayText(s.to))) : '') + '</h4>';
      out += items.length ? '<ul>' + items.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '<p class="khi-note">' + esc(t('nothing')) + '</p>';
      if (s.itemDays) {
        out += '<div class="khi-meth">' + esc(t('itemMethod')) + ' <select data-khi-meth>' + ['other', 'cash', 'card'].map((k) => '<option value="' + k + '"' + (st.itemMethod === k ? ' selected' : '') + '>' + esc(t(k)) + '</option>').join('') + '</select></div>';
      }
      const notes = [];
      if (s.replaced) notes.push(t('replaced', s.replaced));
      const ec = engineCtx();
      if (p.blocked.live) notes.push(t('live', p.blocked.live, dayText(ec.firstCashDay && (!ec.firstSaleDay || ec.firstCashDay < ec.firstSaleDay) ? ec.firstCashDay : ec.firstSaleDay)));
      if (p.blocked.future) notes.push(t('future', p.blocked.future));
      if (p.blocked.old) notes.push(t('old', p.blocked.old));
      if (p.blocked.heavy) notes.push(t('heavy', p.blocked.heavy));
      if (p.refunds.n) notes.push(t('refunds', p.refunds.n, fmt(p.refunds.cents)));
      if (p.cancelled) notes.push(t('cancelled', p.cancelled));
      out += notes.map((n) => '<p class="khi-note">' + esc(n) + '</p>').join('');
      const rowIssues = p.issues.filter((x) => x.line);
      const general = p.issues.filter((x) => !x.line);
      general.forEach((g) => { out += '<p class="khi-note khi-bad">' + esc(g.detail + ' · ' + sub('why', g.why)) + '</p>'; });
      if (rowIssues.length) {
        out += '<p class="khi-note khi-bad">' + esc(t('issues', rowIssues.length)) + ' <button class="khi-link" type="button" data-khi-issues>' + esc(t('showIssues')) + '</button></p>';
        if (st.showIssues) out += '<div class="khi-scroll" style="max-height:20vh"><table class="khi-prev"><tbody>' + rowIssues.slice(0, 200).map((x) => '<tr><td>' + esc(x.file) + '</td><td>' + esc(t('line') + ' ' + x.line) + '</td><td>' + esc(sub('why', x.why)) + '</td><td>' + esc(x.detail) + '</td></tr>').join('') + '</tbody></table></div>';
      }
      return out + '</div>';
    }
    function cashHistHtml() {
      const days = (st.cash && st.cash.days) || [];
      if (!days.length) return '';
      return '<div class="khi-hist"><h4>' + esc(t('cashHist')) + '</h4><div class="khi-scroll" style="max-height:20vh"><table><tbody>' + days.map((d) => '<tr><td>' + esc(dayText(d.day)) + '</td><td>' + esc(t('cashLine', d.shifts, d.moves)) + '</td><td style="text-align:end">' + esc(t('nIn', fmt(d.inCents))) + ' · ' + esc(t('nOut', fmt(d.outCents))) + '</td><td style="text-align:end"><button class="khi-link khi-bad" type="button" data-khi-delcash="' + esc(d.day) + '">' + esc(t('delDay')) + '</button></td></tr>').join('') + '</tbody></table></div></div>';
    }
    function render() {
      const small = st.sources.length > 0;
      let out = '<div class="khi-drop' + (small ? ' small' : '') + '" data-khi-drop><b>' + esc(t('drop')) + '</b>'
        + (small ? '' : '<p class="khi-sub">' + esc(t('dropSub')) + '</p>')
        + '<button class="kb" type="button" data-khi-pick>' + esc(t('choose')) + '</button><input type="file" hidden multiple accept=".xlsx,.xlsm,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain" data-khi-file>'
        + (small ? '' : '<div class="khi-tpl">' + esc(t('templates')) + ' ' + ['tickets', 'lines', 'items', 'moves', 'shifts'].map((k) => '<button type="button" data-khi-tpl="' + k + '">' + esc(sub('kinds', k)) + '</button>').join(' · ') + '</div>')
        + '</div>';
      if (!small) out += '<details style="margin-top:8px"><summary class="khi-note" style="cursor:pointer">' + esc(t('paste')) + '</summary><textarea class="khi-paste" data-khi-paste></textarea><button class="kb" type="button" data-khi-readpaste style="margin-top:6px">' + esc(t('readPaste')) + '</button></details>';
      if (st.reading) out += '<p class="khi-note">' + esc(t('reading')) + '</p>';
      st.errors.forEach((e) => { out += '<p class="khi-note khi-bad">' + esc(e.name + ' : ' + e.error) + '</p>'; });
      out += st.sources.map(sourceHtml).join('');
      if (small) {
        const p = plan();
        out += summaryHtml(p);
        const total = p.stats.salesCents;
        const can = p.tickets.length + p.items.length + p.cash.length > 0;
        if (st.sending) {
          const s = st.sending;
          out += '<div class="khi-bar"><i style="width:' + Math.round((s.done / Math.max(1, s.chunks.length)) * 100) + '%"></i></div>';
          out += s.error ? '<p class="khi-note khi-bad">' + esc(s.error) + '</p><button class="kb atlas khi-go" type="button" data-khi-resume>' + esc(t('resume')) + '</button>'
            : '<p class="khi-note">' + esc(t('sending', Math.min(s.done + 1, s.chunks.length), s.chunks.length)) + '</p>';
        } else {
          out += '<button class="kb atlas khi-go" type="button" data-khi-go' + (can ? '' : ' disabled style="opacity:.5"') + '>' + esc(total ? t('go', fmt(total)) : t('goCash')) + '</button>';
        }
      }
      out += cashHistHtml();
      rootEl.innerHTML = out;
    }

    async function addFiles(files) {
      st.reading = true; render();
      for (const f of files) {
        try {
          const r = await readFile(f);
          if (r.error) { st.errors.push({ name: r.name, error: r.error }); continue; }
          r.sheets.forEach((sh) => addRows(sh.title, sh.rows));
        } catch (e) {
          st.errors.push({ name: String(f.name || ''), error: e && /too-many-rows|too-big/.test(e.message) ? t('unreadable') + ' (' + e.message + ')' : t('unreadable') });
        }
      }
      st.reading = false; render();
    }
    function addRows(title, rows) {
      if (!rows || rows.filter((r) => r && r.some((c) => String(c == null ? '' : c).trim() !== '')).length < 2) { st.errors.push({ name: title, error: t('empty') }); return; }
      const d = E().detect(rows);
      st.sources.push({ id: 's' + (++seq), title, rows, headerRow: d.headerRow, kind: d.score > -5 ? d.kind : 'skip', map: d.map || {} });
    }

    function errText(r) {
      const d = (r && r.data) || {};
      if (!r || !r.status) return sub('err', 'offline');
      if (r.status === 403) return sub('err', 'forbidden');
      const w = (S().err || {})[d.error] || STR.fr.err[d.error] || t('errGeneric') + (d.error ? ' (' + d.error + ')' : '');
      return w + (d.ref ? ' · ' + d.ref : '') + (d.name ? ' · ' + d.name : '');
    }
    async function post(url, body) {
      try {
        const res = await fetch(url, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(Object.assign({ merchant: ctx.merchant() }, body)) });
        let data = null; try { data = await res.json(); } catch (_) {}
        return { status: res.status, data: data || {} };
      } catch (_) { return { status: 0, data: {} }; }
    }
    function sendChunk(c) {
      if (c.kind === 'tickets') return post('/api/past-sales', { kind: 'tickets', days: c.days });
      if (c.kind === 'items') return post('/api/past-sales', { method: st.itemMethod, days: c.days });
      return post('/api/past-cash', { days: c.days });
    }
    async function run() {
      const s = st.sending;
      s.error = '';
      render();
      while (s.done < s.chunks.length) {
        const c = s.chunks[s.done];
        const r = await sendChunk(c);
        if (r.status !== 200) {
          s.error = t('failed', r.data && r.data.day ? dayText(r.data.day) : dayText(c.days[0].day), errText(r));
          render();
          return;
        }
        s.done++;
        render();
      }
      const days = new Set(s.chunks.flatMap((c) => c.days.map((d) => d.day))).size;
      try { window.Kiwi.toast(t('done'), { type: 'success', desc: t('doneDesc', days) }); } catch (_) {}
      st.sources = []; st.errors = []; st.sending = null;
      await loadCash();
      if (ctx.onDone) await ctx.onDone();
      render();
    }
    async function loadCash() {
      try {
        const res = await fetch('/api/past-cash?merchant=' + encodeURIComponent(ctx.merchant()), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
        if (res.ok) st.cash = await res.json();
      } catch (_) { /* sans l'historique de caisse, l'import reste possible : le serveur revérifie */ }
    }
    function template(kind) {
      const ex = (ctx.menu || []).slice(0, 2);
      const a = ex[0] || { name: 'Burger', price: 50 }, b = ex[1] || { name: 'Coca', price: 12 };
      const rows = {
        tickets: [['N° ticket', 'Date', 'Heure', 'Total', 'Paiement'], ['1001', '14/03/2026', '12:31', a.price * 2, 'Espèces'], ['1002', '14/03/2026', '12:48', b.price, 'Carte']],
        lines: [['N° ticket', 'Date', 'Article', 'Quantité', 'Prix'], ['1001', '14/03/2026', a.name, 2, a.price], ['1002', '14/03/2026', b.name, 1, b.price]],
        items: [['Date', 'Article', 'Quantité', 'Prix'], ['14/03/2026', a.name, 25, a.price], ['14/03/2026', b.name, 40, b.price]],
        moves: [['Date', 'Heure', 'Type', 'Montant', 'Motif'], ['14/03/2026', '10:05', 'Sortie', 120, 'Butane'], ['14/03/2026', '18:20', 'Entrée', 200, 'Monnaie']],
        shifts: [['Service', 'Ouverture', 'Fermeture', 'Fond de caisse', 'Attendu', 'Compté'], ['1', '14/03/2026 09:00', '14/03/2026 23:30', 500, 3480, 3460]],
      }[kind];
      const X = window.KiwiXlsx;
      let blob, ext;
      if (X && X.write) { blob = new Blob([X.write(rows, { sheet: sub('kinds', kind).slice(0, 30) })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); ext = 'xlsx'; }
      else {
        const cell = (v) => { let c = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(c)) c = "'" + c; return /[",\n;]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; };
        blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\n') + '\n'], { type: 'text/csv;charset=utf-8' }); ext = 'csv';
      }
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'kiwi-modele-' + kind + '.' + ext;
      document.body.appendChild(link); link.click(); link.remove();
    }

    rootEl.onclick = async (e) => {
      const el = e.target;
      if (el.closest('[data-khi-pick]')) { rootEl.querySelector('[data-khi-file]').click(); return; }
      const tpl = el.closest('[data-khi-tpl]'); if (tpl) { template(tpl.getAttribute('data-khi-tpl')); return; }
      if (el.closest('[data-khi-readpaste]')) { const v = rootEl.querySelector('[data-khi-paste]').value; addRows(t('pasted'), textRows(v)); render(); return; }
      const rm = el.closest('[data-khi-remove]'); if (rm) { st.sources = st.sources.filter((s) => s.id !== rm.getAttribute('data-khi-remove')); render(); return; }
      if (el.closest('[data-khi-issues]')) { st.showIssues = !st.showIssues; render(); return; }
      if (el.closest('[data-khi-go]')) {
        const chunks = E().chunks(plan());
        if (!chunks.length) return;
        st.sending = { chunks, done: 0, error: '' };
        await run(); return;
      }
      if (el.closest('[data-khi-resume]')) { await run(); return; }
      const del = el.closest('[data-khi-delcash]');
      if (del) {
        const day = del.getAttribute('data-khi-delcash');
        if (!window.confirm(t('confirmDel', dayText(day)))) return;
        const r = await post('/api/past-cash', { days: [{ day, shifts: [], moves: [] }] });
        if (r.status !== 200) { try { window.Kiwi.toast(errText(r), { type: 'error' }); } catch (_) {} return; }
        await loadCash(); render();
      }
    };
    rootEl.onchange = (e) => {
      const el = e.target;
      if (el.matches('[data-khi-file]') && el.files && el.files.length) { addFiles([...el.files]); el.value = ''; return; }
      const src = (id) => st.sources.find((s) => s.id === id);
      if (el.matches('[data-khi-kind]')) {
        const s = src(el.getAttribute('data-khi-kind'));
        if (s) { s.kind = el.value; s.map = s.kind === 'skip' ? {} : E().mapColumns((s.rows[s.headerRow] || []).map((c) => String(c == null ? '' : c)), s.kind); }
        render(); return;
      }
      if (el.matches('[data-khi-map]')) {
        const s = src(el.getAttribute('data-khi-map'));
        if (s) { const v = +el.value; if (v >= 0) s.map[el.getAttribute('data-f')] = v; else delete s.map[el.getAttribute('data-f')]; }
        render(); return;
      }
      if (el.matches('[data-khi-meth]')) st.itemMethod = el.value;
    };
    rootEl.ondragover = (e) => { const z = e.target.closest && e.target.closest('[data-khi-drop]'); if (!z) return; e.preventDefault(); z.classList.add('on'); };
    rootEl.ondragleave = (e) => { const z = e.target.closest && e.target.closest('[data-khi-drop]'); if (z) z.classList.remove('on'); };
    rootEl.ondrop = (e) => {
      const z = e.target.closest && e.target.closest('[data-khi-drop]');
      if (!z) return;
      e.preventDefault(); z.classList.remove('on');
      const files = e.dataTransfer && e.dataTransfer.files ? [...e.dataTransfer.files] : [];
      if (files.length) addFiles(files);
    };
    render();
    if (!st.cash) loadCash().then(render);
    return { render, addRows, state: st };
  }

  window.KiwiHistoryImport = { mount, get engine() { return window.KiwiHistoryEngine; } };
})();
