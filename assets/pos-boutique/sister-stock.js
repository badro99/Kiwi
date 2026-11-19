/* Le stock des autres boutiques du propriétaire, EN LECTURE, depuis l'Inventaire.
 *
 * Santos (2026-11-19) : une pièce est en rupture à Rabat ; la vendeuse regarde
 * s'il en reste à Casablanca, vend au client et la fait livrer. Le sélecteur
 * « Rabat · Casablanca » n'apparaît que pour les boutiques d'un même catalogue
 * partagé (console : sharedCatalog, même propriétaire, même métier) :
 * /api/sister-stock le décide côté serveur et ne sait QUE lire.
 *
 * Ce module ne touche jamais au catalogue local, ni au panier, ni au stockage
 * du navigateur : l'inventaire de l'autre boutique vit dans une variable, se
 * dessine dans sa propre section, et disparaît dès qu'on quitte la page. La
 * Vente, le scan au ticket et les mouvements restent ceux de cette caisse. Le
 * déplacement d'une pièce passe par les Transferts (transfers.js). */

const TTL = 5 * 60 * 1000;
const S = { merchant: '', list: null, listAt: 0, sel: '', data: null, q: '', loading: false, err: '', wired: false, selfLabel: '' };

const api = (qs) => fetch('/api/sister-stock?' + qs, { credentials: 'same-origin', cache: 'no-store' })
  .then((r) => (r.ok ? r.json() : null)).catch(() => null);

/* Le libellé court : « Santos Store » et « Santos Store Casablanca » partagent
 * « Santos Store » ; chacun garde ce qui lui reste, ou son nom entier s'il ne
 * lui reste rien. */
function shortNames(names) {
  const split = names.map((n) => String(n || '').trim().split(/\s+/));
  let cut = 0;
  while (split.every((w) => cut < w.length && w[cut].toLowerCase() === split[0][cut].toLowerCase())) cut++;
  return names.map((n, i) => split[i].slice(cut).join(' ') || String(n || ''));
}

const ago = (ts) => {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  return m < 1 ? 'à l’instant' : `il y a ${m} min`;
};
const fold = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const digits = (v) => String(v == null ? '' : v).trim().replace(/^0+/, '');

function css() {
  if (document.getElementById('bqs-css')) return;
  const style = document.createElement('style');
  style.id = 'bqs-css';
  style.textContent = `
  .bqs-sw{display:inline-flex;gap:4px;padding:4px;border-radius:999px;background:rgba(11,110,79,.08);margin-left:auto;margin-right:12px;align-self:center}
  .bqs-sw button{border:0;background:transparent;font:inherit;font-size:14px;font-weight:600;padding:8px 16px;border-radius:999px;cursor:pointer;color:inherit;min-height:40px}
  .bqs-sw button.on{background:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0)}
  .bqi.bqs-away>:not(.bq-head):not(.bqs-view){display:none!important}
  .bqi.bqs-away #bqi-new,.bqi.bqs-away .bqi-dashboard-only,.bqi.bqs-away .bq-head-sub{display:none!important}
  .bqs-view{padding:0 22px 22px}
  .bqs-ro{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:14px 0;padding:12px 14px;border-radius:12px;background:rgba(11,110,79,.08);color:var(--riad,#053B2C);font-size:14px}
  .bqs-ro b{font-weight:700}
  .bqs-ro .bqs-at{margin-left:auto;opacity:.75}
  .bqs-ro button{border:1px solid rgba(5,59,44,.25);background:transparent;border-radius:999px;padding:6px 12px;font:inherit;cursor:pointer;color:inherit}
  .bqs-q{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1px solid rgba(10,15,13,.15);font:inherit;font-size:15px;background:transparent;color:inherit;margin-bottom:12px}
  .bqs-row{display:grid;grid-template-columns:1fr auto auto;gap:6px 14px;align-items:center;padding:12px 4px;border-bottom:1px solid rgba(10,15,13,.08)}
  .bqs-row .n b{display:block;font-weight:600}
  .bqs-row .n span{font-size:13px;opacity:.7}
  .bqs-row .t{font-weight:700;font-variant-numeric:tabular-nums}
  .bqs-row .t.zero{color:#b4412f}
  .bqs-row .p{opacity:.8;font-variant-numeric:tabular-nums}
  .bqs-sz{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px}
  .bqs-sz span{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:8px;background:rgba(10,15,13,.05);font-size:13px;font-variant-numeric:tabular-nums}
  .bqs-sz span.out{opacity:.4}
  .bqs-sz i{width:10px;height:10px;border-radius:50%;display:inline-block;border:1px solid rgba(10,15,13,.2)}
  .bqs-empty{padding:40px 12px;text-align:center;opacity:.7}`;
  document.head.appendChild(style);
}

