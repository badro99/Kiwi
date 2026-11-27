/* Stock · sourcing. Un même produit, deux fournisseurs, deux qualités
 * (Pasta Corner, 23 nov. 2026 : « Nascarpon » chez Leader Fromaggi à 96 MAD le
 * kilo, « mascapron » chez Atacadao à 24 MAD le pot). Chaque qualité reste son
 * propre article, avec son stock et ses recettes ; ce module les range sous un
 * nom de famille et met les fournisseurs en concurrence :
 *
 *   · la famille (`family` sur l'article) groupe les qualités dans le tableau
 *     du stock et les compare au kilo ou au litre. Un article compté à la pièce
 *     dit ce que pèse une pièce (`packSize`, en g ou en ml, sinon le poids de
 *     la fiche nutrition) ;
 *   · pour un article, chaque fournisseur (cartes du document de stock, plus
 *     ceux qui ont livré sans carte) donne son prix : le dernier payé au
 *     registre des réceptions, sinon le prix annoncé. Le moins cher est marqué
 *     et peut devenir le principal en un geste ;
 *   · le bon de commande rapide rappelle l'offre la moins chère et l'autre
 *     qualité de la famille.
 *
 * Un article de détail (`retail`, catalogue boutique) garde sa fiche d'avant :
 * ses fournisseurs se comparent sur la fiche produit boutique
 * (assets/boutique-sourcing.js), pas avec les cartes du document de stock.
 *
 * Hors du contrat de découpe (tools/fixtures/stock-controller/split.json) :
 * catalog.js et purchasing.js l'appellent par S.stockSourcing, stock.js par
 * stockParts.sourcing. Rien ici n'écrit hors du document de stock. */
