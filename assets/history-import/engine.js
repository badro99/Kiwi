/* Kiwi · IMPORT DE L'HISTORIQUE — le moteur (window.KiwiHistoryEngine)
 * ---------------------------------------------------------------------------
 * Jon's Burgers, 27 nov. 2026 : « nos anciennes données sont dans Excel :
 * tickets, entrées et sorties de caisse, services ». Tout commerçant qui arrive
 * d'une autre caisse a les mêmes fichiers, avec d'autres noms de colonnes.
 *
 * Ce fichier ne touche ni l'écran ni le réseau : des tableaux (lignes de
 * cellules, telles qu'un .xlsx ou un CSV les donne) entrent, un plan sort.
 *
 *   detect(rows)          → { headerRow, kind, map }  la ligne d'en-tête (pas
 *                           forcément la première : un titre de rapport la
 *                           précède souvent), le genre de fichier, et pour
 *                           chaque champ la colonne qui le porte ;
 *   build(sources, ctx)   → le plan : tickets par jour, ventes par article par
 *                           jour, services et mouvements par jour, et la liste
 *                           de ce qui a été écarté, ligne par ligne, avec sa
 *                           raison ;
 *   chunks(plan)          → les envois, à la taille que les routes acceptent.
 *
 * Cinq genres de fichiers :
 *   tickets  un ticket par ligne : numéro, date (et heure), total, paiement ;
 *   lines    le détail des tickets : numéro, article, quantité, prix ou total.
 *            Avec un fichier tickets, les articles s'y rattachent par numéro ;
 *            seul, il reconstruit les tickets ;
 *   items    des ventes par article et par jour, sans numéro de ticket ;
 *   moves    entrées et sorties d'espèces (pay in / pay out) ;
 *   shifts   les services : ouverture, fermeture, fond, attendu, compté, écart.
 *
 * Les montants sont des centimes entiers dès la lecture ; une virgule seule est
 * une décimale (Excel en français écrit « 1,5 ») ; un nombre d'un .xlsx dans
 * une colonne de date est un numéro de série Excel.
 * ─────────────────────────────────────────────────────────────────────────── */