function rows(data, q, esc, money, tr) {
  const vs = {};
  for (const v of data.variants || []) (vs[v.productId] || (vs[v.productId] = [])).push(v);
  const fq = fold(q), dq = digits(q);
  let list = data.products || [];
  if (fq) {
    list = list.filter((p) => fold(p.name).indexOf(fq) >= 0 || fold(p.category).indexOf(fq) >= 0
      || (p.sku && fold(p.sku) === fq)
      || (vs[p.id] || []).some((v) => v.codes.some((c) => c === q.trim() || (dq.length >= 8 && digits(c) === dq))));
  }
  if (!list.length) return `<div class="bqs-empty">${tr(fq ? 'Aucun article ne correspond.' : 'Aucun article dans cette boutique.')}</div>`;
  return list.slice(0, 300).map((p) => {
    const mine = vs[p.id] || [];
    const total = mine.reduce((n, v) => n + v.stock, 0);
    const chips = mine.map((v) => `<span class="${v.stock ? '' : 'out'}">${v.hex ? `<i style="background:${esc(v.hex)}"></i>` : ''}${esc([v.color, v.size].filter(Boolean).join(' ') || tr('Unique'))} · <b>${v.stock}</b></span>`).join('');
    return `<div class="bqs-row"><div class="n"><b>${esc(p.name)}</b><span>${esc(p.category || tr('Divers'))}</span></div>
      <div class="p">${money(p.price)}</div><div class="t ${total ? '' : 'zero'}">${total}</div>
      ${chips ? `<div class="bqs-sz">${chips}</div>` : ''}</div>`;
  }).join('');
}

function home(panel) {
  const box = panel && panel.querySelector(':scope > .bqi');
  if (!box) return;
  box.classList.remove('bqs-away');
  const view = box.querySelector(':scope > .bqs-view');
  if (view) view.remove();
}

function paintView(panel, ctx) {
  const box = panel.querySelector(':scope > .bqi');
  if (!box) return;
  if (!S.sel) { home(panel); return; }
  let view = box.querySelector(':scope > .bqs-view');
  box.classList.add('bqs-away');
  if (!view) { view = document.createElement('section'); view.className = 'bqs-view'; box.appendChild(view); }
  const tr = ctx.tr || ((x) => x);
  const sib = (S.list || []).find((s) => s.merchant === S.sel) || { name: S.sel };
  const label = ctx.esc(String(sib.label || sib.name || ''));
  let body;
  if (S.loading && !S.data) body = `<div class="bqs-empty">${tr('Lecture du stock…')}</div>`;
  else if (S.err) body = `<div class="bqs-empty">${tr(S.err)}</div>`;
  else if (S.data && !S.data.known) body = `<div class="bqs-empty">${tr('Cette boutique n’a pas encore d’inventaire enregistré.')}</div>`;
  else body = `<div class="bqs-list">${rows(S.data || {}, S.q, ctx.esc, ctx.money, tr)}</div>`;
  const at = S.data && S.data.read_ts ? tr('Relu') + ' ' + tr(ago(S.data.read_ts)) : '';
  const hadFocus = document.activeElement && document.activeElement.id === 'bqs-q';
  view.innerHTML = `<div class="bqs-ro"><i data-icon="visibility" aria-hidden="true"></i>
      <span><b>${tr('Lecture seule')}</b> · ${tr('stock de')} ${label}. ${tr('Pour vendre une de ces pièces, passez la commande à part.')}</span>
      <span class="bqs-at">${at}</span><button type="button" data-bqs-reload>${tr('Actualiser')}</button></div>
    <input id="bqs-q" class="bqs-q" placeholder="${ctx.esc(tr('Nom de l’article ou code-barres…'))}" autocomplete="off" value="${ctx.esc(S.q)}" />
    ${body}`;
  const q = view.querySelector('#bqs-q');
  q.oninput = () => { S.q = q.value; const l = view.querySelector('.bqs-list'); if (l) l.innerHTML = rows(S.data || {}, S.q, ctx.esc, ctx.money, tr); };
  q.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); q.select(); } };
  view.querySelector('[data-bqs-reload]').onclick = () => load(panel, ctx, true);
  if (ctx.icons) ctx.icons();
  if (hadFocus || !S.q) { try { q.focus({ preventScroll: true }); q.setSelectionRange(q.value.length, q.value.length); } catch (_) {} }
}

