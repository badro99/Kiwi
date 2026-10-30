/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LES COULEURS D'UN PRODUIT BOUTIQUE · une colonne par couleur
 * ---------------------------------------------------------------------------
 * Le même hoodie arrive en noir, en bleu et en rouge. Plutôt que trois
 * produits, l'écran des tailles (boutique-sizes.js) devient une grille
 * taille × couleur : une colonne par couleur, une case par taille, un
 * code-barres par case. Le catalogue sait déjà tout cela (une déclinaison =
 * une couleur + une taille, la caisse et les étiquettes disent « Noir · M »,
 * le filtre Couleur de l'inventaire la retrouve) : ce module ne fait que
 * l'ouvrir au geste de réception.
 *
 *  · la couleur dite dans le nom (« Hoodie noir ») est choisie d'avance ;
 *  · la saisie rapide comprend les couleurs : « noir M3 L5 bleu S-XL 2 » ;
 *    une couleur tapée qui n'est pas encore là ajoute sa colonne ;
 *  · un produit sans couleur garde la couleur neutre « unique » (ONE_COLOR),
 *    que la caisse et les étiquettes taisent, comme avant.
 * Pas de nouveau nuancier : les familles de KiwiColors (cat.colors()).
 * ═══════════════════════════════════════════════════════════════════════════ */

export const UNIQUE = 'unique';
const plain = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/* Les mots qu'un vendeur écrit vraiment, en plus du nom de la famille. */
const MORE = {
  noir: ['black', 'noire'], blanc: ['white', 'blanche'], gris: ['grey', 'gray', 'grise', 'anthracite'],
  marron: ['brown', 'chocolat', 'camel'], beige: ['creme', 'ecru', 'sable'], rouge: ['red', 'bordeaux'],
  orange: [], jaune: ['yellow', 'moutarde'], vert: ['green', 'verte', 'kaki', 'khaki', 'emeraude'],
  bleu: ['blue', 'bleue', 'marine', 'navy', 'ciel'], violet: ['purple', 'violette', 'mauve', 'lilas'],
  rose: ['pink', 'fuchsia'], multi: ['multicolore', 'multicolor'],
};

export function palette(cat) {
  try { return (cat && cat.colors ? cat.colors() : []).filter((c) => c && c.id && c.hex); } catch (_) { return []; }
}
export function labelOf(c, lang) {
  if (!c) return '';
  return (lang === 'en' && c.en) || (lang === 'ar' && c.ar) || c.label || c.id;
}
function wordsOf(c) {
  return [c.id, c.label, c.en, c.ar].concat(MORE[c.id] || []).filter(Boolean).map(plain);
}
/* Le mot entier est une couleur du nuancier ? Rend la famille, sinon null. */
export function colorWord(word, pal) {
  const w = plain(word);
  if (!w) return null;
  return pal.find((c) => wordsOf(c).includes(w)) || null;
}
/* « Hoodie noir », « Robe Bleue marine » : la première couleur dite dans le nom. */
export function detect(name, pal) {
  const parts = plain(name).split(/[^a-z0-9؀-ۿ]+/).filter(Boolean);
  for (const p of parts) { const c = colorWord(p, pal); if (c && c.id !== 'multi') return c; }
  return null;
}

export const uniqueColumn = () => ({ key: UNIQUE, id: UNIQUE, family: '', label: '', hex: '', light: false, unique: true });
export function columnOf(c, lang) {
  return { key: c.id, id: c.id, family: c.id, label: labelOf(c, lang), hex: c.hex, light: !!c.light, unique: false };
}

/* Les colonnes d'un produit : ses couleurs, dans l'ordre où elles sont
   apparues ; sans déclinaison, la couleur du nom, sinon la colonne neutre. */
export function columns(cat, pid, lang, pal) {
  const d = cat.getProduct(pid);
  if (!d) return [uniqueColumn()];
  const out = [];
  d.variants.forEach((v) => {
    const id = String(v.colorId || UNIQUE);
    if (out.some((c) => c.id === id)) return;
    if (id === UNIQUE) { out.push(uniqueColumn()); return; }
    let fam = '';
    try { fam = cat.colorFamily ? String(cat.colorFamily(v) || '') : ''; } catch (_) {}
    const f = pal.find((c) => c.id === (fam || id));
    out.push({ key: id, id, family: fam || id, label: String(v.colorLabel || (f && labelOf(f, lang)) || id), hex: String(v.colorHex || (f && f.hex) || ''), light: !!(f && f.light), unique: false });
  });
  if (out.length) return out;
  const said = detect(d.product.name, pal);
  return [said ? columnOf(said, lang) : uniqueColumn()];
}

/* Les cases : chaque taille de la grille (plus celles déjà créées hors grille)
   × chaque colonne. Une case est une déclinaison existante, ou à créer. */
export function cells(cat, pid, cols, grid) {
  const d = cat.getProduct(pid);
  if (!d) return [];
  const sizes = grid.slice();
  d.variants.forEach((v) => { const s = String(v.size); if (!sizes.includes(s)) sizes.push(s); });
  const out = [];
  sizes.forEach((size) => cols.forEach((col) => {
    const v = d.variants.find((x) => String(x.colorId || UNIQUE) === col.id && String(x.size) === size) || null;
    out.push({ key: v ? v.id : `new:${col.key}:${size}`, size, col: col.key, colorId: col.id, colorLabel: col.unique ? '' : col.label, colorHex: col.unique ? '' : col.hex, variant: v });
  }));
  return out;
}

/* La saisie rapide avec des couleurs. Un mot-couleur ouvre son segment :
   « noir M3 L5 bleu S-XL 2 ». Ce qui vient avant toute couleur vaut pour
   chaque colonne. Rend { map: { 'colonne|taille': n }, added: [familles à
   ajouter], last: { col, size }, bad, pending }. `parse` est parseQuick. */
export function parseColored(text, sizes, cols, pal, parse) {
  const toks = String(text == null ? '' : text).split(/[\s,;+/]+/).filter(Boolean);
  const out = { map: {}, added: [], last: null, bad: '', pending: false };
  if (!toks.length) return out;
  const isSizeStart = (x) => sizes.some((s) => s.startsWith(x.toUpperCase()));
  const lastTok = toks[toks.length - 1];
  const partialColor = !colorWord(lastTok, pal) && !/\d/.test(lastTok) && !isSizeStart(lastTok)
    && pal.some((c) => wordsOf(c).some((w) => w.startsWith(plain(lastTok))));
  if (partialColor) { toks.pop(); out.pending = true; }
  const segs = [{ color: null, toks: [] }];
  toks.forEach((x) => { const c = colorWord(x, pal); if (c) segs.push({ color: c, toks: [] }); else segs[segs.length - 1].toks.push(x); });
  const colFor = (c) => cols.find((k) => k.id === c.id || k.family === c.id);
  for (const seg of segs) {
    if (!seg.color && !seg.toks.length) continue;
    let targets;
    if (seg.color) {
      const k = colFor(seg.color);
      if (!k && !out.added.some((a) => a.id === seg.color.id)) out.added.push(seg.color);
      targets = [k ? k.key : seg.color.id];
    } else targets = cols.map((k) => k.key);
    if (!seg.toks.length) { out.pending = true; continue; }
    const r = parse(seg.toks.join(' '), sizes);
    if (r.bad) { out.bad = r.bad; return out; }
    if (r.pending) out.pending = true;
    Object.keys(r.map).forEach((s) => targets.forEach((k) => { out.map[k + '|' + s] = (out.map[k + '|' + s] || 0) + r.map[s]; }));
    if (r.last) out.last = { col: targets[targets.length - 1], size: r.last };
  }
  return out;
}

let cssDone = false;
export function css() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const style = document.createElement('style');
  style.id = 'kiwi-boutique-size-colors-css';
  style.textContent = `
.kbc { display: grid; gap: 8px; }
.kbc-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.kbc-l { margin-inline-end: 4px; font: 600 12.5px var(--sans, inherit); color: var(--n-600, #5D6661); }
.kbc-chip { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 6px 0 8px; border: 1px solid var(--kbs-line, #E2DED4); border-radius: 999px; background: var(--kbs-field, #fff); font: 600 12.5px var(--sans, inherit); color: var(--ink, #0A0F0D); }
.kbc-chip button { display: grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: none; color: var(--n-500, #77807B); cursor: pointer; }
.kbc-chip button:hover { background: color-mix(in srgb, var(--danger, #cb5238) 12%, transparent); color: var(--danger, #cb5238); }
.kbc-chip button svg { width: 14px; height: 14px; fill: currentColor; }
.kbc-dot { width: 14px; height: 14px; flex: none; border-radius: 50%; background: var(--dot, #ccc); box-shadow: inset 0 0 0 1px rgba(10, 15, 13, .14); }
.kbc-add { display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 10px; border: 1px dashed color-mix(in srgb, var(--atlas, #0B6E4F) 55%, transparent); border-radius: 999px; background: none; color: var(--atlas, #0B6E4F); font: 600 12.5px var(--sans, inherit); cursor: pointer; }
.kbc-add svg { width: 15px; height: 15px; fill: currentColor; }
.kbc-pal { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; border: 1px solid var(--kbs-line, #E2DED4); border-radius: 12px; background: var(--kbs-field, #fff); }
.kbc-pal[hidden] { display: none; }
.kbc-sw { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px 0 6px; border: 1px solid transparent; border-radius: 999px; background: none; font: 500 12.5px var(--sans, inherit); color: var(--ink, #0A0F0D); cursor: pointer; }
.kbc-sw:hover { border-color: var(--atlas, #0B6E4F); }
.kbc-add:focus-visible, .kbc-sw:focus-visible, .kbc-chip button:focus-visible { outline: 2px solid var(--atlas, #0B6E4F); outline-offset: 2px; }
.kbm { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid var(--kbs-line, #E2DED4); border-radius: 14px; background: var(--kbs-card, #FBFAF6); overflow: hidden; }
.kbm th, .kbm td { padding: 8px 6px; border-bottom: 1px solid var(--kbs-line, #E2DED4); text-align: center; }
.kbm tr:last-child td { border-bottom: 0; }
.kbm thead th { font: 600 12.5px var(--sans, inherit); color: var(--ink, #0A0F0D); vertical-align: bottom; }
.kbm thead th small { display: block; margin-top: 2px; font: 600 11.5px var(--sans, inherit); color: var(--n-500, #77807B); font-variant-numeric: tabular-nums; }
.kbm thead .kbc-dot { display: block; margin: 0 auto 4px; width: 16px; height: 16px; }
.kbm th[scope="row"] { width: 52px; text-align: start; padding-inline-start: 14px; font: 600 14px var(--sans, inherit); }
.kbm .kbs-in { width: 100%; max-width: 74px; height: 38px; }
.kbm td small { display: block; margin-top: 3px; font-size: 11px; color: var(--n-500, #77807B); font-variant-numeric: tabular-nums; }
.kbm td small.is-out { color: var(--danger, #cb5238); }
.kbm td .kbs-del { display: block; margin: 3px auto 0; font-size: 11px; }
.kbm thead .kbm-dig { display: grid; place-items: center; width: 24px; height: 24px; font: 700 10.5px var(--mono, 'JetBrains Mono', ui-monospace, monospace); color: #fff; }
.kbm thead .kbm-dig.is-light { color: var(--ink, #0A0F0D); }
.kbm-sd { margin-inline-start: 6px; font: 600 11px var(--mono, 'JetBrains Mono', ui-monospace, monospace); color: var(--n-500, #77807B); }
.kbm-code { display: block; margin-top: 3px; font: 500 10.5px var(--mono, 'JetBrains Mono', ui-monospace, monospace); letter-spacing: .02em; color: var(--n-500, #77807B); direction: ltr; unicode-bidi: isolate; }
.kbm-code b, .kbs-code .kbm-code b { color: var(--atlas, #0B6E4F); font-weight: 700; }
.kbs-code .kbm-code { display: inline; margin: 0; font-size: 12px; }
.kbm-key { margin: 6px 2px 0; font: 500 12px var(--sans, inherit); color: var(--n-600, #5D6661); }
@media (max-width: 560px) { .kbm th, .kbm td { padding: 6px 3px; } .kbm .kbs-in { height: 36px; } }`;
  document.head.appendChild(style);
}