(function (root) {
  'use strict';

  /* ───────────── normalisation ───────────── */
  const key = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '_').replace(/^_+|_+$/g, '');
  const norm = (s) => key(s).replace(/_/g, ' ');

  /* Les noms qu'on rencontre : exports Loyverse, Square, Zettle, SumUp, caisses
     marocaines, tableurs faits main en français, anglais, arabe. */
  const SYN = {
    date: ['date', 'jour', 'day', 'date_heure', 'date_et_heure', 'datetime', 'date_time', 'created_at', 'date_du_ticket', 'date_de_vente', 'date_vente', 'sale_date', 'transaction_date', 'date_operation', 'التاريخ'],
    time: ['heure', 'time', 'hour', 'heure_de_vente', 'heure_vente', 'الساعة', 'الوقت'],
    ref: ['numero_de_ticket', 'n_ticket', 'no_ticket', 'num_ticket', 'ticket', 'ticket_no', 'ticket_number', 'numero_ticket', 'receipt_number', 'receipt_no', 'receipt', 'n_recu', 'recu', 'numero_du_recu', 'numero', 'num', 'no', 'n', 'ref', 'reference', 'facture', 'n_facture', 'invoice', 'order', 'order_id', 'order_number', 'commande', 'n_commande', 'transaction_id', 'id', 'رقم_التذكرة', 'رقم'],
    total: ['total', 'total_ttc', 'montant', 'montant_ttc', 'total_collected', 'total_encaisse', 'net_sales', 'ventes_nettes', 'ca', 'chiffre_d_affaires', 'amount', 'total_amount', 'grand_total', 'total_mad', 'montant_mad', 'prix_total', 'total_ligne', 'line_total', 'gross_sales', 'ventes_brutes', 'المجموع', 'المبلغ'],
    method: ['paiement', 'mode_de_paiement', 'mode_paiement', 'payment_type', 'payment_method', 'payment', 'moyen_de_paiement', 'reglement', 'mode_de_reglement', 'type_de_paiement', 'tender', 'طريقة_الدفع', 'الدفع'],
    type: ['receipt_type', 'type_de_ticket', 'type_de_recu', 'type', 'transaction_type', 'nature'],
    status: ['status', 'statut', 'etat', 'state', 'الحالة'],
    name: ['article', 'produit', 'plat', 'nom', 'name', 'item', 'item_name', 'designation', 'libelle', 'product', 'product_name', 'description_article', 'الصنف', 'المنتج'],
    qty: ['quantite', 'qte', 'qty', 'quantity', 'nombre', 'nb', 'vendus', 'ventes', 'items_sold', 'الكمية'],
    price: ['prix', 'prix_unitaire', 'pu', 'price', 'unit_price', 'prix_mad', 'prix_de_vente', 'item_price', 'السعر'],
    cat: ['categorie', 'category', 'famille', 'rayon', 'الفئة'],
    amount: ['montant', 'amount', 'somme', 'valeur', 'total', 'المبلغ'],
    moveIn: ['entree', 'entrees', 'pay_in', 'paid_in', 'cash_in', 'apport', 'apports', 'encaissement', 'دخول'],
    moveOut: ['sortie', 'sorties', 'pay_out', 'paid_out', 'cash_out', 'retrait', 'retraits', 'depense', 'depenses', 'decaissement', 'خروج', 'مصاريف'],
    moveType: ['type', 'sens', 'operation', 'mouvement', 'kind', 'entree_sortie', 'in_out', 'type_de_mouvement', 'النوع'],
    reason: ['motif', 'raison', 'commentaire', 'comment', 'description', 'note', 'notes', 'libelle', 'objet', 'reason', 'السبب', 'ملاحظة'],
    shift: ['shift', 'service', 'shift_number', 'numero_de_service', 'n_service', 'session', 'shift_id', 'poste', 'الوردية'],
    open: ['opening_time', 'ouverture', 'heure_d_ouverture', 'date_d_ouverture', 'date_ouverture', 'opened_at', 'debut', 'start', 'start_time', 'opened', 'بداية'],
    close: ['closing_time', 'fermeture', 'heure_de_fermeture', 'date_de_fermeture', 'date_fermeture', 'closed_at', 'fin', 'end', 'end_time', 'closed', 'cloture', 'نهاية'],
    opening: ['starting_cash', 'fond_de_caisse', 'fond_de_caisse_initial', 'fond_initial', 'fond', 'especes_initiales', 'opening_cash', 'opening_amount', 'opening_float', 'float', 'الصندوق_الافتتاحي'],
    expected: ['expected_cash_amount', 'expected_cash', 'expected', 'attendu', 'especes_attendues', 'montant_attendu', 'theorique', 'montant_theorique', 'المتوقع'],
    counted: ['actual_cash_amount', 'actual_cash', 'actual', 'compte', 'especes_comptees', 'montant_compte', 'reel', 'montant_reel', 'counted', 'counted_cash', 'المعدود'],
    diff: ['difference', 'ecart', 'gap', 'over_short', 'cash_difference', 'الفرق'],
    paidIn: ['paid_in', 'pay_in', 'entrees', 'entrees_especes', 'apports', 'cash_in'],
    paidOut: ['paid_out', 'pay_out', 'sorties', 'sorties_especes', 'retraits', 'cash_out'],
    cashier: ['cashier', 'caissier', 'caissiere', 'opened_by', 'employe', 'employee', 'staff', 'vendeur', 'serveur', 'cashier_name', 'الكاشير'],
  };

  /* Chaque genre : ses champs, dans l'ordre de l'écran ; * = obligatoire. */
  const KINDS = {
    tickets: ['date*', 'time', 'ref*', 'total*', 'method', 'type', 'status'],
    lines: ['ref*', 'date', 'time', 'name*', 'qty*', 'price', 'total', 'cat', 'method', 'type', 'status'],
    items: ['date', 'name*', 'qty*', 'price', 'total', 'cat'],
    moves: ['date*', 'time', 'moveType', 'amount', 'moveIn', 'moveOut', 'reason', 'shift'],
    shifts: ['ref', 'open*', 'close', 'opening', 'paidIn', 'paidOut', 'expected', 'counted', 'diff', 'cashier'],
  };
  const fieldsOf = (kind) => (KINDS[kind] || []).map((f) => ({ field: f.replace('*', ''), required: f.endsWith('*') }));

  /* Une colonne par champ ; un même en-tête ne sert qu'une fois, et un nom
     exact passe avant un nom qui le contient. */
  function mapColumns(header, kind) {
    const keys = header.map(key);
    const used = new Set(), map = {};
    for (const { field } of fieldsOf(kind)) {
      const names = SYN[field] || [];
      let at = -1;
      for (const n of names) { at = keys.findIndex((k, i) => !used.has(i) && k === n); if (at >= 0) break; }
      /* « Prix TTC », « Date de vente » : le nom connu suivi d'une précision.
         Jamais l'inverse : « Cashier name » n'est pas un article. */
      if (at < 0) for (const n of names) {
        if (n.length < 4) continue;
        at = keys.findIndex((k, i) => !used.has(i) && k && k.startsWith(n + '_'));
        if (at >= 0) break;
      }
      if (at >= 0) { map[field] = at; used.add(at); }
    }
    return map;
  }
  const has = (map, f) => map[f] != null && map[f] >= 0;
  function missing(kind, map) {
    const out = fieldsOf(kind).filter((f) => f.required && !has(map, f.field)).map((f) => f.field);
    if (kind === 'moves' && !has(map, 'amount') && !has(map, 'moveIn') && !has(map, 'moveOut')) out.push('amount');
    return out;
  }
  /* Le genre le plus probable d'un en-tête : celui dont les champs propres sont
     là et dont il manque le moins. */
  function scoreKind(header) {
    const best = [];
    const probe = mapColumns(header, 'lines');
    const hasName = has(probe, 'name'), hasRef = has(probe, 'ref');
    for (const kind of Object.keys(KINDS)) {
      const map = mapColumns(header, kind);
      const miss = missing(kind, map).length;
      const got = Object.keys(map).length;
      let sig = 0;
      if (kind === 'shifts') sig = has(map, 'open') && (has(map, 'opening') || has(map, 'expected') || has(map, 'counted')) ? 4 : -5;
      if (kind === 'moves') sig = has(map, 'moveIn') || has(map, 'moveOut') || (has(map, 'moveType') && has(map, 'amount') && !hasName && !hasRef) ? 2 : -3;
      if (kind === 'lines') sig = hasRef && hasName ? 2 : -5;
      if (kind === 'tickets') sig = hasRef && has(map, 'total') && !hasName ? 2 : -2;
      if (kind === 'items') sig = hasName && !hasRef ? 2 : -5;
      best.push({ kind, map, score: got + sig - miss * 4 });
    }
    best.sort((a, b) => b.score - a.score);
    return best[0];
  }
  function detect(rows) {
    let pick = null;
    const top = Math.min(rows.length, 12);
    for (let r = 0; r < top; r++) {
      const filled = (rows[r] || []).filter((c) => String(c == null ? '' : c).trim() !== '').length;
      if (filled < 2) continue;
      const s = scoreKind(rows[r].map((c) => String(c == null ? '' : c)));
      if (!pick || s.score > pick.score) pick = Object.assign({ headerRow: r }, s);
    }
    return pick || { headerRow: 0, kind: 'tickets', map: {}, score: -99 };
  }

  /* ───────────── valeurs ───────────── */
  const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
  function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    if (typeof v === 'boolean' || v == null) return NaN;
    let t = String(v).replace(ARABIC_DIGITS, (c) => String(c.charCodeAt(0) - (c <= '٩' ? 0x660 : 0x6f0)))
      .replace(/٫/g, '.').replace(/٬/g, ',').trim();
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    t = t.replace(/(?:MAD|DHS?|DH|EUR|USD|€|\$|درهم)\.?/gi, '').replace(/[\s  ]/g, '');
    if (/^-/.test(t)) { neg = !neg; t = t.slice(1); } else if (/^\+/.test(t)) t = t.slice(1);
    if (!t) return NaN;
    if (/^\d+,\d+$/.test(t)) t = t.replace(',', '.');
    else if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
    else if (!/^\d+(?:\.\d+)?$/.test(t)) return NaN;
    const n = Number(t);
    return Number.isFinite(n) ? (neg ? -n : n) : NaN;
  }
  const toCents = (v) => { const n = num(v); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
  const pad = (n) => String(n).padStart(2, '0');
  const isoOk = (y, m, d) => {
    if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
    const iso = y + '-' + pad(m) + '-' + pad(d);
    return new Date(iso + 'T00:00:00Z').toISOString().slice(0, 10) === iso ? iso : '';
  };
  const MONTHS = { jan: 1, janv: 1, janvier: 1, january: 1, feb: 2, fev: 2, fevr: 2, fevrier: 2, february: 2, mar: 3, mars: 3, march: 3, apr: 4, avr: 4, avril: 4, april: 4, may: 5, mai: 5, jun: 6, juin: 6, june: 6, jul: 7, juil: 7, juillet: 7, july: 7, aug: 8, aou: 8, aout: 8, august: 8, sep: 9, sept: 9, septembre: 9, september: 9, oct: 10, octobre: 10, october: 10, nov: 11, novembre: 11, november: 11, dec: 12, decembre: 12, december: 12 };
  /* « 13:45 », « 13h45 », « 1:45 PM », « 13:45:10 », ou la fraction de jour
     qu'Excel écrit pour une heure. */
  function parseTime(v) {
    if (typeof v === 'number') {
      if (!(v >= 0)) return '';
      const f = v - Math.floor(v);
      const mins = Math.round(f * 1440) % 1440;
      return pad(Math.floor(mins / 60)) + ':' + pad(mins % 60);
    }
    const m = /(\d{1,2})\s*[:hH]\s*(\d{2})(?::(\d{2}))?\s*([AaPp]\.?[Mm]\.?)?/.exec(String(v == null ? '' : v));
    if (!m) return '';
    let h = +m[1];
    const mi = +m[2];
    if (m[4]) { const pm = /p/i.test(m[4]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
    return h <= 23 && mi <= 59 ? pad(h) + ':' + pad(mi) : '';
  }
  /* Le sens d'une colonne de dates « a/b/aaaa » : jour d'abord sauf si une
     valeur l'interdit. Le Maroc et la France écrivent jj/mm, une caisse
     américaine mm/jj : une seule ligne avec un 13 tranche. */
  function dateOrder(values) {
    let dmy = false, mdy = false;
    for (const v of values) {
      const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/.exec(String(v == null ? '' : v));
      if (!m) continue;
      if (+m[1] > 12) dmy = true;
      if (+m[2] > 12) mdy = true;
    }
    return mdy && !dmy ? 'mdy' : 'dmy';
  }
  /* Une cellule de date → { day: 'AAAA-MM-JJ', time: 'HH:MM' | '' }. */
  function parseDateTime(v, order) {
    if (typeof v === 'number') {
      if (!(v > 20000 && v < 80000)) return null;          // numéro de série Excel, 1954–2119
      const ms = Math.round((v - 25569) * 86400000);
      const d = new Date(ms);
      const day = d.toISOString().slice(0, 10);
      const frac = v - Math.floor(v);
      return { day, time: frac > 1e-6 ? parseTime(frac) : '' };
    }
    if (v instanceof Date && !isNaN(v)) return { day: v.toISOString().slice(0, 10), time: '' };
    const s = String(v == null ? '' : v).trim();
    if (!s) return null;
    let m, day = '';
    let rest = s;
    if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s))) { day = isoOk(+m[1], +m[2], +m[3]); rest = s.slice(m[0].length); }
    else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/.exec(s))) {
      const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
      day = order === 'mdy' ? isoOk(y, +m[1], +m[2]) : isoOk(y, +m[2], +m[1]);
      rest = s.slice(m[0].length);
    } else if ((m = /^(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\.?,?\s+(\d{4})/.exec(s))) {
      day = isoOk(+m[3], MONTHS[key(m[2])] || 0, +m[1]); rest = s.slice(m[0].length);
    } else if ((m = /^([A-Za-zÀ-ÿ]+)\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s))) {
      day = isoOk(+m[3], MONTHS[key(m[1])] || 0, +m[2]); rest = s.slice(m[0].length);
    }
    if (!day) return null;
    return { day, time: parseTime(rest.replace(/^[T,\s]+/, '')) };
  }
  const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  /* Le jour commercial : avant l'heure de bascule (5 h par défaut), un ticket
     appartient à la veille, comme sur la caisse. */
  const businessDay = (day, time, cutoff) => (time && +time.slice(0, 2) < (cutoff == null ? 5 : cutoff) ? addDays(day, -1) : day);

  function method(v) {
    const k = norm(v);
    if (!k) return '';
    /* « Cash, Card » : un paiement partagé, dit sur le texte brut (la
       normalisation efface la virgule). */
    const parts = String(v).split(/\s*(?:[,+/&;]| et | and )\s*/).filter((x) => norm(x));
    if (parts.length > 1) return new Set(parts.map(method)).size > 1 ? 'other' : method(parts[0]);
    if (/espece|cash|liquide|نقد|كاش/.test(k)) return 'cash';
    if (/carte|card|cb|tpe|visa|master|credit|debit|amex|بطاقة/.test(k)) return 'card';
    if (/virement|transfer|bank|banc|تحويل/.test(k)) return 'transfer';
    if (/cheque|check|شيك/.test(k)) return 'cheque';
    return 'other';
  }
  const isRefund = (v) => /rembours|refund|retour|avoir|return|استرجاع/.test(norm(v));
  const isCancelled = (v) => /annul|cancel|void|supprim|delete|ملغ/.test(norm(v));
  function moveKind(v) {
    const k = norm(v);
    if (/(^| )(sortie|out|pay out|paid out|retrait|depense|withdraw|remove|decaiss)|خروج|مصروف/.test(k)) return 'out';
    if (/(^| )(entree|in|pay in|paid in|apport|depot|ajout|add|encaiss)|دخول/.test(k)) return 'in';
    return '';
  }

  /* ───────────── le plan ───────────── */
  const MAX_LINES = 40;
  const MAX_TICKETS_DAY = 1000;
  /* sources : [{ id, name, kind, map, rows, headerRow }]
     ctx     : { menu: [{ name, price, cat }], cutoff, today, firstSaleDay,
                 firstCashDay, salesDays: [day], cashDays: [day] } */
  function build(sources, ctx) {
    ctx = ctx || {};
    const cutoff = ctx.cutoff == null ? 5 : ctx.cutoff;
    const menu = new Map((ctx.menu || []).map((m) => [norm(m.name), m]));
    const issues = [];
    const note = (src, line, why, detail) => issues.push({ file: src.name, line, why, detail: detail == null ? '' : String(detail) });
    const tickets = new Map();          // clé → ticket
    const lineSources = [], itemRows = [], shiftList = [], moveList = [];
    let refunds = { n: 0, cents: 0 }, cancelled = 0;

    for (const src of sources) {
      if (!src || src.kind === 'skip' || !KINDS[src.kind]) continue;
      const map = src.map || {};
      const body = (src.rows || []).slice((src.headerRow || 0) + 1);
      const col = (row, f) => (has(map, f) ? row[map[f]] : '');
      const orders = {};
      ['date', 'open', 'close'].forEach((f) => { if (has(map, f)) orders[f] = dateOrder(body.map((r) => r[map[f]])); });
      const when = (row, f) => {
        const dt = parseDateTime(col(row, f), orders[f]);
        if (!dt) return null;
        if (f === 'date' && has(map, 'time')) dt.time = parseTime(col(row, 'time')) || dt.time;
        return dt;
      };
      body.forEach((row, i) => {
        const line = (src.headerRow || 0) + i + 2;
        if (!row || !row.some((c) => String(c == null ? '' : c).trim() !== '')) return;
        if (src.kind === 'tickets') {
          if (has(map, 'status') && isCancelled(col(row, 'status'))) { cancelled++; return; }
          const dt = when(row, 'date');
          if (!dt) return note(src, line, 'badDate', col(row, 'date'));
          const ref = String(col(row, 'ref') == null ? '' : col(row, 'ref')).trim();
          if (!ref) return note(src, line, 'noRef');
          const total = toCents(col(row, 'total'));
          if (!Number.isFinite(total)) return note(src, line, 'badTotal', col(row, 'total'));
          if ((has(map, 'type') && isRefund(col(row, 'type'))) || total < 0) { refunds.n++; refunds.cents += Math.abs(total); return; }
          const k = ref + '|' + dt.day;
          if (tickets.has(k)) return note(src, line, 'dupRef', ref);
          tickets.set(k, { ref, day: dt.day, time: dt.time, total, method: method(col(row, 'method')) || 'other', lines: [], fromTickets: true });
        } else if (src.kind === 'lines' || src.kind === 'items') {
          lineSources.push({ src, row, line, when, col });
        } else if (src.kind === 'shifts') {
          const op = parseDateTime(col(row, 'open'), orders.open);
          if (!op || !op.time) return note(src, line, 'badOpen', col(row, 'open'));
          const cl = has(map, 'close') ? parseDateTime(col(row, 'close'), orders.close) : null;
          const c = (f) => (has(map, f) && String(col(row, f)).trim() !== '' ? toCents(col(row, f)) : null);
          const opening = c('opening'), expected0 = c('expected'), counted = c('counted'), diff = c('diff');
          if ([opening, expected0, counted, diff].some((x) => x != null && !Number.isFinite(x))) return note(src, line, 'badAmount');
          const expected = expected0 != null ? expected0 : counted != null && diff != null ? counted - diff : null;
          shiftList.push({
            ref: String(col(row, 'ref') == null ? '' : col(row, 'ref')).trim() || String(shiftList.length + 1),
            open: op.day + ' ' + op.time, close: cl && cl.time ? cl.day + ' ' + cl.time : '',
            day: businessDay(op.day, op.time, cutoff),
            opening: opening == null ? 0 : Math.max(0, opening), expected: expected == null ? null : Math.max(0, expected),
            counted: counted == null ? null : Math.max(0, counted),
            paidIn: c('paidIn'), paidOut: c('paidOut'), cashier: String(col(row, 'cashier') || '').trim(), moves: [],
          });
        } else if (src.kind === 'moves') {
          const dt = when(row, 'date');
          if (!dt) return note(src, line, 'badDate', col(row, 'date'));
          const reason = String(col(row, 'reason') == null ? '' : col(row, 'reason')).trim();
          const shift = String(col(row, 'shift') == null ? '' : col(row, 'shift')).trim();
          const push = (kind, cents) => moveList.push({ kind, cents, day: dt.day, time: dt.time, reason, shift });
          let found = false;
          if (has(map, 'moveIn')) { const v = toCents(col(row, 'moveIn')); if (v > 0) { push('in', v); found = true; } }
          if (has(map, 'moveOut')) { const v = toCents(col(row, 'moveOut')); if (v) { push('out', Math.abs(v)); found = true; } }
          if (!found && has(map, 'amount')) {
            const v = toCents(col(row, 'amount'));
            if (!Number.isFinite(v)) return note(src, line, 'badAmount', col(row, 'amount'));
            if (!v) return;
            const k = has(map, 'moveType') ? moveKind(col(row, 'moveType')) : '';
            const kind = k || (v < 0 ? 'out' : '');
            if (!kind) return note(src, line, 'noMoveKind', col(row, 'moveType'));
            push(kind, Math.abs(v)); found = true;
          }
          if (!found) note(src, line, 'badAmount');
        }
      });
    }

    /* Les articles : rattachés à leur ticket, ou un ticket reconstruit, ou une
       vente du jour sans ticket. */
    const unitFor = (name, qty, price, total) => {
      if (Number.isFinite(price) && price >= 0) return price;
      if (Number.isFinite(total) && qty > 0) return Math.round(total / qty);
      const known = menu.get(norm(name));
      return known ? Math.round(Number(known.price) * 100) : NaN;
    };
    const refKeys = new Map();      // ref seul → clés de tickets (pour un détail sans date)
    for (const [k, t] of tickets) { const list = refKeys.get(t.ref) || []; list.push(k); refKeys.set(t.ref, list); }
    for (const { src, row, line, when, col } of lineSources) {
      const map = src.map || {};
      if (has(map, 'status') && isCancelled(col(row, 'status'))) continue;
      const name = String(col(row, 'name') == null ? '' : col(row, 'name')).replace(/\s+/g, ' ').trim();
      if (!name) { note(src, line, 'noName'); continue; }
      const qty = num(col(row, 'qty'));
      if (!Number.isFinite(qty)) { note(src, line, 'badQty', col(row, 'qty')); continue; }
      const price = has(map, 'price') && String(col(row, 'price')).trim() !== '' ? toCents(col(row, 'price')) : NaN;
      const total = has(map, 'total') && String(col(row, 'total')).trim() !== '' ? toCents(col(row, 'total')) : NaN;
      const refundRow = (has(map, 'type') && isRefund(col(row, 'type'))) || qty < 0 || total < 0;
      if (refundRow) { refunds.n++; refunds.cents += Math.abs(Number.isFinite(total) ? total : Math.round(Math.abs(qty) * (price || 0))); continue; }
      if (!qty) continue;
      const unit = unitFor(name, qty, price, total);
      if (!Number.isFinite(unit) || unit < 0) { note(src, line, 'noPrice', name); continue; }
      const known = menu.get(norm(name));
      const item = { name: known ? known.name : name.slice(0, 60), qty: Math.round(qty * 1000) / 1000, unitCents: unit, cat: String(col(row, 'cat') || (known && known.cat) || '').trim().slice(0, 40) };
      const cents = Number.isFinite(total) ? total : Math.round(qty * unit);
      const dt = has(map, 'date') ? when(row, 'date') : null;
      if (has(map, 'date') && String(col(row, 'date')).trim() !== '' && !dt) { note(src, line, 'badDate', col(row, 'date')); continue; }
      if (src.kind === 'lines') {
        const ref = String(col(row, 'ref') == null ? '' : col(row, 'ref')).trim();
        if (!ref) { note(src, line, 'noRef'); continue; }
        let t = dt ? tickets.get(ref + '|' + dt.day) : null;
        if (!t && !dt) { const ks = refKeys.get(ref) || []; t = ks.length === 1 ? tickets.get(ks[0]) : null; }
        if (t && t.fromTickets) { if (t.lines.length < MAX_LINES) t.lines.push(item); continue; }
        if (!t) {
          if (!dt) { note(src, line, 'noDate', ref); continue; }
          t = { ref, day: dt.day, time: dt.time, total: 0, method: 'other', lines: [], fromTickets: false };
          tickets.set(ref + '|' + dt.day, t);
        }
        t.total += cents;
        if (!t.time && dt && dt.time) t.time = dt.time;
        const mt = method(col(row, 'method'));
        if (mt) t.method = t.lines.length && t.method !== mt && t.method !== 'other' ? 'other' : mt;
        if (t.lines.length < MAX_LINES) t.lines.push(item);
      } else {
        const day = dt ? dt.day : ctx.fallbackDay || '';
        if (!day) { note(src, line, 'noDate', name); continue; }
        itemRows.push({ day, item, src, line });
      }
    }

    /* Par jour commercial, et les jours que l'on ne peut pas écrire. */
    const ticketDays = new Map();
    for (const t of tickets.values()) {
      const day = businessDay(t.day, t.time, cutoff);
      const list = ticketDays.get(day) || [];
      list.push({ ref: t.ref.slice(0, 32), at: t.time ? t.day + ' ' + t.time : '', method: t.method, totalCents: t.total, lines: t.lines });
      ticketDays.set(day, list);
    }
    const itemDays = new Map();
    let itemsHidden = 0;
    for (const r of itemRows) {
      if (ticketDays.has(r.day)) { itemsHidden++; continue; }
      const list = itemDays.get(r.day) || [];
      list.push(r.item);
      itemDays.set(r.day, list);
    }
    if (itemsHidden) issues.push({ file: '', line: 0, why: 'itemsInTickets', detail: String(itemsHidden) });

    /* Les mouvements : au service qu'ils nomment, sinon à celui pendant lequel
       ils ont eu lieu, sinon au jour. */
    const shiftsByRef = new Map(shiftList.map((s) => [norm(s.ref), s]));
    const loose = [];
    for (const mv of moveList) {
      const at = mv.time ? mv.day + ' ' + mv.time : '';
      let s = mv.shift ? shiftsByRef.get(norm(mv.shift)) : null;
      if (!s && at) s = shiftList.find((x) => at >= x.open && (x.close ? at <= x.close : at.slice(0, 10) === x.open.slice(0, 10)));
      if (s && at && at < s.open) s = null;
      if (s) s.moves.push({ at, kind: mv.kind, cents: mv.cents, reason: mv.reason });
      else loose.push(mv);
    }
    const cashDays = new Map();
    const cashDay = (d) => { let e = cashDays.get(d); if (!e) { e = { day: d, shifts: [], moves: [] }; cashDays.set(d, e); } return e; };
    for (const s of shiftList) {
      if (!s.moves.length) {
        if (s.paidIn > 0) s.moves.push({ at: '', kind: 'in', cents: s.paidIn, reason: '' });
        if (s.paidOut) s.moves.push({ at: '', kind: 'out', cents: Math.abs(s.paidOut), reason: '' });
      }
      cashDay(s.day).shifts.push({
        ref: String(s.ref).slice(0, 24), open: s.open, close: s.close, openingCents: s.opening,
        expectedCents: s.expected, countedCents: s.counted,
        moves: s.moves.map((m) => ({ at: m.at, kind: m.kind, cents: m.cents, reason: m.reason || (s.cashier ? s.cashier : '') })),
      });
    }
    for (const mv of loose) {
      const day = businessDay(mv.day, mv.time, cutoff);
      cashDay(day).moves.push({ at: mv.day + ' ' + (mv.time || '12:00'), kind: mv.kind, cents: mv.cents, reason: mv.reason });
    }

    /* Ce qui ne peut pas s'écrire : aujourd'hui et après, plus de deux ans,
       à partir du premier jour tenu sur Kiwi, un jour trop chargé. */
    const today = ctx.today || new Date().toISOString().slice(0, 10);
    const oldest = addDays(today, -731);
    const blocked = { live: new Set(), future: new Set(), old: new Set(), heavy: new Set() };
    const allowed = (day, first) => {
      if (day >= today) { blocked.future.add(day); return false; }
      if (day < oldest) { blocked.old.add(day); return false; }
      if (first && day >= first) { blocked.live.add(day); return false; }
      return true;
    };
    for (const [d, list] of ticketDays) {
      if (!allowed(d, ctx.firstSaleDay)) ticketDays.delete(d);
      else if (list.length > MAX_TICKETS_DAY) { blocked.heavy.add(d); ticketDays.delete(d); }
    }
    for (const d of [...itemDays.keys()]) if (!allowed(d, ctx.firstSaleDay)) itemDays.delete(d);
    for (const d of [...cashDays.keys()]) if (!allowed(d, ctx.firstCashDay)) cashDays.delete(d);

    const sortDays = (m) => [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const plan = {
      tickets: sortDays(ticketDays).map(([day, list]) => ({ day, tickets: list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)) })),
      items: sortDays(itemDays).map(([day, lines]) => ({ day, lines })),
      cash: sortDays(cashDays).map(([, e]) => e),
      issues, refunds, cancelled,
      blocked: { live: blocked.live.size, future: blocked.future.size, old: blocked.old.size, heavy: blocked.heavy.size },
    };
    plan.stats = stats(plan, ctx);
    return plan;
  }

  function stats(plan, ctx) {
    const days = new Set();
    let tickets = 0, ticketCents = 0, itemCents = 0, shifts = 0, moves = 0, inCents = 0, outCents = 0, gapCents = 0, lines = 0;
    for (const d of plan.tickets) { days.add(d.day); tickets += d.tickets.length; d.tickets.forEach((t) => { ticketCents += t.totalCents; lines += t.lines.length; }); }
    for (const d of plan.items) { days.add(d.day); d.lines.forEach((l) => { itemCents += Math.round(l.qty * l.unitCents); lines++; }); }
    for (const d of plan.cash) {
      days.add(d.day);
      const all = d.moves.slice();
      d.shifts.forEach((s) => { shifts++; all.push(...s.moves); if (s.expectedCents != null && s.countedCents != null) gapCents += s.countedCents - s.expectedCents; });
      all.forEach((m) => { moves++; if (m.kind === 'in') inCents += m.cents; else outCents += m.cents; });
    }
    const sorted = [...days].sort();
    const salesDone = new Set((ctx && ctx.salesDays) || []), cashDone = new Set((ctx && ctx.cashDays) || []);
    const replaced = plan.tickets.concat(plan.items).filter((d) => salesDone.has(d.day)).length + plan.cash.filter((d) => cashDone.has(d.day)).length;
    return { from: sorted[0] || '', to: sorted[sorted.length - 1] || '', days: sorted.length, tickets, ticketCents, itemDays: plan.items.length, itemCents, lines, shifts, moves, inCents, outCents, gapCents, replaced, salesCents: ticketCents + itemCents };
  }

  /* Les envois, à la taille des routes : tickets ≤ 400 (un jour plus chargé
     part seul, jusqu'à 1 000) et ≤ 31 jours ; ventes par article ≤ 92 jours ;
     caisse ≤ 31 jours et ≤ 600 événements. Un jour n'est jamais coupé : le
     réimporter le remplace d'un bloc. */
  function chunks(plan) {
    const out = [];
    const pack = (list, kind, size, maxDays, cap) => {
      let cur = [], n = 0;
      for (const d of list) {
        const w = size(d);
        if (cur.length && (cur.length >= maxDays || n + w > cap)) { out.push({ kind, days: cur }); cur = []; n = 0; }
        cur.push(d); n += w;
      }
      if (cur.length) out.push({ kind, days: cur });
    };
    pack(plan.tickets, 'tickets', (d) => d.tickets.length, 31, 400);
    pack(plan.items, 'items', () => 1, 92, 92);
    pack(plan.cash, 'cash', (d) => d.moves.length + d.shifts.reduce((s, x) => s + 2 + x.moves.length, 0), 31, 600);
    return out;
  }

  const api = { detect, mapColumns, missing, fieldsOf, build, chunks, num, toCents, parseDateTime, parseTime, dateOrder, method, moveKind, businessDay, KINDS, SYN, key };
  root.KiwiHistoryEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