window.KiwiStockInternal.install('sourcing', (S) => {
  'use strict';

  /* [français, anglais, arabe]. */
  const WORDS = {
    compT: ['Mise en concurrence des fournisseurs', 'Supplier competition', 'منافسة الموردين'],
    principal: ['Principal', 'Main', 'رئيسي'],
    cheapest: ['Le moins cher', 'Cheapest', 'الأرخص'],
    lastPaid: ['Payé le {d}', 'Paid on {d}', 'دُفع يوم {d}'],
    quoted: ['Prix annoncé', 'Quoted price', 'السعر المعلن'],
    noPrice: ['Pas encore de prix', 'No price yet', 'لا سعر بعد'],
    deliveries: ['{n} livraisons', '{n} deliveries', '{n} توريدات'],
    delivery1: ['1 livraison', '1 delivery', 'توريد واحد'],
    trendUp: ['en hausse de {p}', 'up {p}', 'ارتفع بـ {p}'],
    trendDown: ['en baisse de {p}', 'down {p}', 'انخفض بـ {p}'],
    gap: ['{s} est {p} moins cher que votre fournisseur principal.', '{s} is {p} cheaper than your main supplier.', '{s} أرخص بـ {p} من مورّدك الرئيسي.'],
    makeMain: ['En faire le principal', 'Make it the main supplier', 'اجعله المورّد الرئيسي'],
    mainDone: ['{s} est maintenant votre fournisseur principal pour {i}.', '{s} is now your main supplier for {i}.', '{s} هو الآن مورّدك الرئيسي لـ {i}.'],
    one: ['Un seul fournisseur pour cet article. Ajoutez-en un deuxième pour comparer les prix.', 'Only one supplier for this item. Add a second one to compare prices.', 'مورّد واحد فقط لهذا المنتج. أضف مورّداً ثانياً لمقارنة الأسعار.'],
    none: ['Aucun fournisseur pour cet article.', 'No supplier for this item yet.', 'لا يوجد مورّد لهذا المنتج.'],
    addRival: ['Ajouter un fournisseur concurrent', 'Add a competing supplier', 'أضف مورّداً منافساً'],
    famT: ['Même produit, autres qualités', 'Same product, other qualities', 'نفس المنتج، جودة أخرى'],
    thisOne: ['cet article', 'this item', 'هذا المنتج'],
    perBase: ['{p} {u}', '{p} {u}', '{p} {u}'],
    more: ['{p} plus cher', '{p} dearer', 'أغلى بـ {p}'],
    famCheapest: ['le moins cher de la famille', 'cheapest in the family', 'الأرخص في العائلة'],
    needPack: ['Combien pèse 1 {u} ?', 'How much does 1 {u} weigh?', 'كم يزن {u} واحد؟'],
    needPackVol: ['Combien contient 1 {u} ?', 'How much does 1 {u} hold?', 'كم يحتوي {u} واحد؟'],
    needPackCount: ['Combien de pièces dans 1 {u} ?', 'How many pieces in 1 {u}?', 'كم قطعة في {u} واحد؟'],
    pieces: ['unités', 'units', 'وحدات'],
    save: ['Enregistrer', 'Save', 'حفظ'],
    packBad: ['Indiquez une quantité supérieure à zéro.', 'Enter a quantity above zero.', 'أدخل كمية أكبر من صفر.'],
    noCompare: ['Unités différentes : indiquez le contenu d’une {u} pour comparer.', 'Different units: say what one {u} holds to compare.', 'وحدات مختلفة: اذكر محتوى {u} واحد للمقارنة.'],
    open: ['Voir', 'Open', 'عرض'],
    qualities: ['{n} qualités', '{n} qualities', '{n} أنواع'],
    range: ['de {a} à {b} {u}', '{a} to {b} {u}', 'من {a} إلى {b} {u}'],
    famLabel: ['Famille de produit', 'Product family', 'عائلة المنتج'],
    famHint: ['Le même produit qu’un autre article, d’une autre qualité ou d’un autre fournisseur (ex. Mascarpone). Les articles d’une famille sont comparés au kilo, au litre ou à la pièce.', 'The same product as another item, in another quality or from another supplier (e.g. Mascarpone). Items of one family are compared per kilo, per litre or per piece.', 'نفس منتج آخر بجودة أو مورّد مختلف (مثلاً ماسكاربوني). تُقارن منتجات العائلة الواحدة بالكيلو أو باللتر أو بالقطعة.'],
    famPh: ['Ex. Mascarpone', 'E.g. Mascarpone', 'مثلاً ماسكاربوني'],
    packLabel: ['Contenu d’une unité', 'What one unit holds', 'محتوى الوحدة الواحدة'],
    packHint: ['Ce que contient une unité de stock : un poids, un volume ou un nombre de pièces (une barquette de 6 pains : 6 unités).', 'What one stock unit holds: a weight, a volume or a number of pieces (a tray of 6 buns: 6 units).', 'ما تحتويه وحدة المخزون: وزن أو حجم أو عدد قطع (علبة من 6 خبزات: 6 وحدات).'],
    orderCheaper: ['Moins cher pour cet article : {s}, {p} (votre principal : {q}).', 'Cheaper for this item: {s}, {p} (your main supplier: {q}).', 'الأرخص لهذا المنتج: {s}، {p} (مورّدك الرئيسي: {q}).'],
    orderPick: ['Commander chez {s}', 'Order from {s}', 'اطلب من {s}'],
    orderFamily: ['Autre qualité : {i} chez {s}, {p} contre {q}.', 'Other quality: {i} from {s}, {p} against {q}.', 'جودة أخرى: {i} من {s}، {p} مقابل {q}.'],
    orderFamilyBare: ['Autre qualité : {i}, {p} contre {q}.', 'Other quality: {i}, {p} against {q}.', 'جودة أخرى: {i}، {p} مقابل {q}.'],
  };
  /* « le kilo », « la pièce » : l'article suit le mot ; une autre unité s'écrit « / barquette ». */
  const UNIT_WORD = { kg: ['le kilo', 'per kilo', 'لكل كيلو'], L: ['le litre', 'per litre', 'لكل لتر'], 'pièce': ['la pièce', 'per piece', 'للقطعة'] };

  const lang = () => { try { const l = S.lang(); return l === 'en' || l === 'ar' ? l : 'fr'; } catch (_) { return 'fr'; } };
  function tr(key, vars, l = lang()) {
    const w = WORDS[key];
    let s = w ? (w[l === 'en' ? 1 : l === 'ar' ? 2 : 0] || w[0]) : key;
    Object.keys(vars || {}).forEach((k) => { s = s.split('{' + k + '}').join(String(vars[k])); });
    return s;
  }
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mad = (n) => { try { return S.fmtMad(n); } catch (_) { return (Math.round(n * 100) / 100) + ' MAD'; } };
  const pct = (n) => Math.round(n) + ' %';
  const day = (ts) => { try { return S.fmtDateShort(new Date(ts).toISOString()); } catch (_) { return new Date(ts).toISOString().slice(0, 10); } };

  /* ─────────────────────────── calcul pur ─────────────────────────── */
  /* « Mascarpone », « mascarpone  », « Mascarponé » : une seule famille. */
  function familyKey(name) {
    return String(name == null ? '' : name).trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  }
  const supKey = (name) => familyKey(String(name || '').split(' · ')[0]);
  const MEASURE = { mg: ['mass', 0.001], g: ['mass', 1], kg: ['mass', 1000], ml: ['volume', 1], cl: ['volume', 10], L: ['volume', 1000], l: ['volume', 1000] };
  /* Une unité de stock qui contient des pièces (une barquette de 6 pains,
     un carton de 50 gobelets) : 'count', comparé à la pièce (27 nov. 2026). */
  const MEASURES = ['mass', 'volume', 'count'];
  const measureOf = (m) => (MEASURES.indexOf(m) !== -1 ? m : 'mass');
  /* Ce que contient une unité de stock, en g, en ml ou en pièces ; null si on ne le sait pas. */
  function baseQty(it) {
    const m = MEASURE[String(it && it.unit || '').trim()];
    if (m) return { measure: m[0], qty: m[1] };
    const pack = +(it && it.packSize);
    if (pack > 0) return { measure: measureOf(it.packMeasure), qty: pack };
    const grams = +(it && it.gramsPerUnit);
    if (grams > 0) return { measure: 'mass', qty: grams };
    return null;
  }
  const num = (v) => { const n = +v; return Number.isFinite(n) && n > 0 ? n : null; };
  /* Le choix du sélecteur « Contenu d'une unité » → grandeur et facteur. */
  const unitMeasure = (u) => (u === 'ml' || u === 'L' ? 'volume' : u === 'unité' ? 'count' : 'mass');
  const unitFactor = (u) => (u === 'kg' || u === 'L' ? 1000 : 1);

  /* Les réceptions du registre, par fournisseur : la plus récente d'abord. */
  function paidBySupplier(rows) {
    const out = new Map();
    (rows || []).forEach((r) => {
      if (!r || r.reason !== 'receipt' || !(+r.unitCost > 0)) return;
      const name = (r.meta && r.meta.supplierName) || String(r.note || '').split(' · ')[0];
      const key = supKey(name);
      if (!key) return;
      if (!out.has(key)) out.set(key, { name: String(name).trim(), list: [] });
      out.get(key).list.push({ cost: +r.unitCost, ts: +r.occurredTs || 0 });
    });
    out.forEach((v) => v.list.sort((a, b) => b.ts - a.ts));
    return out;
  }

  /* Les offres d'un article : chaque carte fournisseur, plus ceux qui ont livré
     sans carte. Le prix d'une offre est le dernier payé, sinon le prix annoncé. */
  function offersFor(cards, rows) {
    const paid = paidBySupplier(rows);
    const seen = new Set();
    const sorted = (Array.isArray(cards) ? cards : []).filter((c) => c && c.supplierName)
      .slice().sort((a, b) => (+a.rank || 99) - (+b.rank || 99));
    const out = sorted.map((c, i) => {
      const key = supKey(c.supplierName); seen.add(key);
      const list = (paid.get(key) || { list: [] }).list;
      const quoted = num(c.defaultPrice);
      return { id: String(c.id || ''), name: String(c.supplierName), principal: i === 0, quoted,
        last: list[0] || null, prev: list[1] ? list[1].cost : null, n: list.length,
        price: list[0] ? list[0].cost : quoted };
    });
    paid.forEach((v, key) => {
      if (seen.has(key)) return;
      out.push({ id: '', name: v.name, principal: false, quoted: null, last: v.list[0], prev: v.list[1] ? v.list[1].cost : null, n: v.list.length, price: v.list[0].cost });
    });
    if (out.length && !out.some((o) => o.principal)) out[0].principal = true;
    const priced = out.filter((o) => o.price > 0);
    if (priced.length >= 2) {
      const low = Math.min(...priced.map((o) => o.price));
      const hit = priced.find((o) => o.price === low);
      if (priced.some((o) => o.price > low)) hit.cheapest = true;
    }
    return out;
  }
  function principalGap(offers) {
    const main = offers.find((o) => o.principal);
    const low = offers.find((o) => o.cheapest);
    if (!main || !low || low === main || !(main.price > 0)) return null;
    return { main, low, pct: ((main.price - low.price) / main.price) * 100 };
  }

  /* Le prix d'une unité de stock : le coût de l'article, sinon la meilleure offre. */
  function unitPrice(it, offers) {
    const own = num(it && it.costPerUnit);
    if (own) return own;
    const priced = (offers || []).filter((o) => o.price > 0).map((o) => o.price);
    return priced.length ? Math.min(...priced) : null;
  }

  function membersOf(it, all) {
    const key = familyKey(it && it.family);
    if (!key) return [];
    const list = (all || []).filter((x) => x && familyKey(x.family) === key);
    return list.length >= 2 ? list : [];
  }

  /* La famille ramenée à une seule unité : le kilo, le litre, ou l'unité commune. */
  function familyView(members, priceOf) {
    if (!members || members.length < 2) return null;
    const name = String(members[0].family).trim();
    const counts = { mass: 0, volume: 0, count: 0 };
    members.forEach((m) => { const b = baseQty(m); if (b) counts[b.measure]++; });
    const top = MEASURES.reduce((a, k) => (counts[k] > counts[a] ? k : a), 'mass');
    const measure = counts[top] ? top : null;
    const units = new Set(members.map((m) => String(m.unit || '')));
    const sameUnit = units.size === 1 ? [...units][0] : '';
    const base = measure === 'mass' ? 'kg' : measure === 'volume' ? 'L' : measure === 'count' ? 'pièce' : sameUnit;
    const rows = members.map((m) => {
      const price = priceOf(m);
      let per = null; let need = false;
      if (measure) {
        const b = baseQty(m);
        if (b && b.measure === measure) per = price > 0 ? price / (measure === 'count' ? b.qty : b.qty / 1000) : null;
        else need = true;
      } else if (sameUnit) per = price > 0 ? price : null;
      else need = true;
      return { id: m.id, name: m.name, unit: m.unit, supplier: String(m.supplier || '').split(' · ')[0], price, per, need };
    });
    const priced = rows.filter((r) => r.per > 0);
    const low = priced.length ? Math.min(...priced.map((r) => r.per)) : null;
    const high = priced.length ? Math.max(...priced.map((r) => r.per)) : null;
    rows.forEach((r) => {
      r.cheapest = priced.length >= 2 && r.per === low && high > low;
      r.over = r.per > 0 && low > 0 && r.per > low ? ((r.per - low) / low) * 100 : 0;
    });
    rows.sort((a, b) => (a.per > 0 ? a.per : Infinity) - (b.per > 0 ? b.per : Infinity));
    return { name, measure, base, rows, low, high };
  }

  /* ─────────────────────── lecture du document ─────────────────────── */
  function cardsOf(it) {
    const ov = (S.stItemOverrides || {})[it.id] || {};
    if (Array.isArray(ov.suppliers) && ov.suppliers.length) return ov.suppliers;
    const raw = S.stOverlayRaw ? S.stOverlayRaw() : {};
    const sub = ((raw && raw.subcategories) || []).find((s) => s && s.id === it.id);
    if (sub && Array.isArray(sub.suppliers) && sub.suppliers.length) return sub.suppliers;
    return Array.isArray(it.suppliers) ? it.suppliers : [];
  }
  function historyOf(it) {
    try { return (window.KiwiInventory && window.KiwiInventory.history && window.KiwiInventory.history(it.id)) || []; } catch (_) { return []; }
  }
  /* Un article sans carte fournisseur mais avec un fournisseur nommé (fiche
     remplie à la main) : ce fournisseur est son offre, au coût de l’article. */
  function offersOf(it) {
    if (it && it.retail) return [];
    const cards = cardsOf(it);
    const own = !cards.length && it.supplier ? [{ id: '', supplierName: String(it.supplier), defaultPrice: it.costPerUnit, rank: 1 }] : cards;
    return offersFor(own, historyOf(it));
  }

  const priceOf = (it) => unitPrice(it, offersOf(it));
  function viewFor(it, all) { return familyView(membersOf(it, all), priceOf); }
  const baseWord = (u, l) => (UNIT_WORD[u] ? UNIT_WORD[u][l === 'en' ? 1 : l === 'ar' ? 2 : 0] : '/ ' + u);

  /* ───────────────────────────── écriture ───────────────────────────── */
  function setPrincipal(itemId, cardId) {
    const raw = S.stOverlayRaw ? S.stOverlayRaw() : null;
    const sub = raw && (raw.subcategories || []).find((s) => s && s.id === itemId);
    const ov = S.stItemOverrides[itemId] || {};
    const base = Array.isArray(ov.suppliers) && ov.suppliers.length ? ov.suppliers : ((sub && sub.suppliers) || []);
    const cards = base.map((c) => Object.assign({}, c));
    const pick = cards.find((c) => String(c.id) === String(cardId));
    if (!pick) return null;
    const rest = cards.filter((c) => c !== pick).sort((a, b) => (+a.rank || 99) - (+b.rank || 99));
    const next = [pick].concat(rest).map((c, i) => Object.assign(c, { rank: i + 1 }));
    const now = Date.now();
    if (sub) { sub.suppliers = next; sub.updatedAt = now; }
    S.stItemOverrides[itemId] = Object.assign({}, ov, { suppliers: next, supplier: pick.supplierName, updatedAt: now });
    S.stSaveOverlay();
    return pick;
  }
  function setPack(itemId, qty, measure) {
    const n = num(qty);
    if (!n) return false;
    const ov = S.stItemOverrides[itemId] || {};
    S.stItemOverrides[itemId] = Object.assign({}, ov, { packSize: Math.round(n * 1000) / 1000, packMeasure: measureOf(measure), updatedAt: Date.now() });
    S.stSaveOverlay();
    return true;
  }

  /* ─────────────────────────────── vues ─────────────────────────────── */
  const CSS = `
.st-src-badge{display:inline-flex;align-items:center;margin-inline-start:8px;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:600;line-height:1.4}
.st-src-badge.st-src-main{background:color-mix(in srgb,var(--atlas,#0b6e4f) 12%,transparent);color:var(--atlas,#0b6e4f)}
.st-src-badge.st-src-low{background:color-mix(in srgb,var(--atlas,#0b6e4f) 22%,transparent);color:var(--riad,#053b2c)}
.st-src-sub{display:block;margin-top:2px;font-size:11.5px;color:var(--n-500,#6b6b66)}
.st-src-row.is-self .n{font-weight:700}
html body:not(#kno) .st-md-list-row.st-src-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.st-src-row>div:first-child{flex:1 1 auto;min-width:0}
.st-src-row>.v{flex:0 0 auto;text-align:end}
.st-src-tail{margin-top:3px}
.st-src-tail .st-src-badge{margin:0}
.st-src-link{padding:0;border:0;background:none;font:inherit;font-weight:600;color:var(--atlas,#0b6e4f);cursor:pointer;text-align:start}
.st-src-link:hover{text-decoration:underline}
.st-src-link:focus-visible{outline:2px solid var(--atlas,#0b6e4f);outline-offset:2px;border-radius:4px}
.st-if [data-src-form] .st-src-pack{display:flex;flex-wrap:nowrap;gap:6px;margin:0}
.st-if [data-src-form] .st-src-pack .st-if-in{flex:1 1 0;min-width:0;width:auto}
.st-if [data-src-form] .st-src-pack select.st-if-in,.st-if [data-src-form] .st-src-pack .kiwi-select{flex:0 0 96px;min-width:0}
.st-if:has([data-stock-add-unit] option:checked:is([value="kg"],[value="g"],[value="mg"],[value="L"],[value="ml"],[value="cl"])) [data-src-pack-wrap]{display:none}
.st-src-gap{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:10px 0 4px}
.st-src-pack{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px}
.st-src-pack input{width:84px}
.st-src-pack select{width:auto}
.st-src-pack .kiwi-select{flex:0 0 auto;min-width:72px}
.st-src-err{flex:1 0 100%;font-size:11.5px;color:var(--danger,#9a1f1f)}
.st-src-fam td{padding:10px 14px 6px;background:color-mix(in srgb,var(--atlas,#0b6e4f) 5%,transparent);font-size:12.5px;color:var(--n-600,#4d4d48)}
.st-src-fam b{color:var(--ink,#0a0f0d);font-weight:700;margin-inline-end:8px}
.st-src-member td:first-child{padding-inline-start:26px}
.st-src-fam-dense{padding:10px 12px 4px;font-size:12.5px;color:var(--n-600,#4d4d48)}
.st-src-fam-dense b{color:var(--ink,#0a0f0d);margin-inline-end:6px}
.st-src-hint{margin:10px 0 0;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--atlas,#0b6e4f) 7%,transparent);font-size:12.5px;line-height:1.5;color:var(--ink,#0a0f0d)}
.st-src-hint p{margin:0 0 4px}
`;
  function ensureStyle() {
    if (typeof document === 'undefined' || document.getElementById('st-src-style')) return;
    const s = document.createElement('style');
    s.id = 'st-src-style';
    s.append(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(s);
  }

  function familyLine(v, l) {
    const u = baseWord(v.base, l);
    const bits = [`<b>${esc(v.name)}</b>`, esc(tr('qualities', { n: v.rows.length }, l))];
    if (v.low > 0 && v.high > v.low) bits.push(esc(tr('range', { a: mad(v.low), b: mad(v.high), u }, l)));
    else if (v.low > 0) bits.push(esc(tr('perBase', { p: mad(v.low), u }, l)));
    return bits.join(' · ');
  }

  /* Le tableau et la liste mobile : les qualités d'une famille se suivent sous
     une ligne d'en-tête, à la place du premier de ses membres dans le tri. */
  function grouped(items, all, one, head) {
    ensureStyle();
    const l = lang();
    const done = new Set();
    const out = [];
    items.forEach((it) => {
      if (done.has(it.id)) return;
      const members = membersOf(it, items);
      if (!members.length) { out.push(one(it, false)); return; }
      const v = familyView(membersOf(it, all), priceOf);
      out.push(head(familyLine(v, l)));
      members.forEach((m) => { done.add(m.id); out.push(one(m, true)); });
    });
    return out.join('');
  }
  function tableRows(items, renderRow) {
    return grouped(items, safeAll(items), (it, member) => {
      const html = renderRow(it);
      return member ? html.replace('<tr class="st-row-in">', '<tr class="st-row-in st-src-member">') : html;
    }, (line) => `<tr class="st-src-fam"><td colspan="10">${line}</td></tr>`);
  }
  function denseRows(items, renderDense) {
    return grouped(items, safeAll(items), (it) => renderDense(it), (line) => `<div class="st-src-fam-dense">${line}</div>`);
  }
  function safeAll(fallback) { try { return S.getInv() || fallback; } catch (_) { return fallback; } }

  function offerRow(o, unit, l) {
    const badges = (o.principal ? `<span class="st-src-badge st-src-main">${esc(tr('principal', null, l))}</span>` : '')
      + (o.cheapest ? `<span class="st-src-badge st-src-low">${esc(tr('cheapest', null, l))}</span>` : '');
    const subs = [];
    if (o.last) subs.push(tr('lastPaid', { d: day(o.last.ts) }, l));
    else if (o.quoted) subs.push(tr('quoted', null, l));
    if (o.n > 1) subs.push(tr('deliveries', { n: o.n }, l));
    else if (o.n === 1) subs.push(tr('delivery1', null, l));
    if (o.last && o.prev > 0 && Math.abs(o.last.cost - o.prev) / o.prev >= 0.01) {
      subs.push(tr(o.last.cost > o.prev ? 'trendUp' : 'trendDown', { p: pct(Math.abs(o.last.cost - o.prev) / o.prev * 100) }, l));
    }
    return `<div class="st-md-list-row st-src-row" data-src-offer="${esc(o.id)}">
        <div><span class="n">${esc(String(o.name).split(' · ')[0])}</span>${badges}${subs.length ? `<span class="st-src-sub">${esc(subs.join(' · '))}</span>` : ''}</div>
        <div class="v">${o.price > 0 ? `${esc(mad(o.price))} / ${esc(unit)}` : esc(tr('noPrice', null, l))}</div>
      </div>`;
  }

  function competition(it, l) {
    const offers = offersOf(it);
    const gap = principalGap(offers);
    const unit = it.unit || 'unité';
    const advice = gap && gap.pct >= 1 ? `<div class="st-notice info st-src-gap" data-src-gap>
        <span>${esc(tr('gap', { s: String(gap.low.name).split(' · ')[0], p: pct(gap.pct) }, l))}</span>
        ${gap.low.id ? `<button data-activation=write class="st-btn small" type="button" data-src-principal="${esc(gap.low.id)}">${esc(tr('makeMain', null, l))}</button>` : ''}
      </div>` : '';
    const lone = offers.length <= 1 ? `<div class="st-src-sub" style="padding:8px 4px;">${esc(tr(offers.length ? 'one' : 'none', null, l))}</div>` : '';
    return `<div class="st-md-section" data-src-competition>
        <div class="st-md-section-t">${esc(tr('compT', null, l))}</div>
        ${advice}
        <div class="st-md-list">${offers.map((o) => offerRow(o, unit, l)).join('')}</div>
        ${lone}
        <button data-activation=write class="st-btn small" type="button" data-stock-add-backup-supplier data-item-id="${esc(it.id)}" style="margin-top:8px;">
          <span>${esc(tr('addRival', null, l))}</span>
        </button>
      </div>`;
  }

  function familySection(it, all, l) {
    const v = viewFor(it, all);
    if (!v) return '';
    const u = baseWord(v.base, l);
    const rows = v.rows.map((r) => {
      const self = r.id === it.id;
      const tail = r.cheapest ? `<div class="st-src-tail"><span class="st-src-badge st-src-low">${esc(tr('famCheapest', null, l))}</span></div>`
        : (r.over >= 1 ? `<span class="st-src-sub">${esc(tr('more', { p: pct(r.over) }, l))}</span>` : '');
      const pack = r.need ? `<div class="st-src-pack" data-src-pack="${esc(r.id)}">
          <label class="st-src-sub" for="st-src-pack-${esc(r.id)}">${esc(tr(v.measure === 'volume' ? 'needPackVol' : v.measure === 'count' ? 'needPackCount' : 'needPack', { u: r.unit }, l))}</label>
          <input class="st-mb-input mono" id="st-src-pack-${esc(r.id)}" inputmode="decimal" autocomplete="off" data-src-pack-qty />
          <select class="st-mb-input" data-src-pack-unit aria-label="${esc(tr('packLabel', null, l))}">${v.measure === 'volume'
            ? '<option value="ml">ml</option><option value="L">L</option>' : v.measure === 'count' ? `<option value="unité">${esc(tr('pieces', null, l))}</option>` : '<option value="g">g</option><option value="kg">kg</option>'}</select>
          <button data-activation=write class="st-btn small" type="button" data-src-pack-save>${esc(tr('save', null, l))}</button>
          <span class="st-src-err" data-src-pack-err hidden></span>
        </div>` : '';
      return `<div class="st-md-list-row st-src-row${self ? ' is-self' : ''}">
          <div>${self ? `<span class="n">${esc(r.name)}</span>` : `<button class="st-src-link" type="button" data-src-open="${esc(r.id)}" title="${esc(tr('open', null, l))}">${esc(r.name)}</button>`}<span class="st-src-sub">${self ? esc(tr('thisOne', null, l)) + (r.supplier ? ' · ' + esc(r.supplier) : '') : esc(r.supplier)}</span>${pack}</div>
          <div class="v">${r.per > 0 ? esc(tr('perBase', { p: mad(r.per), u }, l)) : (r.price > 0 ? `${esc(mad(r.price))} / ${esc(r.unit)}` : esc(tr('noPrice', null, l)))}${tail}</div>
        </div>`;
    }).join('');
    return `<div class="st-md-section" data-src-family>
        <div class="st-md-section-t">${esc(tr('famT', null, l))} · ${esc(v.name)}</div>
        <div class="st-md-list">${rows}</div>
      </div>`;
  }

  /* La fiche article. `legacy` est le bloc « fournisseurs + mouvements » de
     movements.js (figé par le contrat de découpe) : on garde ses mouvements et
     on remplace sa liste de fournisseurs, qui ne comparait que les deux premiers. */
  function detail(it, legacy) {
    if (it && it.retail) return String(legacy || '');
    ensureStyle();
    const l = lang();
    let rest = String(legacy || '');
    const cut = rest.indexOf('<div class="st-md-section-t">Historique des mouvements</div>');
    if (cut > 0) {
      const start = rest.lastIndexOf('<div class="st-md-section">', cut);
      rest = start >= 0 ? rest.slice(start) : rest;
    }
    return familySection(it, safeAll([it]), l) + competition(it, l) + rest;
  }

  function wireDetail(scope, it, hooks) {
    if (!scope) return;
    const l = lang();
    scope.querySelectorAll('[data-src-principal]').forEach((b) => b.addEventListener('click', () => {
      const id = b.getAttribute('data-src-principal');
      const pick = setPrincipal(it.id, id);
      if (!pick) return;
      try { window.Kiwi.toast(tr('mainDone', { s: String(pick.supplierName).split(' · ')[0], i: it.name }, l), { type: 'success' }); } catch (_) {}
      hooks.reopen(it.id);
    }));
    scope.querySelectorAll('[data-src-open]').forEach((b) => b.addEventListener('click', () => hooks.reopen(b.getAttribute('data-src-open'))));
    scope.querySelectorAll('[data-src-pack]').forEach((box) => {
      const save = () => {
        const qty = String(box.querySelector('[data-src-pack-qty]').value || '').replace(',', '.');
        const u = box.querySelector('[data-src-pack-unit]').value;
        const err = box.querySelector('[data-src-pack-err]');
        const n = num(qty);
        if (!n) { err.textContent = tr('packBad', null, l); err.hidden = false; return; }
        setPack(box.getAttribute('data-src-pack'), n * unitFactor(u), unitMeasure(u));
        hooks.reopen(it.id);
      };
      box.querySelector('[data-src-pack-save]').addEventListener('click', save);
      box.querySelector('[data-src-pack-qty]').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    });
  }

  /* Le formulaire d'article : la famille et le contenu d'une pièce. */
  function formField(existing, all) {
    ensureStyle();
    const l = lang();
    const names = [...new Set((all || []).map((x) => String(x && x.family || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    const pack = num(existing && existing.packSize);
    const measure = measureOf(existing && existing.packMeasure);
    const vol = measure === 'volume', cnt = measure === 'count';
    const kilo = !cnt && pack && pack >= 1000 && pack % 100 === 0;
    const shown = pack ? (kilo ? pack / 1000 : pack) : '';
    const opt = (v, on, label) => `<option value="${v}"${on ? ' selected' : ''}>${esc(label || v)}</option>`;
    return `<div class="st-if-grid" data-src-form>
        <label class="st-if-f">
          <span class="st-if-l">${esc(tr('famLabel', null, l))}</span>
          <input class="st-if-in" type="text" maxlength="60" autocomplete="off" list="st-src-families" placeholder="${esc(tr('famPh', null, l))}" value="${esc((existing && existing.family) || '')}" data-src-family />
          <datalist id="st-src-families">${names.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
          <span class="st-if-hint">${esc(tr('famHint', null, l))}</span>
        </label>
        <div class="st-if-f" data-src-pack-wrap>
          <label class="st-if-l" for="st-src-pack-form">${esc(tr('packLabel', null, l))}</label>
          <span class="st-src-pack">
            <input class="st-if-in" id="st-src-pack-form" inputmode="decimal" autocomplete="off" value="${esc(shown)}" data-src-pack-form />
            <select class="st-if-in" data-src-pack-form-unit aria-label="${esc(tr('packLabel', null, l))}">${opt('g', !vol && !cnt && !kilo)}${opt('kg', !vol && !cnt && kilo)}${opt('ml', vol && !kilo)}${opt('L', vol && kilo)}${opt('unité', cnt, tr('pieces', null, l))}</select>
          </span>
          <span class="st-if-hint">${esc(tr('packHint', null, l))}</span>
        </div>
      </div>`;
  }
  /* Ce que le formulaire ajoute à l'article. Un champ vidé efface. */
  function readForm(scope) {
    const box = scope && scope.querySelector('[data-src-form]');
    if (!box) return {};
    const family = String(box.querySelector('[data-src-family]').value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const raw = String(box.querySelector('[data-src-pack-form]').value || '').replace(',', '.').trim();
    const u = box.querySelector('[data-src-pack-form-unit]').value;
    const n = num(raw);
    return {
      family,
      packSize: n ? Math.round(n * unitFactor(u) * 1000) / 1000 : null,
      packMeasure: unitMeasure(u),
    };
  }

  /* Le bon de commande rapide : l'offre la moins chère, l'autre qualité. */
  function orderHint(it) {
    if (it && it.retail) return '';
    ensureStyle();
    const l = lang();
    const lines = [];
    const gap = principalGap(offersOf(it));
    const unit = it.unit || 'unité';
    if (gap && gap.pct >= 1) {
      const s = String(gap.low.name).split(' · ')[0];
      lines.push(`<p>${esc(tr('orderCheaper', { s, p: `${mad(gap.low.price)} / ${unit}`, q: `${mad(gap.main.price)} / ${unit}` }, l))}</p>`
        + `<button class="st-btn small" type="button" data-src-order-pick="${esc(s)}">${esc(tr('orderPick', { s }, l))}</button>`);
    }
    const v = viewFor(it, safeAll([it]));
    const self = v && v.rows.find((r) => r.id === it.id);
    const low = v && v.rows.find((r) => r.cheapest);
    if (self && low && low.id !== self.id && self.per > 0) {
      const u = baseWord(v.base, l);
      lines.push(`<p>${esc(tr(low.supplier ? 'orderFamily' : 'orderFamilyBare', { i: low.name, s: low.supplier, p: tr('perBase', { p: mad(low.per), u }, l), q: tr('perBase', { p: mad(self.per), u }, l) }, l))}</p>`);
    }
    return lines.length ? `<div class="st-src-hint" data-src-order>${lines.join('')}</div>` : '';
  }
  /* Choisir le fournisseur conseillé dans la liste du bon de commande. */
  function wireOrder(scope, select, onChange) {
    if (!scope) return;
    scope.querySelectorAll('[data-src-order-pick]').forEach((b) => {
      /* Pas de liste, ou ce fournisseur n'y est pas : le bouton ne ferait rien, il part. */
      const has = select && [...select.options].some((o) => supKey(o.textContent) === supKey(b.getAttribute('data-src-order-pick')));
      if (!has) b.remove();
    });
    if (!select) return;
    scope.querySelectorAll('[data-src-order-pick]').forEach((b) => b.addEventListener('click', () => {
      const want = supKey(b.getAttribute('data-src-order-pick'));
      const opt = [...select.options].find((o) => supKey(o.textContent) === want);
      if (!opt) return;
      select.value = opt.value;
      if (onChange) onChange();
    }));
  }

  return { familyKey, baseQty, offersFor, principalGap, unitPrice, familyView, membersOf,
    tableRows, denseRows, detail, wireDetail, formField, readForm, orderHint, wireOrder, setPrincipal, setPack, tr };
});
