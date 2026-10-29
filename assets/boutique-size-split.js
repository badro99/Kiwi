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
    quick: 'Saisie rapide', quickPh: 'M3 L5 XL2  ·  S-XL 4',
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
    quick: 'Quick entry', quickPh: 'M3 L5 XL2  ·  S-XL 4',
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
    quick: 'إدخال سريع', quickPh: 'M3 L5 XL2  ·  S-XL 4',
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

/* ── L'interface ─────────────────────────────────────────────────────────────
   o: { root (le .kbs), rows: [{ key, size, label }], target (0 en réception),
        lang, curve: () => curveFor(...) }.
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
  if (!slot || !o || !o.root || !o.rows || o.rows.length < 2) return null;
  css();
  const t = words(o.lang);
  const rows = o.rows;
  const target = Math.max(0, Math.floor(+o.target || 0));
  let shape = null;
  let undo = null;
  let lastKey = '';
  let filling = false;
  const inputs = () => rows.map((r) => o.root.querySelector(`[data-kbs-in="${CSS.escape(r.key)}"]`));
  const values = () => inputs().map((i) => (i && /^\d+$/.test(i.value.trim()) ? +i.value.trim() : 0));
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
  const chipLabel = () => (!shape ? t.classic : shape.source === 'sales' ? t.sales : shape.source === 'stock' ? t.stock : t.classic);
  const why = () => {
    if (!shape) return '';
    if (shape.source === 'sales') return shape.scope === 'category' ? t.whySalesCat(shape.basis, shape.category) : t.whySalesShop(shape.basis);
    return shape.source === 'stock' ? t.whyStock(shape.basis) : t.whyClassic;
  };

  slot.innerHTML = `<div class="kbsp" data-kbsp>
    <div class="kbsp-curve" data-kbsp-curve>${rows.map((r, k) => `<button type="button" class="kbsp-bar" data-kbsp-bar="${k}" tabindex="-1" aria-hidden="true"><span class="kbsp-col"><i></i><em></em></span><b></b><small>${esc(r.label)}</small></button>`).join('')}</div>
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

  /* La forme se lit une fois, au repos : elle parcourt le catalogue. */
  const loadShape = () => {
    try { shape = o.curve ? o.curve() : null; } catch (_) { shape = null; }
    if (!shape) shape = { source: 'classic', weights: rows.map((r) => CLASSIC[r.size] || 1) };
    slot.querySelector('[data-kbsp-curve-label]').textContent = chipLabel();
    paint();
  };

  function paint() {
    const nums = values();
    const sum = nums.reduce((s, x) => s + x, 0);
    const total = totalNow();
    const ghost = shape && total ? apportion(total, shape.weights) : (shape ? shape.weights : rows.map(() => 0));
    const top = Math.max(1, ...nums, ...ghost);
    slot.querySelectorAll('[data-kbsp-bar]').forEach((b, k) => {
      b.style.setProperty('--h', (nums[k] / top).toFixed(3));
      b.style.setProperty('--g', ((sum ? 0 : ghost[k]) / top).toFixed(3));
      b.querySelector('b').textContent = nums[k] ? String(nums[k]) : '';
      b.classList.toggle('is-last', rows[k].key === lastKey);
    });
    slot.querySelector('[data-kbsp-curve]').classList.toggle('is-ghost', !sum);
    const whyEl = slot.querySelector('[data-kbsp-why]');
    whyEl.textContent = why();
    slot.querySelectorAll('[data-kbsp-go]').forEach((b) => { b.disabled = !total; });
    slot.querySelector('[data-kbsp-undo]').hidden = !undo;
    const msg = slot.querySelector('[data-kbsp-msg]');
    if (msg.dataset.err) return;
    msg.innerHTML = '';
    if (!target) return;
    const lastRow = rows.find((r) => r.key === lastKey);
    if (sum < target && sum > 0 && lastRow) {
      msg.innerHTML = `<button type="button" class="kbsp-rest" data-kbsp-rest>${esc(t.rest(target - sum, lastRow.label))}</button>`;
    } else if (sum > target) {
      msg.textContent = t.over(sum - target);
    }
  }

  const say = (err) => {
    const msg = slot.querySelector('[data-kbsp-msg]');
    if (err) { msg.dataset.err = '1'; msg.textContent = err; msg.classList.add('is-err'); }
    else { delete msg.dataset.err; msg.classList.remove('is-err'); paint(); }
  };

  slot.addEventListener('click', (e) => {
    const go = e.target.closest('[data-kbsp-go]');
    if (go) {
      const total = totalNow();
      if (!total) return;
      const w = go.getAttribute('data-kbsp-go') === 'even' ? rows.map(() => 1) : shape.weights;
      say('');
      fill(apportion(total, w));
      return;
    }
    if (e.target.closest('[data-kbsp-undo]') && undo) {
      const back = undo; undo = null;
      inputs().forEach((inp, k) => { if (inp && inp.value !== back[k]) { inp.value = back[k]; inp.dispatchEvent(new Event('input', { bubbles: true })); } });
      paint();
      return;
    }
    if (e.target.closest('[data-kbsp-rest]')) {
      const k = rows.findIndex((r) => r.key === lastKey);
      const nums = values();
      const left = target - nums.reduce((s, x) => s + x, 0);
      if (k < 0 || left <= 0) return;
      nums[k] += left;
      fill(nums);
      const inp = inputs()[k]; if (inp) inp.focus();
      return;
    }
    const bar = e.target.closest('[data-kbsp-bar]');
    if (bar) { const inp = inputs()[+bar.getAttribute('data-kbsp-bar')]; if (inp) { inp.focus(); inp.select(); } }
  });
  slot.addEventListener('input', (e) => {
    if (e.target.matches('[data-kbsp-total]')) { e.target.value = e.target.value.replace(/[^\d]/g, '').slice(0, 5); paint(); return; }
    if (!e.target.matches('[data-kbsp-quick]')) return;
    const r = parseQuick(e.target.value, rows.map((x) => x.size));
    e.target.setAttribute('aria-invalid', r.bad ? 'true' : 'false');
    if (r.bad) { say(t.quickBad(r.bad)); return; }
    say('');
    if (!Object.keys(r.map).length) return;
    const first = !undo || e.target.dataset.live !== '1';
    e.target.dataset.live = '1';
    const named = rows.find((x) => x.size === r.last);
    if (named) lastKey = named.key;
    fill(rows.map((x) => r.map[x.size] || 0), !first);
  });
  slot.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-kbsp-quick], [data-kbsp-total]')) {
      e.preventDefault();
      const next = inputs().find((i) => i && !i.value) || inputs()[0];
      if (next) next.focus();
    }
  });
  slot.querySelector('[data-kbsp-quick]').addEventListener('blur', (e) => { e.target.dataset.live = ''; });

  /* Les cases elles-mêmes : la dernière touchée, et les flèches. */
  inputs().forEach((inp, k) => {
    if (!inp) return;
    inp.addEventListener('focus', () => { lastKey = rows[k].key; paint(); });
    inp.addEventListener('input', () => { if (!filling) lastKey = rows[k].key; paint(); });
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
  return { paint };
}

let cssDone = false;
function css() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'kiwi-boutique-size-split-css';
  st.textContent = `
.kbsp { display: grid; gap: 10px; padding: 14px 14px 12px; border: 1px solid var(--kbs-line, #E2DED4); border-radius: 14px; background: var(--kbs-card, #FBFAF6); }
.kbsp-curve { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 6px; align-items: end; height: 92px; }
.kbsp-bar { display: grid; grid-template-rows: 1fr auto auto; justify-items: center; gap: 3px; height: 100%; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.kbsp-col { position: relative; align-self: stretch; width: 100%; max-width: 34px; }
.kbsp-col i, .kbsp-col em { position: absolute; inset-inline: 0; bottom: 0; border-radius: 6px 6px 3px 3px; }
.kbsp-col i { height: calc(var(--h, 0) * 100%); background: var(--atlas, #0B6E4F); transition: height 260ms cubic-bezier(0.34, 1.45, 0.5, 1); }
.kbsp-col em { height: calc(var(--g, 0) * 100%); border: 1.5px dashed color-mix(in srgb, var(--atlas, #0B6E4F) 45%, transparent); background: color-mix(in srgb, var(--atlas, #0B6E4F) 7%, transparent); transition: height 260ms ease; }
.kbsp-bar b { min-height: 15px; font: 600 12px/1.25 var(--sans, inherit); font-variant-numeric: tabular-nums; color: var(--ink, #0A0F0D); }
.kbsp-bar small { font: 500 11.5px/1.2 var(--sans, inherit); color: var(--n-600, #5D6661); }
.kbsp-bar.is-last small { color: var(--atlas, #0B6E4F); font-weight: 700; }
.kbsp-bar:hover i { background: var(--riad, #053B2C); }
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
@media (prefers-reduced-motion: reduce) { .kbsp-col i, .kbsp-col em { transition: none; } }
@media (max-width: 560px) { .kbsp-lead { flex: 1 1 100%; } .kbsp-ql { display: none; } .kbsp-curve { height: 76px; } }`;
  document.head.appendChild(st);
}