function load(panel, ctx, force) {
  if (!S.sel) return;
  if (S.data && S.data.store && S.data.store.merchant === S.sel && !force && Date.now() - S.data.read_ts < TTL) { paintView(panel, ctx); return; }
  const want = S.sel;
  S.loading = true; S.err = '';
  if (!S.data || !S.data.store || S.data.store.merchant !== want) S.data = null;
  paintView(panel, ctx);
  api('merchant=' + encodeURIComponent(S.merchant) + '&store=' + encodeURIComponent(want)).then((r) => {
    if (S.sel !== want) return;
    S.loading = false;
    if (!r || !r.ok) { S.err = 'Stock indisponible pour le moment. Réessayez avec « Actualiser ».'; }
    else S.data = r;
    paintView(panel, ctx);
  });
}

function paintSwitch(panel, ctx) {
  const head = panel.querySelector(':scope > .bqi > .bq-head');
  if (!head) return;
  let sw = head.querySelector('.bqs-sw');
  if (!S.list || !S.list.length) { if (sw) sw.remove(); return; }
  if (!sw) {
    sw = document.createElement('div'); sw.className = 'bqs-sw'; sw.setAttribute('role', 'tablist');
    const anchor = head.querySelector('#bqi-new, .bqi-dashboard-only');
    head.insertBefore(sw, anchor || null);
    sw.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bqs]');
      if (!b) return;
      S.sel = b.getAttribute('data-bqs') || ''; S.q = '';
      paintSwitch(panel, ctx);
      if (S.sel) load(panel, ctx, false); else paintView(panel, ctx);
    });
  }
  const opts = [{ merchant: '', label: S.selfLabel }].concat(S.list);
  sw.innerHTML = opts.map((o) => `<button type="button" role="tab" aria-selected="${o.merchant === S.sel}" class="${o.merchant === S.sel ? 'on' : ''}" data-bqs="${ctx.esc(o.merchant)}">${ctx.esc(o.label)}</button>`).join('');
}

/* Appelé à la fin de chaque peinture de l'Inventaire. */
export function sisterStock(panel, ctx) {
  /* invPaint garde la boîte .bqi d'une peinture à l'autre : sans ce retour à la
   * maison, une vue Casablanca laissée ouverte masquerait l'inventaire local. */
  if (!panel || !ctx || !ctx.real || !ctx.merchant) { S.sel = ''; home(panel); const sw = panel && panel.querySelector('.bqs-sw'); if (sw) sw.remove(); return; }
  css();
  if (!S.wired) {
    S.wired = true;
    /* Quitter l'Inventaire ramène toujours la caisse sur SA boutique. */
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-bq-view]');
      if (b && b.getAttribute('data-bq-view') !== 'inventaire') {
        S.sel = ''; S.q = '';
        home(panel);
        const sw = panel.querySelector('.bqs-sw');
        if (sw) sw.querySelectorAll('[data-bqs]').forEach((x) => { const on = !x.getAttribute('data-bqs'); x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); });
      }
    }, true);
  }
  if (S.merchant !== ctx.merchant) Object.assign(S, { merchant: ctx.merchant, list: null, listAt: 0, sel: '', data: null, q: '' });
  paintSwitch(panel, ctx);
  paintView(panel, ctx);
  if (S.sel && !S.data && !S.loading) load(panel, ctx, false);
  if (S.list && Date.now() - S.listAt < TTL) return;
  S.listAt = Date.now();
  const asked = ctx.merchant;
  api('merchant=' + encodeURIComponent(asked)).then((r) => {
    if (S.merchant !== asked) return;
    const stores = (r && r.ok && Array.isArray(r.stores)) ? r.stores : [];
    const selfName = (r && r.self && r.self.name) || asked;
    const labels = shortNames([selfName].concat(stores.map((s) => s.name)));
    S.selfLabel = labels[0];
    S.list = stores.map((s, i) => ({ ...s, label: labels[i + 1] }));
    if (S.sel && !S.list.some((s) => s.merchant === S.sel)) { S.sel = ''; S.data = null; }
    paintSwitch(panel, ctx);
    paintView(panel, ctx);
  });
}
