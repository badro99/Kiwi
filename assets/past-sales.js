/* Kiwi · VENTES ANTÉRIEURES — window.KiwiPastSales
 * ---------------------------------------------------------------------------
 * Les ventes d'avant Kiwi, pour que les rapports couvrent aussi la période où
 * l'établissement tenait sa caisse ailleurs (Jon's Burgers, 26 nov. 2026).
 * Choix du propriétaire : rapports seulement. Le serveur (/api/past-sales) les
 * écrit au nom du compte, canal « historique » : ni tiroir, ni Z, ni stock.
 *
 * Trois façons de les saisir, une seule écriture :
 *   · Un jour      la carte, une quantité par plat, au prix de la carte ;
 *   · Une période  la même grille, quantités TOTALES, réparties en entiers
 *                  sur les jours de la période (la somme reste exacte) ;
 *   · Fichier      CSV ou copier-coller depuis Excel : date, article,
 *                  quantité, prix ou total. Sans colonne date, un seul jour.
 * Rien n'est envoyé avant « Enregistrer » ; un jour ressaisi est remplacé.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const STR = {
    fr: {
      title: 'Ventes antérieures', tag: 'Avant Kiwi',
      desc: 'Les ventes faites avant Kiwi. Elles comptent dans le chiffre d’affaires, les produits les plus vendus et les rapports, jamais dans la caisse, le Z ni le stock.',
      tabDay: 'Un jour', tabPeriod: 'Une période', tabFile: 'Fichier',
      day: 'Jour', from: 'Du', to: 'Au', method: 'Paiement', cash: 'Espèces', card: 'Carte', other: 'Non précisé',
      search: 'Chercher un plat', price: 'Prix', qty: 'Quantité', item: 'Article', total: 'Total',
      addFree: 'Article hors carte', freeName: 'Nom', remove: 'Retirer', none: 'Aucun plat sur la carte. Utilisez l’onglet Fichier.',
      spread: (n) => `Les quantités sont des totaux pour la période, réparties en nombres entiers sur ses ${n} jours. Une période ressaisie remplace ses jours.`,
      fileHelp: 'Colonnes reconnues : date, article, quantite, prix (ou total), categorie. Seules article et quantite sont obligatoires ; sans prix, Kiwi prend celui de la carte.',
      fileDay: 'Jour, si le fichier n’a pas de colonne date', choose: 'Choisir un fichier CSV', paste: 'ou collez ici les lignes copiées depuis Excel',
      read: 'Lire', template: 'Télécharger un modèle', preview: (d, n) => `${d} jour(s) · ${n} ligne(s) prêtes`,
      issues: (n) => `${n} ligne(s) ignorée(s)`, line: 'Ligne', noPrice: 'pas de prix et absent de la carte', badQty: 'quantité illisible', badDate: 'date illisible', noDate: 'pas de date : choisissez un jour', noName: 'article vide',
      save: (d, a) => `Enregistrer ${d} jour(s) · ${a}`, saving: 'Enregistrement…', nothing: 'Saisissez au moins une quantité.',
      saved: 'Ventes antérieures enregistrées', savedDesc: (d, a) => `${d} jour(s) · ${a}. Le tableau de bord se met à jour dans la minute.`,
      history: 'Déjà saisies', empty: 'Aucune vente antérieure pour l’instant.', edit: 'Modifier', del: 'Retirer',
      confirmDel: (d) => `Retirer les ventes antérieures du ${d} ?`, removed: 'Journée retirée',
      limit: (d) => `Jours possibles : jusqu’au ${d}, la veille de la première vente en caisse.`, limitNone: 'Jours possibles : jusqu’à hier.',
      loading: 'Chargement…', offline: 'Le serveur ne répond pas. Réessayez.', forbidden: 'Réservé au propriétaire de l’établissement.',
      tooLong: 'Une période compte au plus 92 jours.', order: 'La date de fin précède la date de début.',
      errTill: (d, f) => `Le ${d} a déjà des ventes en caisse. Seules les journées avant le ${f} peuvent être ajoutées.`,
      errPast: (d) => `Le ${d} n’est pas encore passé.`, errOld: (d) => `Le ${d} est trop ancien (deux ans au plus).`,
      errLine: (n) => `Ligne refusée : ${n}.`, errGeneric: 'Enregistrement refusé.', mad: 'MAD', items: (n) => `${n} article(s)`,
    },
    en: {
      title: 'Past sales', tag: 'Before Kiwi',
      desc: 'Sales made before Kiwi. They count in revenue, best sellers and reports, never in the till, the Z or stock.',
      tabDay: 'One day', tabPeriod: 'A period', tabFile: 'File',
      day: 'Day', from: 'From', to: 'To', method: 'Payment', cash: 'Cash', card: 'Card', other: 'Not specified',
      search: 'Find a dish', price: 'Price', qty: 'Quantity', item: 'Item', total: 'Total',
      addFree: 'Item not on the menu', freeName: 'Name', remove: 'Remove', none: 'No dishes on the menu. Use the File tab.',
      spread: (n) => `Quantities are totals for the period, spread in whole numbers over its ${n} days. Saving a period again replaces its days.`,
      fileHelp: 'Recognised columns: date, article, quantite, prix (or total), categorie. Only article and quantite are required; without a price Kiwi uses the menu price.',
      fileDay: 'Day, if the file has no date column', choose: 'Choose a CSV file', paste: 'or paste rows copied from Excel here',
      read: 'Read', template: 'Download a template', preview: (d, n) => `${d} day(s) · ${n} row(s) ready`,
      issues: (n) => `${n} row(s) skipped`, line: 'Row', noPrice: 'no price and not on the menu', badQty: 'unreadable quantity', badDate: 'unreadable date', noDate: 'no date: pick a day', noName: 'empty item',
      save: (d, a) => `Save ${d} day(s) · ${a}`, saving: 'Saving…', nothing: 'Enter at least one quantity.',
      saved: 'Past sales saved', savedDesc: (d, a) => `${d} day(s) · ${a}. The dashboard updates within a minute.`,
      history: 'Already entered', empty: 'No past sales yet.', edit: 'Edit', del: 'Remove',
      confirmDel: (d) => `Remove the past sales of ${d}?`, removed: 'Day removed',
      limit: (d) => `Allowed days: up to ${d}, the day before the first till sale.`, limitNone: 'Allowed days: up to yesterday.',
      loading: 'Loading…', offline: 'The server is not answering. Try again.', forbidden: 'Only the owner of the business can do this.',
      tooLong: 'A period is at most 92 days.', order: 'The end date is before the start date.',
      errTill: (d, f) => `${d} already has till sales. Only days before ${f} can be added.`,
      errPast: (d) => `${d} has not passed yet.`, errOld: (d) => `${d} is too old (two years at most).`,
      errLine: (n) => `Row refused: ${n}.`, errGeneric: 'Save refused.', mad: 'MAD', items: (n) => `${n} item(s)`,
    },
    ar: {
      title: 'المبيعات السابقة', tag: 'قبل Kiwi',
      desc: 'المبيعات التي تمت قبل Kiwi. تُحتسب في رقم المعاملات والمنتجات الأكثر مبيعاً والتقارير، ولا تدخل أبداً في الصندوق ولا في تقرير Z ولا في المخزون.',
      tabDay: 'يوم واحد', tabPeriod: 'فترة', tabFile: 'ملف',
      day: 'اليوم', from: 'من', to: 'إلى', method: 'الدفع', cash: 'نقداً', card: 'بطاقة', other: 'غير محدد',
      search: 'ابحث عن طبق', price: 'السعر', qty: 'الكمية', item: 'الصنف', total: 'المجموع',
      addFree: 'صنف خارج القائمة', freeName: 'الاسم', remove: 'حذف', none: 'لا توجد أطباق في القائمة. استعمل تبويب الملف.',
      spread: (n) => `الكميات مجاميع للفترة، تُوزَّع بأعداد صحيحة على أيامها الـ${n}. إعادة حفظ فترة تعوّض أيامها.`,
      fileHelp: 'الأعمدة المعروفة: date و article و quantite و prix (أو total) و categorie. العمودان article و quantite وحدهما إلزاميان؛ وبدون سعر يأخذ Kiwi سعر القائمة.',
      fileDay: 'اليوم، إن لم يكن في الملف عمود للتاريخ', choose: 'اختر ملف CSV', paste: 'أو الصق هنا الأسطر المنسوخة من Excel',
      read: 'قراءة', template: 'تنزيل نموذج', preview: (d, n) => `${d} يوم · ${n} سطر جاهز`,
      issues: (n) => `${n} سطر متجاهَل`, line: 'السطر', noPrice: 'بلا سعر وغير موجود في القائمة', badQty: 'كمية غير مقروءة', badDate: 'تاريخ غير مقروء', noDate: 'بلا تاريخ: اختر يوماً', noName: 'صنف فارغ',
      save: (d, a) => `حفظ ${d} يوم · ${a}`, saving: 'جارٍ الحفظ…', nothing: 'أدخل كمية واحدة على الأقل.',
      saved: 'حُفظت المبيعات السابقة', savedDesc: (d, a) => `${d} يوم · ${a}. تتحدّث لوحة التحكم خلال دقيقة.`,
      history: 'المُدخلة سابقاً', empty: 'لا توجد مبيعات سابقة بعد.', edit: 'تعديل', del: 'حذف',
      confirmDel: (d) => `حذف المبيعات السابقة ليوم ${d}؟`, removed: 'حُذف اليوم',
      limit: (d) => `الأيام الممكنة: حتى ${d}، اليوم السابق لأول بيع في الصندوق.`, limitNone: 'الأيام الممكنة: حتى الأمس.',
      loading: 'جارٍ التحميل…', offline: 'الخادم لا يجيب. أعد المحاولة.', forbidden: 'هذا خاص بصاحب المؤسسة.',
      tooLong: 'الفترة 92 يوماً على الأكثر.', order: 'تاريخ النهاية قبل تاريخ البداية.',
      errTill: (d, f) => `يوم ${d} فيه مبيعات في الصندوق. يمكن إضافة الأيام السابقة لـ${f} فقط.`,
      errPast: (d) => `يوم ${d} لم يمضِ بعد.`, errOld: (d) => `يوم ${d} قديم جداً (سنتان على الأكثر).`,
      errLine: (n) => `سطر مرفوض: ${n}.`, errGeneric: 'رُفض الحفظ.', mad: 'درهم', items: (n) => `${n} صنف`,
    },
  };
  const lang = () => { try { return (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr'; } catch (_) { return 'fr'; } };
  /* « 24 nov. 2026 », not « 2026-11-24 ». One formatter per language, built once. */
  const dayFmts = Object.create(null);
  const dayText = (iso) => {
    const l = lang() === 'en' ? 'en-GB' : 'fr-FR';
    const f = dayFmts[l] || (dayFmts[l] = new Intl.DateTimeFormat(l, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }));
    const ms = Date.parse(String(iso) + 'T12:00:00Z');
    return Number.isFinite(ms) ? f.format(ms) : String(iso || '');
  };
  const t = (k, ...a) => { const s = (STR[lang()] || STR.fr)[k]; return typeof s === 'function' ? s(...a) : (s == null ? STR.fr[k] : s); };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ───────────── pure helpers (headless-testable) ───────────── */
  const DAY = 86400000;
  const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY) + 1;
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();
  const cents = (mad) => Math.round(Number(mad) * 100);
  /* Excel en français écrit « 1,875 » et « 0,054 » : une virgule seule est une
     décimale, jamais un séparateur de milliers (le lecteur générique lirait
     1875 et 54). Le reste (« 1 234,50 », « 1.234,50 ») passe par lui. */
  function num(s) {
    const v = String(s == null ? '' : s).trim().replace(/\s*(?:MAD|DH|DHS)$/i, '').replace(/[\s  ]/g, '');
    if (/^-?\d+,\d+$/.test(v)) return Number(v.replace(',', '.'));
    const imp = window.KiwiCatalogImport;
    if (imp && imp._num) return imp._num(v);
    const n = Number(v);
    return v && Number.isFinite(n) ? n : NaN;
  }
  /* « 2026-11-03 », « 03/11/2026 », « 3/11/26 », « 03-11-2026 », « 03.11.2026 ». */
  function parseDay(s) {
    const v = String(s == null ? '' : s).trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
    let y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v))) { d = +m[1]; mo = +m[2]; y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; }
    else return '';
    const iso = String(y).padStart(4, '0') + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const back = new Date(iso + 'T00:00:00Z');
    return !isNaN(back) && back.toISOString().slice(0, 10) === iso ? iso : '';
  }
  /* Une quantité totale répartie sur n jours en entiers : la somme reste exacte,
     le reste tombe sur des jours espacés régulièrement, pas tous à la fin. */
  function spread(qty, n) {
    const whole = Math.floor(qty), frac = Math.round((qty - whole) * 1000) / 1000;
    const base = Math.floor(whole / n), rem = whole - base * n;
    const out = Array(n).fill(base);
    for (let i = 0; i < rem; i++) out[Math.floor((i + 0.5) * n / rem)] += 1;
    if (frac) out[n - 1] = Math.round((out[n - 1] + frac) * 1000) / 1000;
    return out;
  }
  /* Grille saisie → jours pour le serveur. lines : [{ name, qty, unitCents, cat }]. */
  function periodDays(from, to, lines) {
    const n = daysBetween(from, to);
    const per = lines.map((l) => spread(l.qty, n));
    return Array.from({ length: n }, (_, i) => ({
      day: addDays(from, i),
      lines: lines.map((l, k) => ({ name: l.name, qty: per[k][i], unitCents: l.unitCents, cat: l.cat || '' })).filter((l) => l.qty > 0),
    }));
  }
  const COLS = {
    date: ['date', 'jour', 'day', 'tarikh'],
    name: ['article', 'produit', 'plat', 'nom', 'name', 'item', 'designation', 'libelle', 'product'],
    qty: ['quantite', 'qte', 'qty', 'quantity', 'nombre', 'nb', 'vendus', 'ventes'],
    price: ['prix', 'prix_unitaire', 'pu', 'price', 'unit_price', 'prix_mad', 'prix_de_vente'],
    total: ['total', 'montant', 'ca', 'amount', 'total_mad', 'montant_mad'],
    cat: ['categorie', 'category', 'famille', 'rayon'],
  };
  /* Texte CSV (ou TSV collé) → { days, issues }. menu : [{ name, price, cat }]. */
  function planFromText(text, menu, fallbackDay) {
    const imp = window.KiwiCatalogImport;
    const parsed = imp && imp.parse ? imp.parse(text) : { ok: false, error: 'vide' };
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const idx = {};
    Object.keys(COLS).forEach((k) => { idx[k] = parsed.header.findIndex((h) => COLS[k].includes(h)); });
    if (idx.name < 0 || idx.qty < 0) return { ok: false, error: 'columns', header: parsed.headerRaw };
    const byName = new Map((menu || []).map((m) => [norm(m.name), m]));
    const days = new Map(), issues = [];
    parsed.rows.forEach((row, i) => {
      const line = i + 2, cell = (k) => (idx[k] >= 0 ? row[idx[k]] : '');
      const name = String(cell('name') || '').trim();
      if (!name) { issues.push({ line, why: 'noName' }); return; }
      const qty = num(cell('qty'));
      if (!(qty >= 0)) { issues.push({ line, why: 'badQty', name }); return; }
      let day = fallbackDay || '';
      if (idx.date >= 0 && String(cell('date')).trim()) { day = parseDay(cell('date')); if (!day) { issues.push({ line, why: 'badDate', name }); return; } }
      if (!day) { issues.push({ line, why: 'noDate', name }); return; }
      const known = byName.get(norm(name));
      let unit = num(cell('price'));
      if (!(unit >= 0)) { const tot = num(cell('total')); unit = tot >= 0 && qty > 0 ? tot / qty : NaN; }
      if (!(unit >= 0) && known) unit = Number(known.price);
      if (!(unit >= 0)) { issues.push({ line, why: 'noPrice', name }); return; }
      if (!qty) return;
      const list = days.get(day) || [];
      list.push({ name: known ? known.name : name, qty, unitCents: cents(unit), cat: String(cell('cat') || (known && known.cat) || '').trim() });
      days.set(day, list);
    });
    return { ok: true, issues, days: [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, lines]) => ({ day, lines })) };
  }
  const totalCents = (days) => days.reduce((s, d) => s + d.lines.reduce((x, l) => x + Math.round(l.qty * l.unitCents), 0), 0);

  /* ───────────── data ───────────── */
  const merchant = () => { try { return String((window.KiwiLive && window.KiwiLive.merchant && window.KiwiLive.merchant()) || ''); } catch (_) { return ''; } };
  function menuRows() {
    const S = window.KiwiMenuStore;
    let items = [], cats = [];
    try { items = (S && S.items && S.items()) || []; cats = (S && S.categories && S.categories()) || []; } catch (_) {}
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    const order = new Map(cats.map((c, i) => [c.id, i]));
    return items.filter((it) => it && !it.archived && it.name && Number(it.price) >= 0)
      .map((it) => ({ id: String(it.id), name: String(it.name), price: Number(it.price) || 0, cat: catName.get(it.catId) || '', rank: order.has(it.catId) ? order.get(it.catId) : 999 }))
      .sort((a, b) => a.rank - b.rank);
  }
  const fmt = (c) => { const v = (c || 0) / 100; try { return (window.KiwiNumber ? window.KiwiNumber.format(v, { maximumFractionDigits: 2 }) : v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })) + ' ' + t('mad'); } catch (_) { return v + ' ' + t('mad'); } };
  async function api(method, body) {
    const m = merchant();
    const res = await fetch('/api/past-sales' + (method === 'GET' ? '?merchant=' + encodeURIComponent(m) : ''), {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: method === 'GET' ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(Object.assign({ merchant: m }, body)),
    });
    let data = null; try { data = await res.json(); } catch (_) {}
    return { status: res.status, data: data || {} };
  }
  /* La clé du message et ses arguments : l'appelant passe par t(). */
  function errorKey(r) {
    const d = r.data || {};
    if (!r.status) return ['offline'];
    if (r.status === 403) return ['forbidden'];
    if (d.error === 'day-has-till-sales') return ['errTill', d.day, d.firstTillDay];
    if (d.error === 'day-not-past') return ['errPast', d.day];
    if (d.error === 'day-too-old') return ['errOld', d.day];
    if (/^line-/.test(d.error || '')) return ['errLine', d.name || d.day || ''];
    return ['errGeneric'];
  }

  /* ───────────── UI ───────────── */
  function css() {
    if (document.getElementById('kps-css')) return;
    const s = document.createElement('style'); s.id = 'kps-css';
    s.textContent = '.kps-tabs{display:flex;gap:4px;padding:4px;border-radius:12px;background:var(--n-100,#eceae4);margin:0 0 14px}'
      + '.kps-tabs button{flex:1;border:0;background:transparent;padding:8px 10px;border-radius:9px;font:inherit;font-weight:600;color:var(--n-600,#555);cursor:pointer}'
      + '.kps-tabs button.on{background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D);box-shadow:0 1px 2px rgba(0,0,0,.08)}'
      + '.kps-row{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:0 0 12px}.kps-row label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--n-600,#555)}'
      + '.kps-row input,.kps-row select,.kps-grid input,.kps-paste{font:inherit;padding:8px 10px;border:1px solid var(--n-200,#dcd8cf);border-radius:9px;background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D)}'
      + '.kps-scroll{max-height:46vh;overflow:auto;border:1px solid var(--n-200,#dcd8cf);border-radius:12px}'
      + '.kps-grid{width:100%;border-collapse:collapse;font-size:14px}.kps-grid th{position:sticky;top:0;background:var(--n-100,#eceae4);text-align:start;font-size:11px;letter-spacing:.04em;text-transform:uppercase;padding:8px 10px;color:var(--n-600,#555)}'
      + '.kps-grid td{padding:6px 10px;border-top:1px solid var(--n-100,#eceae4)}.kps-grid td.c{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--atlas,#0B6E4F);font-weight:600;padding-top:12px}'
      + '.kps-grid input{width:84px;text-align:end}.kps-grid input.kps-name{width:100%;text-align:start}.kps-grid .r{text-align:end;font-variant-numeric:tabular-nums}'
      + '.kps-note{font-size:12.5px;color:var(--n-600,#555);line-height:1.5;margin:8px 0}.kps-bad{color:var(--danger,#cb5238)}'
      + '.kps-paste{width:100%;min-height:110px;font-family:"JetBrains Mono",monospace;font-size:12px;box-sizing:border-box}'
      + '.kps-hist{margin-top:18px}.kps-hist h4{margin:0 0 8px;font-size:13px}.kps-link{border:0;background:none;color:var(--atlas,#0B6E4F);font:inherit;font-weight:600;cursor:pointer;padding:2px 6px}';
    document.head.appendChild(s);
  }

  function open() {
    if (!window.Kiwi || !window.Kiwi.modal) return null;
    css();
    const m = window.Kiwi.modal({
      tag: t('tag'), title: t('title'), desc: esc(t('desc')), width: 760,
      body: '<div data-kps-body><p class="kps-note">' + esc(t('loading')) + '</p></div>',
      foot: '<button class="kb atlas" type="button" data-kps-save disabled style="width:100%;justify-content:center;padding:12px;font-size:15px;">' + esc(t('save', 0, fmt(0))) + '</button>',
    });
    const body = m.el.querySelector('[data-kps-body]');
    const saveBtn = m.el.querySelector('[data-kps-save]');
    const menu = menuRows();
    const st = { tab: 'day', info: null, day: '', from: '', to: '', method: 'cash', qty: {}, price: {}, free: [], filter: '', file: null, fileDay: '' };

    const lastDay = () => {
      const i = st.info || {};
      const y = i.today ? addDays(i.today, -1) : addDays(new Date().toISOString().slice(0, 10), -1);
      return i.firstTillDay && addDays(i.firstTillDay, -1) < y ? addDays(i.firstTillDay, -1) : y;
    };
    function gridLines() {
      const out = [];
      menu.forEach((it) => {
        const q = num(st.qty[it.id]);
        if (!(q > 0)) return;
        const p = st.price[it.id] != null && String(st.price[it.id]).trim() !== '' ? num(st.price[it.id]) : it.price;
        out.push({ name: it.name, qty: q, unitCents: cents(p >= 0 ? p : it.price), cat: it.cat });
      });
      st.free.forEach((f) => { const q = num(f.qty), p = num(f.price); if (f.name.trim() && q > 0 && p >= 0) out.push({ name: f.name.trim(), qty: q, unitCents: cents(p), cat: '' }); });
      return out;
    }
    function plan() {
      if (st.tab === 'file') return st.file && st.file.ok ? st.file.days : [];
      const lines = gridLines();
      if (st.tab === 'day') return st.day && lines.length ? [{ day: st.day, lines }] : [];
      if (!st.from || !st.to || st.to < st.from || daysBetween(st.from, st.to) > 92 || !lines.length) return [];
      return periodDays(st.from, st.to, lines);
    }
    function paintFoot() {
      const p = plan(), tot = totalCents(p);
      saveBtn.disabled = !p.length;
      saveBtn.style.opacity = p.length ? '1' : '.5';
      saveBtn.textContent = t('save', p.length, fmt(tot));
    }
    const methodSel = () => '<label>' + esc(t('method')) + '<select data-kps-method>'
      + ['cash', 'card', 'other'].map((k) => '<option value="' + k + '"' + (st.method === k ? ' selected' : '') + '>' + esc(t(k)) + '</option>').join('') + '</select></label>';
    function gridHtml() {
      if (!menu.length && !st.free.length) return '<p class="kps-note">' + esc(t('none')) + '</p><button class="kps-link" type="button" data-kps-free-add>+ ' + esc(t('addFree')) + '</button>';
      let cat = null;
      const f = norm(st.filter);
      const rows = menu.filter((it) => !f || norm(it.name).includes(f)).map((it) => {
        const head = it.cat !== cat ? (cat = it.cat, '<tr><td class="c" colspan="3">' + esc(it.cat || '·') + '</td></tr>') : '';
        return head + '<tr><td>' + esc(it.name) + '</td><td class="r"><input inputmode="decimal" data-kps-price="' + esc(it.id) + '" placeholder="' + esc(String(it.price)) + '" value="' + esc(st.price[it.id] || '') + '" aria-label="' + esc(t('price') + ' · ' + it.name) + '"></td>'
          + '<td class="r"><input inputmode="decimal" data-kps-qty="' + esc(it.id) + '" value="' + esc(st.qty[it.id] || '') + '" aria-label="' + esc(t('qty') + ' · ' + it.name) + '"></td></tr>';
      }).join('');
      const free = st.free.map((x, i) => '<tr><td><input class="kps-name" data-kps-free="' + i + '" data-k="name" value="' + esc(x.name) + '" placeholder="' + esc(t('freeName')) + '"></td>'
        + '<td class="r"><input inputmode="decimal" data-kps-free="' + i + '" data-k="price" value="' + esc(x.price) + '" aria-label="' + esc(t('price')) + '"></td>'
        + '<td class="r"><input inputmode="decimal" data-kps-free="' + i + '" data-k="qty" value="' + esc(x.qty) + '" aria-label="' + esc(t('qty')) + '"></td></tr>').join('');
      return '<div class="kps-row"><label style="flex:1">' + esc(t('search')) + '<input type="search" data-kps-filter value="' + esc(st.filter) + '"></label></div>'
        + '<div class="kps-scroll"><table class="kps-grid"><thead><tr><th>' + esc(t('item')) + '</th><th class="r">' + esc(t('price')) + '</th><th class="r">' + esc(t('qty')) + '</th></tr></thead><tbody>' + rows + free + '</tbody></table></div>'
        + '<button class="kps-link" type="button" data-kps-free-add>+ ' + esc(t('addFree')) + '</button>';
    }
    function fileHtml() {
      const f = st.file;
      let out = '<p class="kps-note">' + esc(t('fileHelp')) + '</p>'
        + '<div class="kps-row"><label>' + esc(t('fileDay')) + '<input type="date" data-kps-fileday max="' + esc(lastDay()) + '" value="' + esc(st.fileDay) + '"></label>' + methodSel()
        + '<button class="kb" type="button" data-kps-pick>' + esc(t('choose')) + '</button><input type="file" hidden accept=".csv,.txt,.tsv,text/csv,text/plain" data-kps-file>'
        + '<button class="kps-link" type="button" data-kps-tpl>' + esc(t('template')) + '</button></div>'
        + '<textarea class="kps-paste" data-kps-paste placeholder="' + esc(t('paste')) + '"></textarea>'
        + '<div class="kps-row" style="margin-top:8px"><button class="kb" type="button" data-kps-read>' + esc(t('read')) + '</button></div>';
      if (f && !f.ok) out += '<p class="kps-note kps-bad">' + esc(f.error === 'columns' ? t('fileHelp') : t('nothing')) + '</p>';
      if (f && f.ok) {
        out += '<p class="kps-note"><b>' + esc(t('preview', f.days.length, f.days.reduce((s, d) => s + d.lines.length, 0))) + '</b> · ' + esc(fmt(totalCents(f.days))) + '</p>'
          + '<div class="kps-scroll" style="max-height:24vh"><table class="kps-grid"><tbody>' + f.days.map((d) => '<tr><td>' + esc(dayText(d.day)) + '</td><td>' + esc(t('items', d.lines.length)) + '</td><td class="r">' + esc(fmt(totalCents([d]))) + '</td></tr>').join('') + '</tbody></table></div>';
        if (f.issues.length) out += '<p class="kps-note kps-bad">' + esc(t('issues', f.issues.length)) + ' · ' + f.issues.slice(0, 6).map((x) => esc(t('line') + ' ' + x.line + (x.name ? ' (' + x.name + ')' : '') + ' : ' + t(x.why))).join(' · ') + '</p>';
      }
      return out;
    }
    function historyHtml() {
      const days = (st.info && st.info.days) || [];
      return '<div class="kps-hist"><h4>' + esc(t('history')) + '</h4>' + (days.length
        ? '<div class="kps-scroll" style="max-height:22vh"><table class="kps-grid"><tbody>' + days.map((d) => '<tr><td>' + esc(dayText(d.day)) + '</td><td>' + esc(t('items', d.lines.length)) + ' · ' + esc(t(d.method) || d.method) + '</td><td class="r">' + esc(fmt(d.totalCents)) + '</td><td class="r"><button class="kps-link" type="button" data-kps-edit="' + esc(d.day) + '">' + esc(t('edit')) + '</button><button class="kps-link kps-bad" type="button" data-kps-del="' + esc(d.day) + '">' + esc(t('del')) + '</button></td></tr>').join('') + '</tbody></table></div>'
        : '<p class="kps-note">' + esc(t('empty')) + '</p>') + '</div>';
    }
    function render() {
      const max = lastDay();
      const limit = st.info && st.info.firstTillDay ? t('limit', dayText(max)) : t('limitNone');
      const tabs = '<div class="kps-tabs" role="tablist" data-lens-demo>' + [['day', 'tabDay'], ['period', 'tabPeriod'], ['file', 'tabFile']].map(([k, l]) => '<button type="button" role="tab" data-lens-item data-kps-tab="' + k + '" class="' + (st.tab === k ? 'on' : '') + '" aria-selected="' + (st.tab === k) + '">' + esc(t(l)) + '</button>').join('') + '</div>';
      let top = '';
      if (st.tab === 'day') top = '<div class="kps-row"><label>' + esc(t('day')) + '<input type="date" data-kps-day max="' + esc(max) + '" value="' + esc(st.day) + '"></label>' + methodSel() + '</div>';
      if (st.tab === 'period') {
        const n = st.from && st.to && st.to >= st.from ? daysBetween(st.from, st.to) : 0;
        top = '<div class="kps-row"><label>' + esc(t('from')) + '<input type="date" data-kps-from max="' + esc(max) + '" value="' + esc(st.from) + '"></label><label>' + esc(t('to')) + '<input type="date" data-kps-to max="' + esc(max) + '" value="' + esc(st.to) + '"></label>' + methodSel() + '</div>'
          + '<p class="kps-note' + (n > 92 || (st.from && st.to && st.to < st.from) ? ' kps-bad' : '') + '">' + esc(st.from && st.to && st.to < st.from ? t('order') : n > 92 ? t('tooLong') : t('spread', n || '…')) + '</p>';
      }
      body.innerHTML = tabs + '<p class="kps-note">' + esc(limit) + '</p>' + top + (st.tab === 'file' ? fileHtml() : gridHtml()) + historyHtml();
      paintFoot();
    }
    function loadDay(day) {
      st.qty = {}; st.price = {}; st.free = [];
      const saved = ((st.info && st.info.days) || []).find((d) => d.day === day);
      if (!saved) return;
      st.method = saved.method || st.method;
      const byName = new Map(menu.map((it) => [norm(it.name), it]));
      saved.lines.forEach((l) => {
        const it = byName.get(norm(l.name));
        const unit = l.qty ? l.totalCents / l.qty / 100 : 0;
        if (it) { st.qty[it.id] = String(l.qty); if (Math.abs(unit - it.price) > 0.004) st.price[it.id] = String(Math.round(unit * 100) / 100); }
        else st.free.push({ name: l.name, price: String(Math.round(unit * 100) / 100), qty: String(l.qty) });
      });
    }
    async function refresh() {
      try {
        const r = await api('GET');
        if (r.status !== 200) { body.innerHTML = '<p class="kps-note kps-bad">' + esc(r.status === 403 ? t('forbidden') : t('offline')) + '</p>'; return; }
        st.info = r.data;
      } catch (_) { body.innerHTML = '<p class="kps-note kps-bad">' + esc(t('offline')) + '</p>'; return; }
      if (!st.day) st.day = lastDay();
      render();
    }
    const toast = (msg, opts) => { try { window.Kiwi.toast(msg, opts); } catch (_) {} };
    async function send(days, okTitle) {
      saveBtn.disabled = true; saveBtn.textContent = t('saving');
      let r;
      try { r = await api('POST', { method: st.method, days }); } catch (_) { r = { status: 0, data: {} }; }
      if (r.status !== 200) { toast(t(...errorKey(r)), { type: 'error' }); paintFoot(); return false; }
      toast(okTitle || t('saved'), { type: 'success', desc: t('savedDesc', r.data.days ? r.data.days.length : days.length, fmt(r.data.totalCents || 0)) });
      await refresh();
      return true;
    }

    m.el.addEventListener('click', async (e) => {
      const tab = e.target.closest('[data-kps-tab]');
      if (tab) { st.tab = tab.getAttribute('data-kps-tab'); if (st.tab === 'day' && st.day) loadDay(st.day); render(); return; }
      if (e.target.closest('[data-kps-free-add]')) { st.free.push({ name: '', price: '', qty: '' }); render(); return; }
      if (e.target.closest('[data-kps-pick]')) { m.el.querySelector('[data-kps-file]').click(); return; }
      if (e.target.closest('[data-kps-tpl]')) {
        const ex = menu.slice(0, 2);
        /* Dish names are merchant data: a leading = + - @ would run as a formula in Excel (OWASP CSV injection). */
        const cell = (v) => { let c = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(c)) c = "'" + c; return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; };
        const csv = 'date,article,quantite,prix\n' + (ex.length ? ex : [{ name: 'Burger', price: 50 }]).map((it) => [addDays(lastDay(), -1), it.name, 10, it.price].map(cell).join(',')).join('\n') + '\n';
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
        a.download = 'ventes-anterieures.csv'; document.body.appendChild(a); a.click(); a.remove(); return;
      }
      if (e.target.closest('[data-kps-read]')) { st.file = planFromText(m.el.querySelector('[data-kps-paste]').value, menu, st.fileDay); render(); return; }
      const edit = e.target.closest('[data-kps-edit]');
      if (edit) { st.tab = 'day'; st.day = edit.getAttribute('data-kps-edit'); loadDay(st.day); render(); return; }
      const del = e.target.closest('[data-kps-del]');
      if (del) {
        const day = del.getAttribute('data-kps-del');
        if (!window.confirm(t('confirmDel', day))) return;
        await send([{ day, lines: [] }], t('removed'));
        return;
      }
      if (e.target.closest('[data-kps-save]')) {
        const p = plan();
        if (!p.length) { toast(t('nothing'), { type: 'warn' }); return; }
        await send(p);
      }
    });
    m.el.addEventListener('input', (e) => {
      const el = e.target;
      if (el.matches('[data-kps-qty]')) st.qty[el.getAttribute('data-kps-qty')] = el.value;
      else if (el.matches('[data-kps-price]')) st.price[el.getAttribute('data-kps-price')] = el.value;
      else if (el.matches('[data-kps-free]')) st.free[+el.getAttribute('data-kps-free')][el.getAttribute('data-k')] = el.value;
      else if (el.matches('[data-kps-filter]')) { st.filter = el.value; const pos = el.selectionStart; render(); const f = m.el.querySelector('[data-kps-filter]'); if (f) { f.focus(); try { f.setSelectionRange(pos, pos); } catch (_) {} } return; }
      else return;
      paintFoot();
    });
    m.el.addEventListener('change', (e) => {
      const el = e.target;
      if (el.matches('[data-kps-day]')) { st.day = el.value; loadDay(st.day); render(); }
      else if (el.matches('[data-kps-from]')) { st.from = el.value; render(); }
      else if (el.matches('[data-kps-to]')) { st.to = el.value; render(); }
      else if (el.matches('[data-kps-method]')) st.method = el.value;
      else if (el.matches('[data-kps-fileday]')) st.fileDay = el.value;
      else if (el.matches('[data-kps-file]') && el.files && el.files[0]) {
        const fr = new FileReader();
        fr.onload = () => {
          const imp = window.KiwiCatalogImport;
          const text = imp && imp._decode ? imp._decode(fr.result) : new TextDecoder().decode(fr.result);
          st.file = planFromText(text, menu, st.fileDay); render();
        };
        fr.readAsArrayBuffer(el.files[0]);
      }
    });
    refresh();
    return m;
  }

  window.KiwiPastSales = { open, spread, periodDays, planFromText, parseDay, totalCents };
  const H = window.Kiwi && window.Kiwi.handlers;
  if (H) H['past-sales-open'] = () => open();
})();
