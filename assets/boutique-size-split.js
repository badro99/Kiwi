/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · RÉPARTIR UN CARTON SUR SES TAILLES · un geste au lieu de sept cases
 * ---------------------------------------------------------------------------
 * L'écran des tailles (boutique-sizes.js) demandait d'écrire un nombre à côté
 * de chaque taille, de XXS à XXL, jusqu'à tomber juste sur la quantité totale.
 * Ce module pose au-dessus de la liste :
 *  · « Comme vos ventes » : la quantité répartie selon ce que CETTE boutique
 *    vend vraiment, taille par taille (les ventes du catalogue, même rayon
 *    d'abord, toute la boutique ensuite), ou selon son stock quand elle n'a
 *    pas encore assez vendu, ou selon la courbe la plus courante en boutique ;
 *  · « Égal » : la même chose sur chaque taille, le surplus au milieu ;
 *  · la saisie rapide : « M3 L5 XL2 », « S-XL 4 », « 38:2 39:4 », ou sept
 *    nombres dans l'ordre des tailles. Les cases se remplissent en tapant ;
 *  · le reste en un clic sur la dernière taille touchée, Annuler, et les
 *    flèches haut et bas dans une case (Maj : dix d'un coup).
 * La courbe au-dessus des cases montre la forme de la répartition avant même
 * qu'on la choisisse. Rien n'est enregistré ici : on remplit les cases, et la
 * règle de boutique-sizes.js (la somme égale le total) décide toujours.
 * Aucun service payant : tout se calcule sur l'appareil.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* La forme la plus courante d'un rayon de vêtements, puis de chaussures. */
const CLASSIC = {
  XXS: 2, XS: 6, S: 18, M: 30, L: 26, XL: 13, XXL: 5,
  36: 4, 37: 7, 38: 10, 39: 12, 40: 13, 41: 14, 42: 14, 43: 12, 44: 9, 45: 5,
};
const MIN_BASIS = 12;   // sous ce nombre de pièces, une « courbe » ne dit rien

const T = {
  fr: {
    lead: (n) => `Répartir les ${n} pièces`, leadRestock: 'Répartir', pieces: 'pièces',
    sales: 'Comme vos ventes', stock: 'Comme votre stock', classic: 'Courbe classique', even: 'Égal', undo: 'Annuler',
    whySalesCat: (n, c) => `D'après ${n} pièces vendues en ${c}.`,
    whySalesShop: (n) => `D'après ${n} pièces vendues dans la boutique.`,
    whyStock: (n) => `Pas encore assez de ventes : d'après les ${n} pièces de votre stock.`,
    whyClassic: 'Pas encore assez de ventes : la répartition la plus courante en boutique.',
    whyColorsSales: 'Les couleurs suivent aussi vos ventes.', whyColorsEven: 'Les couleurs à parts égales.',
    quick: 'Saisie rapide', quickPh: 'M3 L5 XL2  ·  noir S-XL 4',
    quickBad: (t) => `« ${t} » n'est pas compris. Écrivez par exemple M3, S-XL 4 ou 38:2.`,
    rest: (n, s) => (n === 1 ? `Mettre la pièce restante sur ${s}` : `Mettre les ${n} restantes sur ${s}`),
    over: (n) => (n === 1 ? '1 pièce de trop' : `${n} pièces de trop`),
    keys: 'Dans une case, les flèches haut et bas ajoutent ou retirent une pièce.',
    total: 'Nombre de pièces à répartir',
  },
  en: {
    lead: (n) => `Split the ${n} pieces`, leadRestock: 'Split', pieces: 'pieces',
    sales: 'Like your sales', stock: 'Like your stock', classic: 'Classic curve', even: 'Even', undo: 'Undo',
    whySalesCat: (n, c) => `Based on ${n} pieces sold in ${c}.`,
    whySalesShop: (n) => `Based on ${n} pieces sold in the shop.`,
    whyStock: (n) => `Not enough sales yet: based on the ${n} pieces in your stock.`,
    whyClassic: 'Not enough sales yet: the most common split in fashion shops.',
    whyColorsSales: 'Colours follow your sales too.', whyColorsEven: 'Colours get equal shares.',
    quick: 'Quick entry', quickPh: 'M3 L5 XL2  ·  black S-XL 4',
    quickBad: (t) => `"${t}" is not understood. Write for example M3, S-XL 4 or 38:2.`,
    rest: (n, s) => (n === 1 ? `Put the last piece on ${s}` : `Put the ${n} remaining on ${s}`),
    over: (n) => (n === 1 ? '1 piece too many' : `${n} pieces too many`),
    keys: 'In a box, the up and down arrows add or remove one piece.',
    total: 'Pieces to split',
  },
  ar: {
    lead: (n) => `توزيع ${n} قطعة`, leadRestock: 'توزيع', pieces: 'قطعة',
    sales: 'حسب مبيعاتك', stock: 'حسب مخزونك', classic: 'التوزيع المعتاد', even: 'بالتساوي', undo: 'تراجع',
    whySalesCat: (n, c) => `بناءً على ${n} قطعة مباعة في ${c}.`,
    whySalesShop: (n) => `بناءً على ${n} قطعة مباعة في المتجر.`,
    whyStock: (n) => `لا مبيعات كافية بعد: بناءً على ${n} قطعة في مخزونك.`,
    whyClassic: 'لا مبيعات كافية بعد: التوزيع الأكثر شيوعاً في المتاجر.',
    whyColorsSales: 'الألوان تتبع مبيعاتك أيضاً.', whyColorsEven: 'الألوان بحصص متساوية.',
    quick: 'إدخال سريع', quickPh: 'M3 L5 XL2  ·  أسود S-XL 4',
    quickBad: (t) => `«${t}» غير مفهوم. اكتب مثلاً M3 أو S-XL 4 أو 38:2.`,
    rest: (n, s) => `ضع ${n === 1 ? 'القطعة المتبقية' : `القطع ${n} المتبقية`} على ${s}`,
    over: (n) => `${n} قطعة زائدة`,
    keys: 'في الخانة، يضيف السهم للأعلى قطعة وينقصها السهم للأسفل.',
    total: 'عدد القطع للتوزيع',
  },
};
const words = (lang) => T[lang] || T.fr;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── Répartir un entier selon des poids (plus forts restes) ──────────────────
   La somme rendue vaut toujours `total`. À reste égal, le poids le plus fort
   passe d'abord, puis la taille la plus proche du milieu de la grille. */
export function apportion(total, weights) {
  total = Math.max(0, Math.floor(+total || 0));
  const n = weights.length;
  if (!n || !total) return new Array(n).fill(0);
  let w = weights.map((x) => Math.max(0, +x || 0));
  let sum = w.reduce((s, x) => s + x, 0);
  if (!sum) { w = w.map(() => 1); sum = n; }
  const exact = w.map((x) => (x * total) / sum);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((s, x) => s + x, 0);
  const mid = (n - 1) / 2;
  const order = exact.map((x, i) => i).filter((i) => w[i] > 0).sort((a, b) =>
    (exact[b] - out[b]) - (exact[a] - out[a]) || w[b] - w[a] || Math.abs(a - mid) - Math.abs(b - mid) || a - b);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) out[order[k]]++;
  return out;
}

/* ── D'où vient la forme ─────────────────────────────────────────────────────
   Les ventes du catalogue (soldMoves) sur les produits du même type de
   grille : le rayon du produit s'il en a assez, sinon toute la boutique ;
   puis le stock porté par taille ; puis la courbe classique.
   Rend { source: 'sales'|'stock'|'classic', scope, basis, category, weights }. */
export function curveFor(cat, pid, sizes) {
  const d = cat && cat.getProduct && cat.getProduct(pid);
  const classic = { source: 'classic', scope: '', basis: 0, category: '', weights: sizes.map((s) => CLASSIC[s] || 1) };
  if (!d) return classic;
  const kind = d.product.kind;
  const catId = d.product.categoryId;
  const vars = new Map();
  (cat.listProducts ? cat.listProducts({ includeArchived: true }) : []).forEach((p) => {
    const g = p.id === pid ? d : cat.getProduct(p.id);
    if (!g || g.product.kind !== kind) return;
    g.variants.forEach((v) => vars.set(v.id, { size: String(v.size), cat: g.product.categoryId, stock: Math.max(0, +v.stock || 0) }));
  });
  const tally = (pick) => { const t = {}; let n = 0; pick((s, q) => { if (sizes.includes(s)) { t[s] = (t[s] || 0) + q; n += q; } }); return { t, n }; };
  const moves = cat.soldMoves ? cat.soldMoves() : [];
  const sold = (only) => tally((add) => moves.forEach((m) => { const v = vars.get(m.vid); if (v && (!only || v.cat === only)) add(v.size, Math.max(0, +m.n || 0)); }));
  const shape = (source, scope, r) => ({ source, scope, basis: r.n, category: scope === 'category' ? categoryName(cat, catId) : '', weights: sizes.map((s) => r.t[s] || 0) });
  const inCat = catId ? sold(catId) : { n: 0 };
  if (inCat.n >= MIN_BASIS && categoryName(cat, catId)) return shape('sales', 'category', inCat);
  const shop = sold(null);
  if (shop.n >= MIN_BASIS) return shape('sales', 'shop', shop);
  const held = tally((add) => vars.forEach((v) => add(v.size, v.stock)));
  if (held.n >= MIN_BASIS) return shape('stock', 'shop', held);
  return classic;
}
function categoryName(cat, id) {
  if (!id || !cat.listCategories) return '';
  const c = cat.listCategories().find((x) => x.id === id);
  return c ? String(c.name || '') : '';
}

/* ── Saisie rapide ───────────────────────────────────────────────────────────
   « M3 L5 XL2 », « M:3 », « M 3 », « S-XL 4 » (4 sur chaque taille de S à XL),
   « 38:2 39x4 » pour les pointures, ou autant de nombres que de tailles, dans
   l'ordre. Une même taille deux fois s'additionne.
   Rend { map: { taille: n }, last: dernière taille nommée, bad: 'jeton incompris' | '', pending: bool }. */
const ALIAS = { '2XL': 'XXL', '2XS': 'XXS' };
export function parseQuick(text, sizes) {
  const map = {};
  let last = '';
  const raw = String(text == null ? '' : text).toUpperCase()
    .replace(/[×*]/g, 'X').replace(/\s*(?:→|>|À|TO|إلى)\s*/g, '-').replace(/\s*-\s*/g, '-').trim();
  if (!raw) return { map, last, bad: '', pending: false };
  const toks = raw.split(/[\s,;+/]+/).filter(Boolean);
  const numeric = sizes.every((s) => /^\d+$/.test(s));
  const known = sizes.concat(Object.keys(ALIAS));
  const canon = (s) => ALIAS[s] || s;
  const add = (s, n) => { s = canon(s); if (sizes.includes(s)) { map[s] = (map[s] || 0) + n; last = s; } };
  const isNum = (x) => /^\d{1,5}$/.test(x);
  if (toks.every(isNum)) {
    if (toks.length === sizes.length) { toks.forEach((x, i) => { if (+x) add(sizes[i], +x); }); return { map, last, bad: '', pending: false }; }
    const pairs = numeric && toks.every((x, i) => i % 2 || sizes.includes(x));
    if (pairs && toks.length % 2 === 0) { for (let i = 0; i < toks.length; i += 2) add(toks[i], +toks[i + 1]); return { map, last, bad: '', pending: false }; }
    if (pairs || toks.length < sizes.length) return { map: {}, last: '', bad: '', pending: true };
    return { map: {}, last: '', bad: toks[sizes.length], pending: false };
  }
  const SZ = '(' + known.slice().sort((a, b) => b.length - a.length).join('|') + ')';
  const one = new RegExp('^' + SZ + (numeric ? '[:=X]' : '[:=X]?') + '(\\d{1,5})$');
  const range = new RegExp('^' + SZ + '-' + SZ + '(?:[:=X](\\d{1,5})' + (numeric ? '' : '|(\\d{1,5})') + ')?$');
  const bare = new RegExp('^' + SZ + '$');
  const span = (a, b) => { let i = sizes.indexOf(canon(a)), j = sizes.indexOf(canon(b)); if (i > j) [i, j] = [j, i]; return sizes.slice(i, j + 1); };
  const typing = (x) => known.some((s) => s.startsWith(x.replace(/-$/, '')) || (x.endsWith('-') && s === x.slice(0, -1)));
  for (let i = 0; i < toks.length; i++) {
    const x = toks[i];
    const isLast = i === toks.length - 1;
    let m = x.match(range);
    if (m) {
      const n = m[3] || m[4] || (isNum(toks[i + 1] || '') ? toks[++i] : null);
      if (n == null) return isLast ? { map, last, bad: '', pending: true } : { map, last, bad: x, pending: false };
      span(m[1], m[2]).forEach((s) => add(s, +n));
      continue;
    }
    if ((m = x.match(one))) { add(m[1], +m[2]); continue; }
    if ((m = x.match(bare))) {
      if (isNum(toks[i + 1] || '')) { add(m[1], +toks[++i]); continue; }
      return isLast ? { map, last, bad: '', pending: true } : { map, last, bad: x, pending: false };
    }
    if (isLast && typing(x)) return { map, last, bad: '', pending: true };   // « X », « XX », « S- » : on tape encore
    return { map, last, bad: x, pending: false };
  }
  return { map, last, bad: '', pending: false };
}

/* ── Les couleurs aussi ──────────────────────────────────────────────────────
   La part de chaque couleur : ce que la boutique vend par famille de couleur
   (mêmes ventes que curveFor), si elle en a vendu assez, sinon à parts égales.
   Une couleur jamais vendue garde une petite part : on vient de la choisir.
   Rend { source: 'sales'|'even', weights: [par colonne] }. */
export function colorSharesFor(cat, cols) {
  const even = { source: 'even', weights: cols.map(() => 1) };
  if (!cat || cols.length < 2 || !cat.soldMoves || !cat.listProducts) return even;
  const fam = new Map();
  cat.listProducts({ includeArchived: true }).forEach((p) => {
    const g = cat.getProduct(p.id);
    if (g) g.variants.forEach((v) => { let f = ''; try { f = cat.colorFamily ? String(cat.colorFamily(v) || '') : ''; } catch (_) {} fam.set(v.id, f || String(v.colorId || '')); });
  });
  const t = {};
  let n = 0;
  cat.soldMoves().forEach((m) => {
    const f = fam.get(m.vid);
    if (!f || !cols.some((c) => c.family === f || c.id === f)) return;
    t[f] = (t[f] || 0) + Math.max(0, +m.n || 0); n += Math.max(0, +m.n || 0);
  });
  if (n < MIN_BASIS) return even;
  const mean = n / cols.length;
  return { source: 'sales', basis: n, weights: cols.map((c) => (t[c.family] || t[c.id] || 0) + mean * 0.2) };
}

/* ── L'interface ─────────────────────────────────────────────────────────────
   o: { root (le .kbs), cells: [{ key, size, col }], sizes: [{ size, label }],
        cols: [{ key, label, hex, light, unique }], target (0 en réception),
        lang, curve: () => curveFor(...), colorShares: () => colorSharesFor(...),
        parse(text) → { map: { 'col|taille': n }, added, last, bad, pending },
        onAddColors(familles, texte), quick (texte à reprendre après un ajout) }.
   Lit et écrit les cases [data-kbs-in] de `root` ; chaque écriture émet un
   événement input, pour que boutique-sizes.js recompte comme à la main. */
const SVG = (d) => `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON = {
  trend: 'm136-240-56-56 296-298 160 160 208-206H640v-80h240v240h-80v-104L536-320 376-480 136-240Z',
  even: 'M160-280v-120h640v120H160Zm0-280v-120h640v120H160Z',
  undo: 'M280-200v-80h284q63 0 109.5-40T720-420q0-60-46.5-100T564-560H312l104 104-56 56-200-200 200-200 56 56-104 104h252q97 0 166.5 63T800-420q0 94-69.5 157T564-200H280Z',
  bolt: 'm422-232 207-248H469l29-227-185 267h139l-30 208ZM320-80l40-280H160l360-520h80l-40 320h240L400-80h-80Zm151-390Z',
};

export function mountSplit(slot, o) {
  if (!slot || !o || !o.root || !o.cells || o.cells.length < 2) return null;
  css();
  const t = words(o.lang);
  const cells = o.cells;
  const sizes = o.sizes;
  const cols = o.cols && o.cols.length ? o.cols : [{ key: '', label: '', unique: true }];
  const multi = cols.length > 1;
  const target = Math.max(0, Math.floor(+o.target || 0));
  let shape = null;
  let shares = null;
  let undo = null;
  let lastKey = '';
  let filling = false;
  const inputs = () => cells.map((c) => o.root.querySelector(`[data-kbs-in="${CSS.escape(c.key)}"]`));
  const values = () => inputs().map((i) => (i && /^\d+$/.test(i.value.trim()) ? +i.value.trim() : 0));
  const sizeIx = (s) => sizes.findIndex((x) => x.size === s);
  const colIx = (k) => cols.findIndex((x) => x.key === k);
  const cellName = (c) => { const s = sizes[sizeIx(c.size)]; const k = cols[colIx(c.col)]; return (s ? s.label : c.size) + (multi && k && k.label ? ' ' + k.label.toLowerCase() : ''); };
  const fill = (nums, keepUndo) => {
    if (!keepUndo) undo = inputs().map((i) => (i ? i.value : ''));
    inputs().forEach((inp, k) => {
      if (!inp) return;
      const v = nums[k] > 0 ? String(nums[k]) : '';
      if (inp.value === v) return;
      inp.value = v;
      filling = true;
      try { inp.dispatchEvent(new Event('input', { bubbles: true })); } finally { filling = false; }
    });
    paint();
  };
  const totalNow = () => {
    if (target) return target;
    const f = slot.querySelector('[data-kbsp-total]');
    return f && /^\d{1,5}$/.test(f.value.trim()) ? +f.value.trim() : 0;
  };
  const cellWeights = () => cells.map((c) => {
    const sw = shape ? shape.weights[sizeIx(c.size)] || 0 : 1;
    const cw = shares ? shares.weights[colIx(c.col)] || 0 : 1;
    return sw * cw;
  });
  const chipLabel = () => (!shape ? t.classic : shape.source === 'sales' ? t.sales : shape.source === 'stock' ? t.stock : t.classic);
  const why = () => {
    if (!shape) return '';
    const a = shape.source === 'sales' ? (shape.scope === 'category' ? t.whySalesCat(shape.basis, shape.category) : t.whySalesShop(shape.basis))
      : shape.source === 'stock' ? t.whyStock(shape.basis) : t.whyClassic;
    if (!multi || !shares) return a;
    return a + ' ' + (shares.source === 'sales' ? t.whyColorsSales : t.whyColorsEven);
  };

  const strip = () => `<div class="kbsp" data-kbsp>
    <div class="kbsp-curve" data-kbsp-curve>${sizes.map((s, k) => `<button type="button" class="kbsp-bar" data-kbsp-bar="${k}" tabindex="-1" aria-hidden="true"><span class="kbsp-col"><span class="kbsp-stack">${cols.map((c) => `<i style="--c:${esc(c.unique || !c.hex ? 'var(--atlas, #0B6E4F)' : c.hex)}"${c.light ? ' class="is-light"' : ''}></i>`).join('')}</span><em></em></span><b></b><small>${esc(s.label)}</small></button>`).join('')}</div>
    <div class="kbsp-acts">
      ${target ? `<span class="kbsp-lead">${esc(t.lead(target))}</span>`
        : `<label class="kbsp-lead">${esc(t.leadRestock)} <input class="kbsp-total" data-kbsp-total type="text" inputmode="numeric" maxlength="5" placeholder="0" autocomplete="off" aria-label="${esc(t.total)}" /> ${esc(t.pieces)}</label>`}
      <button type="button" class="kbsp-chip is-main" data-kbsp-go="curve">${SVG(ICON.trend)}<span data-kbsp-curve-label></span></button>
      <button type="button" class="kbsp-chip" data-kbsp-go="even">${SVG(ICON.even)}<span>${esc(t.even)}</span></button>
      <button type="button" class="kbsp-chip is-quiet" data-kbsp-undo hidden>${SVG(ICON.undo)}<span>${esc(t.undo)}</span></button>
    </div>
    <p class="kbsp-why" data-kbsp-why></p>
    <label class="kbsp-quick">${SVG(ICON.bolt)}<span class="kbsp-ql">${esc(t.quick)}</span><input data-kbsp-quick type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(t.quickPh)}" aria-describedby="kbsp-msg" /></label>
    <p class="kbsp-msg" id="kbsp-msg" data-kbsp-msg aria-live="polite"></p>
  </div>`;
  slot.innerHTML = strip();

  /* Les formes se lisent une fois, au repos : elles parcourent le catalogue. */
  const loadShape = () => {
    try { shape = o.curve ? o.curve() : null; } catch (_) { shape = null; }
    if (!shape) shape = { source: 'classic', weights: sizes.map((s) => CLASSIC[s.size] || 1) };
    try { shares = o.colorShares ? o.colorShares() : null; } catch (_) { shares = null; }
    if (!shares) shares = { source: 'even', weights: cols.map(() => 1) };
    const lab = slot.querySelector('[data-kbsp-curve-label]');
    if (lab) lab.textContent = chipLabel();
    paint();
  };

  function paint() {
    const nums = values();
    const sum = nums.reduce((s, x) => s + x, 0);
    const total = totalNow();
    const bySize = sizes.map(() => 0);
    const seg = sizes.map(() => cols.map(() => 0));
    cells.forEach((c, k) => { const i = sizeIx(c.size), j = colIx(c.col); if (i >= 0) { bySize[i] += nums[k]; if (j >= 0) seg[i][j] += nums[k]; } });
    let ghost = sizes.map(() => 0);
    if (!sum && shape) {
      if (total) { const g = apportion(total, cellWeights()); cells.forEach((c, k) => { const i = sizeIx(c.size); if (i >= 0) ghost[i] += g[k]; }); }
      else ghost = shape.weights.slice();
    }
    const top = Math.max(1, ...(sum ? bySize : ghost));
    slot.querySelectorAll('[data-kbsp-bar]').forEach((b, i) => {
      b.style.setProperty('--g', ((sum ? 0 : ghost[i]) / top).toFixed(3));
      b.querySelectorAll('.kbsp-stack i').forEach((el, j) => { el.style.flexGrow = String(seg[i][j]); });
      b.querySelector('.kbsp-stack').style.height = ((bySize[i] / top) * 100).toFixed(1) + '%';
      b.querySelector('b').textContent = bySize[i] ? String(bySize[i]) : '';
      const lc = cells.find((c) => c.key === lastKey);
      b.classList.toggle('is-last', !!lc && lc.size === sizes[i].size);
    });
    slot.querySelector('[data-kbsp-curve]').classList.toggle('is-ghost', !sum);
    slot.querySelector('[data-kbsp-why]').textContent = why();
    slot.querySelectorAll('[data-kbsp-go]').forEach((b) => { b.disabled = !total; });
    slot.querySelector('[data-kbsp-undo]').hidden = !undo;
    const msg = slot.querySelector('[data-kbsp-msg]');
    if (msg.dataset.err) return;
    msg.innerHTML = '';
    if (!target) return;
    const lastCell = cells.find((c) => c.key === lastKey);
    if (sum < target && sum > 0 && lastCell) {
      msg.innerHTML = `<button type="button" class="kbsp-rest" data-kbsp-rest>${esc(t.rest(target - sum, cellName(lastCell)))}</button>`;
    } else if (sum > target) {
      msg.textContent = t.over(sum - target);
    }
  }

  const say = (err) => {
    const msg = slot.querySelector('[data-kbsp-msg]');
    if (err) { msg.dataset.err = '1'; msg.textContent = err; msg.classList.add('is-err'); }
    else { delete msg.dataset.err; msg.classList.remove('is-err'); paint(); }
  };

  const applyQuick = (inp, first) => {
    const r = o.parse ? o.parse(inp.value) : { map: {} };
    inp.setAttribute('aria-invalid', r.bad ? 'true' : 'false');
    if (r.bad) { say(t.quickBad(r.bad)); return; }
    say('');
    if (r.added && r.added.length && o.onAddColors) { o.onAddColors(r.added, inp.value); return; }
    if (!Object.keys(r.map).length) return;
    if (r.last) { const c = cells.find((x) => x.col === r.last.col && x.size === r.last.size); if (c) lastKey = c.key; }
    fill(cells.map((c) => r.map[c.col + '|' + c.size] || 0), !first);
  };

  slot.addEventListener('click', (e) => {
    const go = e.target.closest('[data-kbsp-go]');
    if (go) {
      const total = totalNow();
      if (!total) return;
      const w = go.getAttribute('data-kbsp-go') === 'even' ? cells.map(() => 1) : cellWeights();
      say('');
      fill(apportion(total, w));
      return;
    }
    if (e.target.closest('[data-kbsp-undo]') && undo) {
      const back = undo; undo = null;
      inputs().forEach((inp, k) => { if (inp && inp.value !== back[k]) { inp.value = back[k]; filling = true; try { inp.dispatchEvent(new Event('input', { bubbles: true })); } finally { filling = false; } } });
      paint();
      return;
    }
    if (e.target.closest('[data-kbsp-rest]')) {
      const k = cells.findIndex((c) => c.key === lastKey);
      const nums = values();
      const left = target - nums.reduce((s, x) => s + x, 0);
      if (k < 0 || left <= 0) return;
      nums[k] += left;
      fill(nums);
      const inp = inputs()[k]; if (inp) inp.focus();
      return;
    }
    const bar = e.target.closest('[data-kbsp-bar]');
    if (bar) {
      const s = sizes[+bar.getAttribute('data-kbsp-bar')];
      const k = cells.findIndex((c) => s && c.size === s.size);
      const inp = inputs()[k]; if (inp) { inp.focus(); inp.select(); }
    }
  });
  slot.addEventListener('input', (e) => {
    if (e.target.matches('[data-kbsp-total]')) { e.target.value = e.target.value.replace(/[^\d]/g, '').slice(0, 5); paint(); return; }
    if (!e.target.matches('[data-kbsp-quick]')) return;
    const first = e.target.dataset.live !== '1';
    e.target.dataset.live = '1';
    applyQuick(e.target, first);
  });
  slot.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-kbsp-quick], [data-kbsp-total]')) {
      e.preventDefault();
      const next = inputs().find((i) => i && !i.value) || inputs()[0];
      if (next) next.focus();
    }
  });
  const quick = slot.querySelector('[data-kbsp-quick]');
  quick.addEventListener('blur', () => { quick.dataset.live = ''; });

  /* Les cases elles-mêmes : la dernière touchée, et les flèches. */
  inputs().forEach((inp, k) => {
    if (!inp) return;
    inp.addEventListener('focus', () => { lastKey = cells[k].key; paint(); });
    inp.addEventListener('input', () => { if (!filling) lastKey = cells[k].key; paint(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
      const now = /^\d+$/.test(inp.value.trim()) ? +inp.value.trim() : 0;
      const v = Math.max(0, Math.min(99999, now + step));
      inp.value = v ? String(v) : '';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  paint();
  (typeof requestIdleCallback === 'function' ? requestIdleCallback : (f) => setTimeout(f, 30))(loadShape);
  /* Après l'ajout d'une couleur depuis la saisie rapide : le texte revient et
     s'applique aux nouvelles colonnes, le curseur en fin de ligne. */
  if (o.quick) {
    quick.value = o.quick;
    quick.dataset.live = '1';
    setTimeout(() => { quick.focus(); quick.setSelectionRange(quick.value.length, quick.value.length); applyQuick(quick, true); }, 0);
  }
  return { paint };
}

let cssDone = false;
function css() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const style = document.createElement('style');
  style.id = 'kiwi-boutique-size-split-css';
  style.textContent = `
