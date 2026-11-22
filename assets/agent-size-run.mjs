/* Kiwi · l'assortiment d'un carton devient une réception de stock.
 *
 * L'assistant lit une étiquette de carton (réf. 1986-10, KHAKI, 36 à 41 :
 * 1 2 3 3 2 1, 12 paires) et le serveur rend l'assortiment structuré
 * (functions/api/ai/vision-inspect.js, entities.sizeRun). Ce module en fait
 * trois choses :
 *   · la table des tailles sur la carte de l'assistant ;
 *   · une fenêtre de réception, grille des tailles déjà remplie, qui ne demande
 *     que ce que le carton ne dit pas (prix de vente, coût, nombre de cartons) ;
 *   · l'écriture, seulement après « Confirmer » : receiveStock() sur le vrai
 *     catalogue boutique, donc un mouvement « réception » qui s'ajoute.
 * Une référence déjà au catalogue reçoit du stock, elle n'est pas créée en
 * double. Un prix absent n'est jamais un article gratuit.
 *
 * plan() et apply() sont pures par rapport au DOM : tools/agent-size-run-test.mjs
 * les exerce sur le vrai catalogue. Chargé à la demande par agent-voice.js. */

const MAX_QTY = 100000;
const key = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const whole = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isSafeInteger(Number(v)) ? Number(v) : NaN;
/* « 450,50 » comme « 450.5 » ; vide ou illisible n'est pas zéro. */
const money = (v) => {
  const s = String(v == null ? '' : v).trim().replace(/\s/g, '').replace(',', '.');
  return s !== '' && /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
};

/* Une ligne par taille, des unités entières. Tout le reste est écarté. */
export function cleanRun(rows) {
  const out = [];
  (Array.isArray(rows) ? rows : []).slice(0, 40).forEach((row) => {
    const size = String((row && row.size) == null ? '' : row.size).trim().slice(0, 12);
    const qty = whole(row && row.qty);
    if (size && qty >= 0 && qty <= MAX_QTY && !out.some((r) => r.size === size)) out.push({ size, qty });
  });
  return out;
}

export function kindOf(rows) {
  const sizes = cleanRun(rows).map((r) => r.size);
  if (sizes.length === 1 && key(sizes[0]) === 'TU') return 'tu';
  return sizes.length && sizes.every((s) => /^\d{2}([.,]5)?$/.test(s) && parseFloat(s) >= 16 && parseFloat(s) <= 50) ? 'pointure' : 'taille';
}

/* Les fiches qui portent déjà cette référence, dans leur référence commune ou
 * dans leur nom. Quatre caractères au moins : « 86 » rapprocherait n'importe quoi. */
export function findProducts(cat, reference) {
  const want = key(reference);
  if (!cat || want.length < 4) return [];
  return cat.listProducts().filter((p) => !p.archived && (key(p.sku) === want || key(p.name).includes(want)));
}

/* La couleur de l'étiquette, telle que le catalogue la rangera. La famille
 * n'est retenue que si la palette reconnaît vraiment le mot : un mot inconnu
 * retombe sur son gris par défaut, qui ne doit rapprocher aucune déclinaison. */
function colorOf(cat, label, colors) {
  const text = String(label == null ? '' : label).trim().slice(0, 40);
  if (!text) return { given: false, id: 'sans_couleur', label: 'Sans couleur', family: '' };
  const shown = text === text.toUpperCase() ? text.charAt(0) + text.slice(1).toLowerCase() : text;
  const hit = (cat.colors() || []).find((c) => key(c.label) === key(text) || key(c.id) === key(text));
  if (hit) return { given: true, id: hit.id, label: hit.label, family: hit.id };
  let family = '';
  try {
    const guess = colors && colors.normalize ? colors.normalize('', text, '') : null;
    const blank = colors && colors.normalize ? colors.normalize('', '', '') : null;
    if (guess && blank && guess.id !== blank.id) family = guess.id;
  } catch (_) { family = ''; }
  return { given: true, id: key(text).toLowerCase() || 'sans_couleur', label: shown, family };
}

