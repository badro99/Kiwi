/* La caisse boutique · choisir les étiquettes à imprimer (Santos, 2 novembre 2026).
 *
 * L'imprimante d'un article imprimait d'un coup une étiquette par pièce en
 * stock (ou par pièce de la dernière réception), sans choix. Une boutique veut
 * souvent « 7 étiquettes du gris en M » et rien d'autre. Cette fenêtre montre
 * chaque couleur × taille qui a un code-barres, avec un compteur prérempli
 * (la réception pas encore imprimée, sinon le stock), et trois raccourcis :
 * tout le stock, la réception, aucune. On ajuste, on imprime exactement ça.
 *
 * Le contenu de l'étiquette (nom, prix, promo, code) reste celui de
 * labelForVariant() (pos-boutique/inventory.js) : rien n'est recalculé ici.
 * La réception est marquée imprimée dès qu'une étiquette part, comme avant. */
import * as SZ from '../boutique-sizes.js?v=23';

const MAX = 999;
const PHRASES = {
  'Étiquettes': ['Labels', 'الملصقات'],
  'Tout le stock': ['All stock', 'كل المخزون'],
  'Réception · {n}': ['Delivery · {n}', 'الاستلام · {n}'],
  'Aucune': ['None', 'لا شيء'],
  '{n} en stock': ['{n} in stock', '{n} في المخزون'],
  'Toute la couleur': ['Whole colour', 'اللون كاملاً'],
  'Imprimer {n} étiquette(s)': ['Print {n} label(s)', 'طباعة {n} ملصق'],
  'Aucune étiquette choisie': ['No label chosen', 'لم يُختر أي ملصق'],
  'Sans code-barres : générez-le sur la fiche de l’article.': ['No barcode: generate it on the item sheet.', 'بدون رمز شريطي: أنشئه في بطاقة المنتج.'],
  'Aucune taille n’a de code-barres.': ['No size has a barcode.', 'لا يوجد رمز شريطي لأي مقاس.'],
  'Nombre d’étiquettes': ['Number of labels', 'عدد الملصقات'],
  'Moins': ['Less', 'أقل'],
  'Plus': ['More', 'أكثر'],
  'Annuler': ['Cancel', 'إلغاء'],
};
const tr = (s) => {
  const C = window.KiwiCaisseLang;
  let lang = 'fr';
  try { lang = (C && C.get && C.get()) || 'fr'; } catch (_) { lang = 'fr'; }
  const own = PHRASES[s];
  if (own && (lang === 'en' || lang === 'ar')) return own[lang === 'en' ? 0 : 1];
  return C && typeof C.tr === 'function' ? C.tr(s) : s;
};
const ui = (key, vars) => Object.keys(vars).reduce((out, k) => out.split('{' + k + '}').join(String(vars[k])), tr(key));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n) => Math.max(0, Math.min(MAX, Math.floor(Number(n) || 0)));
const stockOf = (v) => Math.max(0, Math.floor(Number(v.stock) || 0));