.kbsp { display: grid; gap: 10px; padding: 14px 14px 12px; border: 1px solid var(--kbs-line, #E2DED4); border-radius: 14px; background: var(--kbs-card, #FBFAF6); }
.kbsp-curve { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 6px; align-items: end; height: 92px; }
.kbsp-bar { display: grid; grid-template-rows: 1fr auto auto; justify-items: center; gap: 3px; height: 100%; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.kbsp-col { position: relative; align-self: stretch; width: 100%; max-width: 34px; }
.kbsp-stack, .kbsp-col em { position: absolute; inset-inline: 0; bottom: 0; border-radius: 6px 6px 3px 3px; }
.kbsp-stack { display: flex; flex-direction: column-reverse; gap: 2px; height: 0; overflow: hidden; transition: height 260ms cubic-bezier(0.34, 1.45, 0.5, 1); }
.kbsp-stack i { display: block; flex: 0 1 0; min-height: 0; background: var(--c, var(--atlas, #0B6E4F)); transition: flex-grow 260ms ease; }
.kbsp-stack i.is-light { box-shadow: inset 0 0 0 1px rgba(10, 15, 13, .18); }
.kbsp-col em { height: calc(var(--g, 0) * 100%); border: 1.5px dashed color-mix(in srgb, var(--atlas, #0B6E4F) 45%, transparent); background: color-mix(in srgb, var(--atlas, #0B6E4F) 7%, transparent); transition: height 260ms ease; }
.kbsp-bar b { min-height: 15px; font: 600 12px/1.25 var(--sans, inherit); font-variant-numeric: tabular-nums; color: var(--ink, #0A0F0D); }
.kbsp-bar small { font: 500 11.5px/1.2 var(--sans, inherit); color: var(--n-600, #5D6661); }
.kbsp-bar.is-last small { color: var(--atlas, #0B6E4F); font-weight: 700; }
.kbsp-bar:hover .kbsp-stack { filter: brightness(.88); }
.kbsp-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.kbsp-lead { display: inline-flex; align-items: center; gap: 6px; margin-inline-end: auto; font: 600 13.5px var(--sans, inherit); color: var(--ink, #0A0F0D); }
.kbsp-total { box-sizing: border-box; width: 64px; height: 34px; padding: 0 8px; border: 1px solid var(--kbs-line, #E2DED4); border-radius: 9px; background: var(--kbs-field, #fff); color: var(--ink, #0A0F0D); font: 600 14px var(--sans, inherit); text-align: center; font-variant-numeric: tabular-nums; }
.kbsp-total:focus, .kbsp-quick input:focus { outline: 0; border-color: var(--atlas, #0B6E4F); box-shadow: 0 0 0 3px color-mix(in srgb, var(--atlas, #0B6E4F) 16%, transparent); }
.kbsp-chip { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border: 1px solid var(--kbs-line, #E2DED4); border-radius: 999px; background: var(--kbs-field, #fff); color: var(--n-700, #3E4642); font: 600 13px var(--sans, inherit); cursor: pointer; }
.kbsp-chip svg { width: 17px; height: 17px; fill: currentColor; }
.kbsp-chip.is-main { border-color: var(--atlas, #0B6E4F); color: var(--atlas, #0B6E4F); }
.kbsp-chip:hover:not(:disabled) { border-color: var(--atlas, #0B6E4F); color: var(--atlas, #0B6E4F); }
.kbsp-chip.is-quiet { border-color: transparent; background: none; color: var(--n-600, #5D6661); }
.kbsp-chip:disabled { opacity: .45; cursor: not-allowed; }
.kbsp-chip[hidden] { display: none; }
.kbsp-chip:focus-visible, .kbsp-rest:focus-visible, .kbsp-bar:focus-visible { outline: 2px solid var(--atlas, #0B6E4F); outline-offset: 2px; }
.kbsp-why { margin: -2px 0 0; font-size: 12px; line-height: 1.45; color: var(--n-600, #5D6661); }
.kbsp-why:empty { display: none; }
.kbsp-quick { display: flex; align-items: center; gap: 8px; }
.kbsp-quick svg { flex: none; width: 17px; height: 17px; fill: var(--n-500, #77807B); }
.kbsp-ql { flex: none; font: 600 12.5px var(--sans, inherit); color: var(--n-600, #5D6661); }
.kbsp-quick input { text-transform: uppercase; box-sizing: border-box; flex: 1 1 auto; min-width: 0; height: 36px; padding: 0 12px; border: 1px solid var(--kbs-line, #E2DED4); border-radius: 10px; background: var(--kbs-field, #fff); color: var(--ink, #0A0F0D); font: 600 14px var(--mono, 'JetBrains Mono', ui-monospace, monospace); letter-spacing: .02em; }
.kbsp-quick input::placeholder { font-weight: 400; color: var(--n-400, #9AA09D); }
.kbsp-quick input[aria-invalid="true"] { border-color: var(--danger, #cb5238); }
.kbsp-msg { margin: 0; min-height: 0; font-size: 12.5px; color: var(--danger, #cb5238); font-weight: 600; }
.kbsp-msg:empty { display: none; }
.kbsp-rest { padding: 0; border: 0; background: none; color: var(--atlas, #0B6E4F); font: 600 12.5px var(--sans, inherit); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
@media (prefers-reduced-motion: reduce) { .kbsp-stack, .kbsp-stack i, .kbsp-col em { transition: none; } }
@media (max-width: 560px) { .kbsp-lead { flex: 1 1 100%; } .kbsp-ql { display: none; } .kbsp-curve { height: 76px; } }`;
  document.head.appendChild(style);
}