/* Ce qui SERAIT écrit. Ne touche à rien. */
export function plan(cat, input, colors) {
  const fail = (error) => ({ ok: false, error });
  input = input || {};
  if (!cat) return fail('catalog');
  const cartons = whole(input.cartons == null || input.cartons === '' ? 1 : input.cartons);
  if (!(cartons >= 1 && cartons <= 500)) return fail('cartons');
  const rows = cleanRun(input.rows);
  const total = rows.reduce((sum, r) => sum + r.qty, 0) * cartons;
  if (!total) return fail('empty');
  if (total > MAX_QTY) return fail('cartons');
  const color = colorOf(cat, input.color, colors);

  const sheet = input.productId ? cat.getProduct(input.productId) : null;
  const existing = sheet ? sheet.product : null;
  if (input.productId && (!existing || existing.archived)) return fail('product');
  let name = '', priceMAD = null, cost = null;
  if (!existing) {
    name = String(input.name == null ? '' : input.name).trim().slice(0, 80);
    if (!name) return fail('name');
    priceMAD = money(input.price);
    if (!Number.isFinite(priceMAD)) return fail('price');
    const rawCost = String(input.cost == null ? '' : input.cost).trim();
    cost = rawCost === '' ? 0 : money(rawCost);
    if (!Number.isFinite(cost)) return fail('cost');
  }

  const prior = existing ? cat.listVariants(existing.id) : [];
  const lines = [];
  for (const row of rows) {
    const qty = row.qty * cartons;
    if (!qty) continue;
    const same = prior.filter((v) => String(v.size) === row.size);
    let v = null;
    if (color.given) {
      v = same.find((x) => String(x.colorId) === color.id)
        || same.find((x) => key(x.colorSource || '') === key(color.label) || key(x.colorLabel || '') === key(color.label))
        || (color.family ? same.find((x) => cat.colorFamily(x) === color.family) : null) || null;
    } else if (same.length === 1) v = same[0];
    else if (same.length > 1) return fail('color');
    const before = v ? Math.max(0, +v.stock || 0) : 0;
    lines.push({ size: row.size, qty, variantId: v ? v.id : null, before, after: before + qty });
  }
  return {
    ok: true, productId: existing ? existing.id : null, name: existing ? existing.name : name,
    priceMAD, cost, kind: kindOf(rows), colorId: color.id, colorLabel: color.label, cartons, total, lines,
  };
}

/* L'écriture : un seul geste, une seule écriture du catalogue. */
export function apply(cat, p) {
  const res = { ok: false, productId: null, received: 0, failed: [] };
  if (!cat || !p || !p.ok) return res;
  const run = () => {
    const sheet = p.productId ? cat.getProduct(p.productId) : null;
    let product = sheet ? sheet.product : null;
    if (p.productId && !product) return;
    if (!product) product = cat.addProduct({ name: p.name, priceMAD: p.priceMAD, cost: p.cost || 0, kind: p.kind });
    if (!product) return;
    res.productId = product.id;
    p.lines.forEach((line) => {
      const v = line.variantId
        ? cat.listVariants(product.id).find((x) => x.id === line.variantId)
        : (cat.ensureVariant({ productId: product.id, colorId: p.colorId, colorLabel: p.colorLabel, size: line.size }) || {}).variant;
      const done = v ? cat.receiveStock(v.id, line.qty) : null;
      if (done && done.ok) res.received += line.qty; else res.failed.push(line.size);
    });
    res.ok = res.received > 0 && res.failed.length === 0;
  };
  if (cat.batch) cat.batch(run); else run();
  return res;
}