/* o : { pid, cat, label(pid, v) → étiquette | null, print(labels), lang, start: 'rec' | 'stock', icons? } */
export function openLabelPicker(o) {
  const d = o && o.cat && o.cat.getProduct(o.pid);
  if (!d) return null;
  close();
  css();
  const rec = SZ.lastReceipt(o.pid);
  const fresh = rec && !rec.printed ? rec.got : null;
  const rows = (d.variants || []).map((v) => ({ v, label: o.label(o.pid, v) }));
  const ok = rows.filter((r) => r.label);
  /* La règle de la fiche (boutique-sizes.js › labelCounts) : les pièces
     reçues quand une réception attend, sinon le stock de chaque taille. */
  const plan = (got) => new Map(SZ.labelCounts(ok.map((r) => r.v), got).map(([v, n]) => [v.id, clamp(n)]));
  const recN = fresh ? [...plan(fresh).values()].reduce((a, b) => a + b, 0) : 0;
  const count = new Map();
  const preset = (kind) => { const m = kind === 'none' ? new Map() : plan(kind === 'rec' ? fresh : null); ok.forEach((r) => count.set(r.v.id, m.get(r.v.id) || 0)); };
  preset(o.start === 'stock' || !recN ? 'stock' : 'rec');

  /* Par couleur, dans l'ordre du catalogue. */
  const groups = [];
  rows.forEach((r) => {
    const key = String(r.v.colorId || '');
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push(g = { key, name: key === SZ.ONE_COLOR ? '' : String(r.v.colorLabel || key), rows: [] });
    g.rows.push(r);
  });
  const opener = document.activeElement;
  const veil = document.createElement('div');
  veil.className = 'blp-veil';
  veil.setAttribute('data-blp', '');
  const total = () => ok.reduce((n, r) => n + (count.get(r.v.id) || 0), 0);
  const sizeWord = (v) => (String(v.colorId) === SZ.ONE_COLOR ? SZ.variantWords(v, o.lang) : String(v.size || ''));
  const row = (r) => {
    const n = count.get(r.v.id) || 0;
    const id = esc(r.v.id);
    if (!r.label) {
      return '<div class="blp-row is-off"><span class="blp-size">' + esc(sizeWord(r.v)) + '<small>' + esc(tr('Sans code-barres : générez-le sur la fiche de l’article.')) + '</small></span></div>';
    }
    return '<div class="blp-row"><span class="blp-size">' + esc(sizeWord(r.v)) + '<small>' + esc(ui('{n} en stock', { n: stockOf(r.v) })) + '</small></span>'
      + '<span class="blp-step"><button type="button" data-blp-d="-1" data-v="' + id + '" aria-label="' + esc(tr('Moins')) + '">−</button>'
      + '<input type="number" inputmode="numeric" min="0" max="' + MAX + '" data-blp-n="' + id + '" value="' + n + '" aria-label="' + esc(tr('Nombre d’étiquettes') + ' · ' + sizeWord(r.v)) + '">'
      + '<button type="button" data-blp-d="1" data-v="' + id + '" aria-label="' + esc(tr('Plus')) + '">+</button></span></div>';
  };
  const paintTotal = () => {
    const n = total();
    const go = veil.querySelector('[data-blp-go]');
    go.disabled = !n;
    go.textContent = n ? ui('Imprimer {n} étiquette(s)', { n }) : tr('Aucune étiquette choisie');
  };
  const paintCounts = () => {
    veil.querySelectorAll('[data-blp-n]').forEach((inp) => { if (document.activeElement !== inp) inp.value = String(count.get(inp.dataset.blpN) || 0); });
    paintTotal();
  };
  const head = esc(tr('Étiquettes')) + ' · ' + esc(d.product && d.product.name || '');
  veil.innerHTML = '<div class="blp-card" role="dialog" aria-modal="true" aria-labelledby="blp-title">'
    + '<h3 id="blp-title">' + head + '</h3>'
    + '<div class="blp-presets">'
    + '<button type="button" data-blp-preset="stock">' + esc(tr('Tout le stock')) + '</button>'
    + (recN ? '<button type="button" data-blp-preset="rec">' + esc(ui('Réception · {n}', { n: recN })) + '</button>' : '')
    + '<button type="button" data-blp-preset="none">' + esc(tr('Aucune')) + '</button></div>'
    + '<div class="blp-list">' + (ok.length ? groups.map((g) => '<section class="blp-group">'
      + (g.name || groups.length > 1 ? '<div class="blp-gh"><b>' + esc(g.name) + '</b>'
        + (g.rows.some((r) => r.label) ? '<button type="button" data-blp-col="' + esc(g.key) + '">' + esc(tr('Toute la couleur')) + '</button>' : '') + '</div>' : '')
      + g.rows.map(row).join('') + '</section>').join('')
      : '<p class="blp-note">' + esc(tr('Aucune taille n’a de code-barres.')) + '</p>') + '</div>'
    + '<div class="blp-acts"><button type="button" class="blp-btn" data-blp-x>' + esc(tr('Annuler')) + '</button>'
    + '<button type="button" class="blp-btn go" data-blp-go></button></div></div>';
  document.body.appendChild(veil);
  paintTotal();

  function done() {
    veil.remove();
    document.removeEventListener('keydown', key, true);
    try { if (opener && opener.focus) opener.focus(); } catch (_) {}
  }
  function key(e) { if (e.key === 'Escape') { e.preventDefault(); done(); } }
  document.addEventListener('keydown', key, true);
  veil.addEventListener('click', (e) => {
    const t = (sel) => e.target.closest(sel);
    let b;
    if (e.target === veil || t('[data-blp-x]')) { done(); return; }
    if ((b = t('[data-blp-preset]'))) { preset(b.dataset.blpPreset); paintCounts(); return; }
    if ((b = t('[data-blp-col]'))) {
      const g = groups.find((x) => x.key === b.dataset.blpCol);
      if (g) g.rows.forEach((r) => { if (r.label) count.set(r.v.id, stockOf(r.v)); });
      paintCounts(); return;
    }
    if ((b = t('[data-blp-d]'))) {
      const vid = b.dataset.v;
      count.set(vid, clamp((count.get(vid) || 0) + Number(b.dataset.blpD)));
      const inp = veil.querySelector('[data-blp-n="' + (window.CSS && CSS.escape ? CSS.escape(vid) : vid) + '"]');
      if (inp) inp.value = String(count.get(vid));
      paintTotal(); return;
    }
    if (t('[data-blp-go]')) {
      const labels = [];
      ok.forEach((r) => { for (let k = 0; k < (count.get(r.v.id) || 0); k++) labels.push(r.label); });
      if (!labels.length) return;
      done();
      o.print(labels);
      if (fresh) SZ.markReceiptPrinted(o.pid);
    }
  });
  veil.addEventListener('input', (e) => {
    const inp = e.target.closest('[data-blp-n]');
    if (!inp) return;
    count.set(inp.dataset.blpN, clamp(inp.value));
    paintTotal();
  });
  veil.addEventListener('change', (e) => {
    const inp = e.target.closest('[data-blp-n]');
    if (inp) inp.value = String(count.get(inp.dataset.blpN) || 0);
  });
  const first = veil.querySelector('[data-blp-n]') || veil.querySelector('[data-blp-x]');
  if (first) first.focus();
  return veil;
}

