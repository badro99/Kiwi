/* Kiwi · « Corriger le stock » · tableau de bord seulement.
 *
 * La fiche d'un article au tableau de bord n'a qu'un geste de quantité : la
 * réception (+). Un article perdu, abîmé, ou un comptage plus bas que l'écran
 * ne pouvait pas se corriger, et un article retiré du rayon ne pouvait pas
 * revenir à 0. Cette fenêtre montre chaque taille avec son stock et laisse
 * saisir la quantité réellement en rayon.
 *
 * Chaque écart s'écrit comme un MOUVEMENT (adjustStock, motif « corr+ » ou
 * « corr- » : « Correction · entrée / sortie » au journal), pas comme un stock
 * absolu : une vente encaissée à la caisse pendant la saisie se soustrait
 * encore au lieu d'être écrasée. L'écart se calcule au moment d'enregistrer,
 * sur le stock de cet instant.
 *
 * La caisse ne charge pas ce fichier : la correction reste au tableau de bord.
 * Bouton : data-action="bqx-stock-fix" (fiche boutique et tiroir maison,
 * pages-pro-boutique.js). Chargé par pages/dashboard-startup.js. */
(() => {
  'use strict';
  if (window.KiwiStockCorrect) return;

const W = {
  fr: { title: 'Corriger le stock', desc: 'Saisissez la quantité réellement en rayon. Chaque écart est noté au journal des mouvements.',
    now: (n) => `Actuellement ${n}`, tu: 'Taille unique', zero: 'Tout à 0', cancel: 'Annuler', save: 'Enregistrer',
    bad: 'Un nombre entier, 0 ou plus.', none: 'Aucune quantité n’a changé.', done: 'Stock corrigé',
    doneDesc: (n, d) => `${n} ${n > 1 ? 'tailles' : 'taille'} · ${d > 0 ? '+' : ''}${d} ${Math.abs(d) > 1 ? 'pièces' : 'pièce'}`,
    empty: 'Cet article n’a encore aucune taille en stock.' },
  en: { title: 'Correct the stock', desc: 'Enter the quantity actually on the shelf. Every difference is logged in the stock movements.',
    now: (n) => `Now ${n}`, tu: 'One size', zero: 'All to 0', cancel: 'Cancel', save: 'Save',
    bad: 'A whole number, 0 or more.', none: 'No quantity changed.', done: 'Stock corrected',
    doneDesc: (n, d) => `${n} ${n > 1 ? 'sizes' : 'size'} · ${d > 0 ? '+' : ''}${d} ${Math.abs(d) === 1 ? 'piece' : 'pieces'}`,
    empty: 'This item has no size in stock yet.' },
  ar: { title: 'تصحيح المخزون', desc: 'أدخل الكمية الموجودة فعلاً على الرف. يُسجَّل كل فرق في سجل حركات المخزون.',
    now: (n) => `حالياً ${n}`, tu: 'مقاس واحد', zero: 'الكل إلى 0', cancel: 'إلغاء', save: 'حفظ',
    bad: 'عدد صحيح، 0 أو أكثر.', none: 'لم تتغير أي كمية.', done: 'تم تصحيح المخزون',
    doneDesc: (n, d) => `${n} · ${d > 0 ? '+' : ''}${d}`,
    empty: 'لا يوجد لهذا الصنف أي مقاس بعد.' },
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const whole = (raw) => { const s = String(raw == null ? '' : raw).trim(); return /^\d{1,6}$/.test(s) ? Number(s) : null; };

let cssDone = false;
function css() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'kiwi-stock-correct-css';
  st.textContent = `
.ksc { display: grid; gap: 8px; }
.ksc-row { display: grid; grid-template-columns: minmax(0, 1fr) auto 104px; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--n-200); border-radius: 12px; background: var(--paper, #F7F5F0); }
.ksc-row b { font: 600 13.5px var(--sans); color: var(--ink); }
.ksc-row small { display: block; font-size: 11.5px; color: var(--n-500); margin-top: 1px; }
.ksc-now { font-size: 12px; color: var(--n-500); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ksc-row.is-changed { border-color: var(--atlas, #0B6E4F); }
.ksc-row.is-changed .ksc-now { color: var(--atlas, #0B6E4F); font-weight: 600; }
.ksc-in { box-sizing: border-box; width: 100%; height: 40px; padding: 0 12px; border: 1px solid var(--n-200); border-radius: 10px; background: var(--surface, #fff); color: var(--ink); font: 600 16px var(--mono, ui-monospace, monospace); text-align: end; font-variant-numeric: tabular-nums; }
.ksc-in:focus { outline: 0; border-color: var(--atlas, #0B6E4F); box-shadow: 0 0 0 3px color-mix(in srgb, var(--atlas, #0B6E4F) 16%, transparent); }
.ksc-in[aria-invalid="true"] { border-color: var(--danger, #cb5238); }
.ksc-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 4px; }
.ksc-msg { font-size: 12px; font-weight: 600; color: var(--danger, #cb5238); min-height: 16px; }
.ksc-link { padding: 0; border: 0; background: none; color: var(--atlas, #0B6E4F); font: 600 12.5px var(--sans); cursor: pointer; }
.ksc-link:hover { text-decoration: underline; }
@media (max-width: 520px) { .ksc-row { grid-template-columns: minmax(0, 1fr) 92px; } .ksc-now { grid-column: 1; } }
`;
  document.head.appendChild(st);
}

/* o: { cat, pid, lang, modal, toast(title, desc), onDone() } */
function openCorrect(o) {
  const t = W[o && o.lang] || W.fr;
  const cat = o && o.cat;
  const d = cat && cat.getProduct(o.pid);
  if (!d || typeof o.modal !== 'function') return null;
  css();
  const vars = d.variants.slice();
  const multiColor = new Set(vars.map((v) => String(v.colorId || ''))).size > 1;
  const label = (v) => (v.size === 'TU' ? t.tu : v.size);
  const rows = vars.map((v) => {
    const st = Math.max(0, +v.stock || 0);
    return `<label class="ksc-row" data-ksc-row="${esc(v.id)}">
      <span><b>${esc(label(v))}</b>${multiColor && v.colorLabel ? `<small>${esc(v.colorLabel)}</small>` : ''}</span>
      <span class="ksc-now" data-ksc-now>${esc(t.now(st))}</span>
      <input class="ksc-in" type="text" inputmode="numeric" autocomplete="off" maxlength="6" value="${st}" data-ksc-orig="${st}" data-ksc-in="${esc(v.id)}" aria-label="${esc(label(v) + (multiColor && v.colorLabel ? ' · ' + v.colorLabel : ''))}" />
    </label>`;
  }).join('');
  const body = vars.length
    ? `<div class="ksc">${rows}<div class="ksc-bar"><span class="ksc-msg" data-ksc-msg role="alert"></span><button type="button" class="ksc-link" data-ksc-zero>${esc(t.zero)}</button></div></div>`
    : `<p class="ksc-msg" style="color:var(--n-500)">${esc(t.empty)}</p>`;
  const m = o.modal({ title: t.title, tag: d.product.name, desc: esc(t.desc), width: 520, body,
    foot: `<button class="kb ghost" data-ksc-cancel>${esc(t.cancel)}</button>${vars.length ? `<button data-activation=write class="kb atlas" data-ksc-save>${esc(t.save)}</button>` : ''}` });
  if (!m || !m.el) return null;
  const el = m.el;
  const msg = (s) => { const n = el.querySelector('[data-ksc-msg]'); if (n) n.textContent = s || ''; };
  const paint = (inp) => {
    const v = cat.getProduct(o.pid) && cat.getProduct(o.pid).variants.find((x) => x.id === inp.getAttribute('data-ksc-in'));
    const n = whole(inp.value);
    inp.setAttribute('aria-invalid', n == null ? 'true' : 'false');
    const row = inp.closest('[data-ksc-row]');
    if (row) row.classList.toggle('is-changed', !!v && n != null && n !== Math.max(0, +v.stock || 0));
  };
  el.querySelectorAll('[data-ksc-in]').forEach((inp) => {
    inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/[^\d]/g, '').slice(0, 6); msg(''); paint(inp); });
  });
  const zero = el.querySelector('[data-ksc-zero]');
  if (zero) zero.addEventListener('click', () => { el.querySelectorAll('[data-ksc-in]').forEach((inp) => { inp.value = '0'; paint(inp); }); msg(''); });
  el.querySelector('[data-ksc-cancel]').addEventListener('click', () => m.close());
  const save = el.querySelector('[data-ksc-save]');
  if (save) save.addEventListener('click', () => {
    const wanted = [];
    let bad = null;
    el.querySelectorAll('[data-ksc-in]').forEach((inp) => {
      const n = whole(inp.value);
      if (n == null) { bad = bad || inp; inp.setAttribute('aria-invalid', 'true'); return; }
      /* Une taille laissée telle quelle n'est pas une correction : sans ce
         filtre, une vente encaissée pendant la saisie serait « corrigée ». */
      if (String(n) !== inp.getAttribute('data-ksc-orig')) wanted.push([inp.getAttribute('data-ksc-in'), n]);
    });
    if (bad) { msg(t.bad); bad.focus(); return; }
    /* L'écart contre le stock de CET instant : une vente arrivée pendant la
       saisie est déjà dans v.stock. */
    const now = cat.getProduct(o.pid);
    const plan = wanted.map(([vid, n]) => {
      const v = now && now.variants.find((x) => x.id === vid);
      return v ? [vid, n - Math.max(0, +v.stock || 0)] : null;
    }).filter((x) => x && x[1] !== 0);
    if (!plan.length) { msg(t.none); return; }
    const run = () => plan.forEach(([vid, delta]) => cat.adjustStock(vid, delta, delta > 0 ? 'corr+' : 'corr-'));
    if (cat.batch) cat.batch(run); else run();
    m.close();
    const total = plan.reduce((s, x) => s + x[1], 0);
    if (o.toast) o.toast(t.done, t.doneDesc(plan.length, total));
    if (o.onDone) o.onDone();
  });
  const first = el.querySelector('[data-ksc-in]');
  if (first) setTimeout(() => first.focus(), 40);
  return m;
}

  const lang = () => { const l = (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr'; return W[l] ? l : 'fr'; };
  window.KiwiStockCorrect = { open: openCorrect };
  const H = window.Kiwi && window.Kiwi.handlers;
  if (H) H['bqx-stock-fix'] = (_el, pid) => {
    const K = window.Kiwi;
    const m = openCorrect({ cat: window.KiwiBoutiqueCatalog, pid, lang: lang(), modal: K.modal,
      toast: (title, desc) => K.toast && K.toast(title, { desc, type: 'success' }) });
    if (m && m.el) m.el.classList.add('bqx-pf-modal');
  };
})();