/* ── l'écran ────────────────────────────────────────────────────────────── */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function lang() {
  try { const l = (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || document.documentElement.lang || 'fr'; return l === 'ary' ? 'ar' : l; } catch (_) { return 'fr'; }
}
const WORDS = {
  fr: {
    run: 'Assortiment de tailles', toType: 'tailles à saisir', sizes: 'Tailles du carton, séparées par un espace', pieces: (n) => n + (n > 1 ? ' pièces' : ' pièce'), ref: 'Réf.', prepare: 'Préparer la réception en stock',
    noShop: 'La réception en stock se fait depuis un magasin boutique.',
    title: 'Réception de stock', tag: 'Carton', where: 'Magasin : ',
    product: 'Article', create: 'Nouvel article', name: 'Nom de l’article', price: 'Prix de vente (MAD)', cost: 'Coût d’achat (MAD), facultatif',
    color: 'Couleur', cartons: 'Combien de cartons identiques ?', cartonsHint: 'Une seule photo suffit : la grille est multipliée par ce nombre.', less: 'Un carton de moins', more: 'Un carton de plus', size: 'Taille', qty: 'Par carton', now: 'En stock', after: 'Après',
    total: (n, c) => 'Total reçu : ' + n + (n > 1 ? ' pièces' : ' pièce') + (c > 1 ? ' (' + c + ' cartons)' : ''),
    cancel: 'Annuler', confirm: 'Confirmer la réception', nothing: 'Rien n’est écrit avant la confirmation.',
    done: (n, name) => n + (n > 1 ? ' pièces reçues' : ' pièce reçue') + ' · ' + name, failed: 'La réception n’a pas pu être écrite. Rien n’a été modifié.',
    partial: (sizes) => 'Tailles non reçues : ' + sizes + '. Vérifiez la fiche.',
    err: {
      price: 'Indiquez le prix de vente : le carton ne le donne pas.', name: 'Donnez un nom à l’article.', cartons: 'Nombre de cartons : un entier, 1 ou plus.',
      empty: 'Aucune pièce à recevoir.', cost: 'Coût d’achat illisible. Laissez vide ou corrigez.', product: 'Cette fiche n’existe plus. Choisissez-en une autre.',
      color: 'Plusieurs couleurs existent pour cette taille : indiquez la couleur du carton.', catalog: 'Catalogue indisponible. Rechargez la page.',
    },
  },
  en: {
    run: 'Size run', toType: 'sizes to enter', sizes: 'Carton sizes, separated by spaces', pieces: (n) => n + (n > 1 ? ' pieces' : ' piece'), ref: 'Ref.', prepare: 'Prepare the stock reception',
    noShop: 'Stock reception is done from a boutique shop.',
    title: 'Stock reception', tag: 'Carton', where: 'Shop: ',
    product: 'Item', create: 'New item', name: 'Item name', price: 'Selling price (MAD)', cost: 'Cost price (MAD), optional',
    color: 'Colour', cartons: 'How many identical cartons?', cartonsHint: 'One photo is enough: the grid is multiplied by this number.', less: 'One carton fewer', more: 'One carton more', size: 'Size', qty: 'Per carton', now: 'In stock', after: 'After',
    total: (n, c) => 'Total received: ' + n + (n > 1 ? ' pieces' : ' piece') + (c > 1 ? ' (' + c + ' cartons)' : ''),
    cancel: 'Cancel', confirm: 'Confirm the reception', nothing: 'Nothing is written before you confirm.',
    done: (n, name) => n + (n > 1 ? ' pieces received' : ' piece received') + ' · ' + name, failed: 'The reception could not be written. Nothing was changed.',
    partial: (sizes) => 'Sizes not received: ' + sizes + '. Check the item.',
    err: {
      price: 'Enter the selling price: the carton does not give it.', name: 'Give the item a name.', cartons: 'Number of cartons: a whole number, 1 or more.',
      empty: 'No pieces to receive.', cost: 'Unreadable cost price. Leave it empty or correct it.', product: 'This item no longer exists. Pick another one.',
      color: 'Several colours exist for this size: enter the carton’s colour.', catalog: 'Catalogue unavailable. Reload the page.',
    },
  },
  ar: {
    run: 'توزيع المقاسات', toType: 'المقاسات للإدخال', sizes: 'مقاسات الكرتون، مفصولة بمسافة', pieces: (n) => arN(n, 'قطعة واحدة', 'قطعتان', 'قطع', 'قطعة'), ref: 'المرجع', prepare: 'تجهيز استلام المخزون',
    noShop: 'استلام المخزون يتم من متجر بوتيك.',
    title: 'استلام المخزون', tag: 'كرتون', where: 'المتجر: ',
    product: 'الصنف', create: 'صنف جديد', name: 'اسم الصنف', price: 'سعر البيع (درهم)', cost: 'سعر الشراء (درهم)، اختياري',
    color: 'اللون', cartons: 'كم كرتوناً مطابقاً وصلك؟', cartonsHint: 'تكفي صورة واحدة: تُضرب الكميات في هذا العدد.', less: 'كرتون أقل', more: 'كرتون إضافي', size: 'المقاس', qty: 'في الكرتون', now: 'في المخزون', after: 'بعد الاستلام',
    total: (n, c) => 'مجموع المستلم: ' + arN(n, 'قطعة واحدة', 'قطعتان', 'قطع', 'قطعة') + (c > 1 ? ' (' + arN(c, 'كرتون واحد', 'كرتونان', 'كراتين', 'كرتوناً') + ')' : ''),
    cancel: 'إلغاء', confirm: 'تأكيد الاستلام', nothing: 'لا يُسجَّل شيء قبل التأكيد.',
    done: (n, name) => 'تم استلام ' + arN(n, 'قطعة واحدة', 'قطعتين', 'قطع', 'قطعة') + ' · ' + name, failed: 'تعذّر تسجيل الاستلام. لم يتغير شيء.',
    partial: (sizes) => 'مقاسات لم تُستلم: ' + sizes + '. راجع بطاقة الصنف.',
    err: {
      price: 'أدخل سعر البيع، فالكرتون لا يذكره.', name: 'أعطِ الصنف اسماً.', cartons: 'عدد الكراتين: رقم صحيح، 1 أو أكثر.',
      empty: 'لا توجد قطع للاستلام.', cost: 'سعر الشراء غير مقروء. اتركه فارغاً أو صحّحه.', product: 'هذه البطاقة لم تعد موجودة. اختر غيرها.',
      color: 'توجد عدة ألوان لهذا المقاس: أدخل لون الكرتون.', catalog: 'الكتالوج غير متاح. أعد تحميل الصفحة.',
    },
  },
};
const W = () => WORDS[lang()] || WORDS.fr;
/* Le nombre arabe : un, deux (duel), 3 à 10 (pluriel), puis le singulier. */
function arN(n, one, two, few, many) { return n === 1 ? one : n === 2 ? two : n % 100 >= 3 && n % 100 <= 10 ? n + ' ' + few : n + ' ' + many; }

function ensureCss() {
  if (document.getElementById('ksr-css')) return;
  const st = document.createElement('style');
  st.id = 'ksr-css';
  st.textContent = [
    '.ksr-form { display: grid; gap: 12px; }',
    '.ksr-two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }',
    '.ksr-f { display: grid; gap: 4px; font: 600 12px var(--sans); color: var(--n-500); }',
    '.ksr-in { box-sizing: border-box; width: 100%; height: 40px; padding: 0 12px; border: 1px solid var(--n-200); border-radius: 10px; background: var(--surface); color: var(--ink); font: 600 15px var(--sans); }',
    '.ksr-in:focus { outline: 0; border-color: var(--atlas); box-shadow: 0 0 0 3px color-mix(in srgb, var(--atlas) 16%, transparent); }',
    '.ksr-grid { display: grid; gap: 6px; }',
    '.ksr-row { display: grid; grid-template-columns: minmax(0, 1fr) 84px minmax(0, 1fr); align-items: center; gap: 10px; padding: 6px 10px; border: 1px solid var(--n-200); border-radius: 10px; background: var(--paper); }',
    '.ksr-row b { font: 600 14px var(--sans); color: var(--ink); }',
    '.ksr-row .ksr-in { height: 36px; text-align: center; font-variant-numeric: tabular-nums; }',
    '.ksr-then { font-size: 12px; color: var(--n-500); font-variant-numeric: tabular-nums; text-align: end; }',
    '.ksr-head { font: 600 11px var(--sans); color: var(--n-500); border: 0; background: none; padding-block: 0; }',
    '.ksr-mult { display: grid; gap: 8px; padding: 12px; border-radius: 12px; background: color-mix(in srgb, var(--atlas) 7%, var(--paper)); border: 1px solid color-mix(in srgb, var(--atlas) 22%, transparent); }',
    '.ksr-mult-q { font: 600 14px var(--sans); color: var(--ink); }',
    '.ksr-step { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }',
    '.ksr-step button { width: 44px; height: 44px; border-radius: 12px; border: 1px solid var(--n-200); background: var(--surface); color: var(--ink); font: 600 22px var(--sans); line-height: 1; cursor: pointer; }',
    '.ksr-step button:focus-visible { outline: 2px solid var(--atlas); outline-offset: 2px; }',
    '.ksr-step button:disabled { opacity: .4; cursor: default; }',
    '.ksr-step .ksr-in { width: 76px; height: 44px; text-align: center; font-size: 18px; font-variant-numeric: tabular-nums; }',
    '.ksr-sum { font: 600 13.5px var(--sans); color: var(--atlas); }',
    '.ksr-note { font-size: 12px; color: var(--n-500); margin: 0; }',
    '.ksr-msg { font-size: 12.5px; font-weight: 600; color: var(--danger); min-height: 17px; }',
    '@media (max-width: 520px) { .ksr-two { grid-template-columns: 1fr; } .ksr-row { grid-template-columns: minmax(0, 1fr) 76px minmax(0, 1fr); } }',
  ].join('\n');
  document.head.appendChild(st);
}

/* Le catalogue boutique est chargé partout au tableau de bord : c'est le type
   de l'établissement affiché qui dit si une réception a un sens ici. */
function isShop() {
  try { return !window.KiwiVenue || !window.KiwiVenue.getVenueType || window.KiwiVenue.getVenueType() === 'boutique'; } catch (_) { return true; }
}

/* La table des tailles sur la carte de l'assistant, et le bouton qui ouvre la réception. */
export function mount(el, ent) {
  if (!el) return;
  const w = W();
  const rows = cleanRun(ent && ent.sizeRun);
  /* Lue sans assortiment (22 nov. 2026), l'étiquette garde sa réception :
     la grille s'ouvre vide et les tailles se tapent dans la fenêtre. */
  if (!rows.length && !(ent && (ent.reference || ent.packQty > 0))) return;
  const total = rows.reduce((sum, r) => sum + r.qty, 0);
  const head = [ent.reference ? w.ref + ' ' + ent.reference : '', ent.color || ''].filter(Boolean).join(' · ');
  const cat = isShop() ? window.KiwiBoutiqueCatalog : null;
  el.innerHTML =
    '<div class="kv-card-items">' +
      '<div class="kv-items-title">' + esc(w.run) + ' · ' + esc(rows.length ? w.pieces(total) : w.toType) + (head ? ' · ' + esc(head) : '') + '</div>' +
      (rows.length ? '<div class="kv-items-table">' + rows.map((r) =>
        '<div class="kv-item-row" data-ksr-size="' + esc(r.size) + '"><span class="name">' + esc(r.size) + '</span><span class="qty">×' + r.qty + '</span><span class="tot"></span></div>').join('') +
      '</div>' : '') +
    '</div>' +
    (cat
      ? '<div class="kv-card-actions"><button type="button" class="kv-act-btn primary" data-ksr-open>' + esc(w.prepare) + '</button></div>'
      : '<p class="kv-res-summary">' + esc(w.noShop) + '</p>');
  const btn = el.querySelector('[data-ksr-open]');
  if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); open(ent); });
}