function close() { const old = document.querySelector('[data-blp]'); if (old) old.remove(); }

function css() {
  if (document.getElementById('blp-css')) return;
  const s = document.createElement('style');
  s.id = 'blp-css';
  s.textContent = [
    '.blp-veil{position:fixed;inset:0;z-index:2147483000;background:rgba(10,15,13,.42);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;}',
    '.blp-card{width:min(560px,100%);max-height:calc(100vh - 32px);display:flex;flex-direction:column;gap:14px;padding:20px;box-sizing:border-box;border-radius:16px;background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D);box-shadow:0 24px 60px rgba(10,15,13,.22);font-family:inherit;}',
    '.blp-card h3{margin:0;font-size:19px;font-weight:600;letter-spacing:-.01em;}',
    '.blp-presets{display:flex;flex-wrap:wrap;gap:6px;}',
    '.blp-presets button,.blp-gh button{min-height:40px;padding:0 14px;border:1px solid var(--line,#E2DDD2);border-radius:999px;background:var(--paper-elev,#FFFDFA);font:inherit;font-size:14px;color:inherit;cursor:pointer;}',
    '.blp-list{overflow:auto;display:flex;flex-direction:column;gap:12px;min-height:0;}',
    '.blp-group{display:flex;flex-direction:column;gap:6px;}',
    '.blp-gh{display:flex;align-items:center;justify-content:space-between;gap:10px;}',
    '.blp-gh b{font-size:14px;font-weight:600;}',
    '.blp-gh button{min-height:36px;font-size:13px;}',
    '.blp-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;border:1px solid var(--line,#E2DDD2);border-radius:12px;background:var(--paper-elev,#FFFDFA);}',
    '.blp-row.is-off{opacity:.6;}',
    '.blp-size{display:flex;flex-direction:column;font-size:15px;font-weight:600;min-width:0;}',
    '.blp-size small{font-size:12px;font-weight:400;color:var(--ink-3,#6F6C65);}',
    '.blp-step{display:inline-flex;align-items:center;gap:6px;flex:none;}',
    '.blp-step button{width:44px;height:44px;border-radius:10px;border:1px solid var(--line,#E2DDD2);background:var(--paper,#F7F5F0);font:inherit;font-size:20px;color:inherit;cursor:pointer;}',
    '.blp-step input{width:56px;height:44px;box-sizing:border-box;text-align:center;border:1px solid var(--line,#E2DDD2);border-radius:10px;background:var(--paper,#F7F5F0);font:inherit;font-size:16px;font-variant-numeric:tabular-nums;color:inherit;-moz-appearance:textfield;}',
    '.blp-step input::-webkit-outer-spin-button,.blp-step input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}',
    '.blp-step input:focus{outline:2px solid var(--atlas,#0B6E4F);outline-offset:1px;}',
    '.blp-note{margin:0;font-size:13.5px;color:var(--ink-2,#3D4441);}',
    '.blp-acts{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;}',
    '.blp-btn{white-space:nowrap;min-height:46px;padding:0 18px;border-radius:12px;border:1px solid var(--line,#E2DDD2);background:var(--paper-elev,#FFFDFA);font:inherit;font-size:15px;font-weight:600;color:inherit;cursor:pointer;}',
    '.blp-btn.go{background:var(--atlas,#0B6E4F);border-color:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0);}',
    '.blp-btn[disabled]{opacity:.45;cursor:default;}',
    '@media (max-width:520px){.blp-card{padding:16px;}.blp-acts .blp-btn{flex:1 1 auto;padding:0 14px;}}',
  ].join('\n');
  document.head.appendChild(s);
}