/* La fenêtre de réception : grille remplie, le reste à confirmer. */
export function open(ent) {
  const w = W();
  const cat = window.KiwiBoutiqueCatalog;
  const toast = (msg, type) => { try { if (window.Kiwi && window.Kiwi.toast) window.Kiwi.toast(msg, { type, force: true }); } catch (_) {} };
  if (!cat || !window.Kiwi || !window.Kiwi.modal) { toast(w.err.catalog, 'danger'); return null; }
  ensureCss();
  let rows = cleanRun(ent && ent.sizeRun);
  const manual = !rows.length;
  const rowHtml = (r) =>
    '<label class="ksr-row" data-ksr-row="' + esc(r.size) + '"><b>' + esc(r.size) + '</b>' +
    '<input class="ksr-in" data-ksr-qty="' + esc(r.size) + '" inputmode="numeric" autocomplete="off" maxlength="5" value="' + esc(r.qty) + '" aria-label="' + esc(w.size + ' ' + r.size) + '">' +
    '<span class="ksr-then" data-ksr-then></span></label>';
  const found = findProducts(cat, ent && ent.reference);
  const label = String((ent && ent.color) || '').trim();
  const shown = label && label === label.toUpperCase() ? label.charAt(0) + label.slice(1).toLowerCase() : label;
  const suggested = [ent && ent.reference, shown].filter(Boolean).join(' ');
  let venue = '';
  try { const v = window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData(); venue = (v && v.name) || ''; } catch (_) { venue = ''; }

  const m = window.Kiwi.modal({
    tag: w.tag, title: w.title, width: 560,
    body:
      '<div class="ksr-form">' +
        (venue ? '<p class="ksr-note">' + esc(w.where) + '<b>' + esc(venue) + '</b></p>' : '') +
        '<label class="ksr-f">' + esc(w.product) +
          '<select class="ksr-in" data-ksr-product>' +
            found.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join('') +
            '<option value="">' + esc(w.create) + '</option>' +
          '</select></label>' +
        '<div class="ksr-mult" role="group" aria-labelledby="ksr-mult-q">' +
          '<span class="ksr-mult-q" id="ksr-mult-q">' + esc(w.cartons) + '</span>' +
          '<div class="ksr-step">' +
            '<button type="button" data-ksr-step="-1" aria-label="' + esc(w.less) + '">−</button>' +
            '<input class="ksr-in" data-ksr-cartons inputmode="numeric" autocomplete="off" maxlength="3" value="1" aria-labelledby="ksr-mult-q">' +
            '<button type="button" data-ksr-step="1" aria-label="' + esc(w.more) + '">+</button>' +
            '<span class="ksr-sum" data-ksr-sum aria-live="polite"></span>' +
          '</div>' +
          '<span class="ksr-note">' + esc(w.cartonsHint) + '</span>' +
        '</div>' +
        '<div class="ksr-form" data-ksr-new>' +
          '<label class="ksr-f">' + esc(w.name) + '<input class="ksr-in" data-ksr-name maxlength="80" value="' + esc(suggested) + '"></label>' +
          '<div class="ksr-two">' +
            '<label class="ksr-f">' + esc(w.price) + '<input class="ksr-in" data-ksr-price inputmode="decimal" autocomplete="off" maxlength="9"></label>' +
            '<label class="ksr-f">' + esc(w.cost) + '<input class="ksr-in" data-ksr-cost inputmode="decimal" autocomplete="off" maxlength="9"></label>' +
          '</div>' +
        '</div>' +
        '<label class="ksr-f">' + esc(w.color) + '<input class="ksr-in" data-ksr-color maxlength="40" value="' + esc(shown) + '"></label>' +
        (manual ? '<label class="ksr-f">' + esc(w.sizes) + '<input class="ksr-in" data-ksr-sizes maxlength="200" autocomplete="off" placeholder="36 37 38 39 40 41"></label>' : '') +
        '<div class="ksr-grid">' +
          '<div class="ksr-row ksr-head"><span>' + esc(w.size) + '</span><span>' + esc(w.qty) + '</span><span class="ksr-then">' + esc(w.now) + ' → ' + esc(w.after) + '</span></div>' +
          '<div class="ksr-grid" data-ksr-rows>' + rows.map(rowHtml).join('') + '</div>' +
        '</div>' +
        '<div class="ksr-msg" data-ksr-msg role="alert"></div>' +
        '<p class="ksr-note">' + esc(w.nothing) + '</p>' +
      '</div>',
    foot: '<button class="kb ghost" type="button" data-dismiss>' + esc(w.cancel) + '</button>' +
      '<button class="kb atlas" type="button" data-activation="write" data-ksr-confirm>' + esc(w.confirm) + '</button>',
  });
  const el = m.el;
  const q = (sel) => el.querySelector(sel);
  const read = () => ({
    productId: q('[data-ksr-product]').value, name: q('[data-ksr-name]').value, price: q('[data-ksr-price]').value,
    cost: q('[data-ksr-cost]').value, color: q('[data-ksr-color]').value, cartons: q('[data-ksr-cartons]').value,
    rows: Array.from(el.querySelectorAll('[data-ksr-qty]')).map((box, i) => ({ size: rows[i].size, qty: box.value })),
  });
  /* L'aperçu ne bloque que sur ce qui l'empêche de compter : un prix encore
     vide n'efface pas les totaux, il sera réclamé à la confirmation. */
  function paint(said) {
    const input = read();
    q('[data-ksr-new]').hidden = !!input.productId;
    const draft = plan(cat, input.productId ? input : Object.assign({}, input, { name: input.name || '?', price: money(input.price) >= 0 ? input.price : '0', cost: '' }), window.KiwiColors);
    el.querySelectorAll('[data-ksr-row]').forEach((row) => {
      const line = draft.ok ? draft.lines.find((l) => l.size === row.getAttribute('data-ksr-row')) : null;
      row.querySelector('[data-ksr-then]').textContent = line ? line.before + ' → ' + line.after : '';
    });
    q('[data-ksr-sum]').textContent = draft.ok ? w.total(draft.total, draft.cartons) : '';
    const n = whole(input.cartons);
    q('[data-ksr-step="-1"]').disabled = !(n > 1);
    q('[data-ksr-step="1"]').disabled = n >= 500;
    q('[data-ksr-msg]').textContent = said || (draft.ok ? '' : (w.err[draft.error] || ''));
  }
  /* Le compteur : − et + bougent le nombre de cartons d'un, entre 1 et 500.
     Un champ illisible repart de 1 plutôt que de deviner. */
  el.querySelectorAll('[data-ksr-step]').forEach((b) => b.addEventListener('click', () => {
    const box = q('[data-ksr-cartons]');
    const n = whole(box.value);
    box.value = String(Math.min(500, Math.max(1, (n >= 1 ? n : 1) + Number(b.getAttribute('data-ksr-step')))));
    paint('');
  }));
  /* Les tailles tapées font la grille ; une quantité déjà saisie suit sa taille. */
  const sizesBox = q('[data-ksr-sizes]');
  if (sizesBox) sizesBox.addEventListener('input', () => {
    const typed = {};
    el.querySelectorAll('[data-ksr-qty]').forEach((box) => { typed[box.getAttribute('data-ksr-qty')] = box.value; });
    const sizes = [...new Set(sizesBox.value.split(/[\s,;/]+/).map((x) => x.trim().slice(0, 12)).filter(Boolean))].slice(0, 40);
    rows = sizes.map((size) => ({ size, qty: typed[size] == null ? '' : typed[size] }));
    q('[data-ksr-rows]').innerHTML = rows.map(rowHtml).join('');
  });
  el.addEventListener('input', () => paint(''));
  el.addEventListener('change', () => paint(''));
  q('[data-ksr-confirm]').addEventListener('click', () => {
    const p = plan(cat, read(), window.KiwiColors);
    if (!p.ok) { paint(w.err[p.error] || w.failed); return; }
    const res = apply(cat, p);
    if (!res.received) { paint(w.failed); return; }
    m.close();
    if (res.failed.length) toast(w.partial(res.failed.join(', ')), 'danger');
    else toast(w.done(res.received, p.name), 'success');
  });
  paint('');
  return m;
}
