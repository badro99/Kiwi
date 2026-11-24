/* Maison · « Nouvel article » en tailles, avec le code de chaque taille.
 *
 * Owner, 24 Nov 2026 : « do the same for maison stores ». Le type « Formats »
 * ne changeait rien au formulaire : une seule ligne « TU », un seul stock, un
 * seul code. Un article en tailles reçoit maintenant une grille, une ligne par
 * taille : ses pièces (− / +) et son code fournisseur, que la douchette écrit
 * (la capture de la caisse passe par scan()). Une taille sans pièces ni code
 * n'est pas créée ; une taille sans code n'en reçoit pas, comme la pièce
 * unique jusqu'ici : la fiche propose ensuite « Générer ». Pièce unique : la
 * ligne d'avant, inchangée.
 *
 * Tout passe par trois appels depuis inventory.js (gelé à sa taille) :
 * sizesHtml() dans le formulaire, wire(el, cat) au montage, read(el, cat) à
 * l'enregistrement ; scan(el, code) depuis la capture de la douchette. */
/* Les mêmes grilles que l'écran boutique (assets/boutique-sizes.js, GRID).
   Copiées plutôt qu'importées : importer cet écran chargerait tout le module
   boutique (découpe, codes, couleurs) dans la caisse Maison pour deux listes. */
const GRID = {
  taille: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'],
  pointure: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'],
};
const hasGrid = (kind) => !!GRID[kind];
const gridOf = (kind) => (GRID[kind] || ['TU']).slice();

const W = {
  ph: 'Scannez ou tapez le code',
  size: 'Taille', pieces: 'Pièces', code: 'Code-barres fournisseur',
  hint: 'Écrivez les pièces de chaque taille et scannez son étiquette. Une taille sans code pourra en recevoir un depuis la fiche.',
  none: 'Écrivez les pièces d’au moins une taille, ou scannez son code.',
  bad: (z) => `${z} : code illisible. Rescannez, ou tapez-le à la main.`,
  taken: (z, n) => `${z} : ce code est déjà porté par ${n}.`,
  twice: (z) => `${z} : ce code est déjà donné à une autre taille.`,
  total: (n, k) => (n || k ? `${n} pièce${n > 1 ? 's' : ''} · ${k} taille${k > 1 ? 's' : ''}` : ''),
  up: 'Ajouter une pièce', down: 'Retirer une pièce',
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let cssDone = false;
function css() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const s = document.createElement('style');
  s.id = 'mzs-css';
  s.textContent = `
.mzs[hidden] { display: none; }
.mzs-head, .mzs-row { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; gap: 10px; align-items: center; }
.mzs-head { padding: 0 2px 6px; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: #77807b; }
.mzs-head span:last-child { text-align: center; }
.mzs-list { border: 1px solid rgba(10,15,13,.12); border-radius: 12px; overflow: hidden; }
.mzs-row { padding: 8px 10px; border-top: 1px solid rgba(10,15,13,.08); }
.mzs-row:first-child { border-top: 0; }
.mzs-z { font-weight: 700; font-size: 15px; }
.mzi-fg .mzs-row input[data-mzs-code] { padding: 9px 11px; font-family: var(--mono, 'JetBrains Mono', ui-monospace, monospace); font-size: 13px; }
.mzi-fg .mzs-row input[data-mzs-code][aria-invalid="true"] { border-color: var(--danger, #B42318); }
.mzs-step { display: flex; align-items: center; gap: 6px; }
.mzi-fg .mzs-step input { width: 56px; padding: 9px 4px; text-align: center; font-weight: 600; font-variant-numeric: tabular-nums; }
.mzs-step button { width: 38px; height: 38px; border: 1px solid rgba(10,15,13,.14); border-radius: 10px; background: var(--paper, #F7F5F0); color: var(--atlas, #0B6E4F); font: 600 20px/1 var(--sans, inherit); cursor: pointer; touch-action: manipulation; }
.mzs-foot { display: flex; justify-content: space-between; gap: 12px; margin-top: 8px; font-size: 12px; color: #77807b; }
.mzs-foot b { color: var(--ink, #0A0F0D); font-variant-numeric: tabular-nums; white-space: nowrap; }
.mzs-err { margin-top: 8px; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--danger, #B42318) 8%, transparent); color: var(--danger, #B42318); font-size: 13px; font-weight: 600; }
.mzs-err[hidden] { display: none; }
@media (max-width: 560px) { .mzs-head, .mzs-row { grid-template-columns: 40px minmax(0, 1fr) auto; } .mzs-step button { width: 34px; height: 34px; } .mzi-fg .mzs-step input { width: 44px; } }`;
  document.head.appendChild(s);
}

/* Le bloc, vide et caché : wire() le remplit quand le type a des tailles. */
export function sizesHtml() {
  return `<div class="mzi-fg mzs" data-mzs hidden><label>${esc(W.size)}s · ${esc(W.pieces.toLowerCase())} et codes</label><div data-mzs-body></div>
    <div class="mzs-err" data-mzs-err role="alert" hidden></div></div>`;
}

const kindOf = (el) => ((el.querySelector('#mzi-n-kind') || {}).value || 'tu');
const on = (el) => { const b = el.querySelector('[data-mzs]'); return !!(b && !b.hidden); };
/* La ligne « Stock initial · Format / taille · Code-barres » de la pièce unique. */
const singleRow = (el) => { const i = el.querySelector('#mzi-n-stock'); return i ? i.closest('.mzi-frow') : null; };

function say(el, msg) {
  const e = el.querySelector('[data-mzs-err]');
  if (!e) return;
  e.textContent = msg || '';
  e.hidden = !msg;
}
function count(el) {
  let n = 0, k = 0;
  el.querySelectorAll('[data-mzs-row]').forEach((r) => {
    const p = parseInt(r.querySelector('[data-mzs-n]').value, 10) || 0;
    const c = String(r.querySelector('[data-mzs-code]').value || '').trim();
    if (p > 0) n += p;
    if (p > 0 || c) k++;
  });
  const t = el.querySelector('[data-mzs-total]');
  if (t) t.textContent = W.total(n, k);
}
function judge(cat, raw) {
  const KB = typeof window !== 'undefined' ? window.KiwiBarcode : null;
  const code = String(raw || '').trim();
  const val = KB && KB.validate ? KB.validate(code) : { ok: code.length >= 4, code };
  if (!val.ok) return { bad: 'bad' };
  const hit = cat && cat.findByBarcode ? cat.findByBarcode(val.code || code) : null;
  if (hit) return { bad: 'taken', who: [hit.product && hit.product.name, hit.variant && hit.variant.size].filter(Boolean).join(' · ') };
  return { code: val.code || code };
}
const sizeOfInput = (inp) => (inp.closest('[data-mzs-row]') || { getAttribute: () => '' }).getAttribute('data-mzs-row');
/* Vérifie la case, puis passe à la prochaine case de code vide. */
function next(el, cat, inp) {
  const raw = String(inp.value || '').trim();
  const j = raw ? judge(cat, raw) : null;
  inp.setAttribute('aria-invalid', j && j.bad ? 'true' : 'false');
  if (j && j.bad) { say(el, j.bad === 'taken' ? W.taken(sizeOfInput(inp), j.who) : W.bad(sizeOfInput(inp))); inp.focus(); return; }
  say(el, '');
  count(el);
  const all = Array.from(el.querySelectorAll('[data-mzs-code]'));
  const after = all.slice(all.indexOf(inp) + 1).find((x) => !String(x.value).trim());
  if (after) after.focus(); else inp.blur();
}

function paint(el, cat) {
  const box = el.querySelector('[data-mzs]'), body = el.querySelector('[data-mzs-body]'), row = singleRow(el);
  if (!box || !body) return;
  const kind = kindOf(el);
  const grid = hasGrid(kind);
  box.hidden = !grid;
  if (row) row.style.display = grid ? 'none' : '';
  if (!grid) { body.innerHTML = ''; say(el, ''); return; }
  css();
  body.innerHTML = `<div class="mzs-head" aria-hidden="true"><span>${esc(W.size)}</span><span>${esc(W.code)}</span><span>${esc(W.pieces)}</span></div>
    <div class="mzs-list">${gridOf(kind).map((z) => `<div class="mzs-row" data-mzs-row="${esc(z)}">
      <span class="mzs-z">${esc(z)}</span>
      <input data-mzs-code autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="64" placeholder="${esc(W.ph)}" aria-label="${esc(W.code)} · ${esc(z)}" />
      <span class="mzs-step"><button type="button" data-mzs-step="-1" aria-label="${esc(W.down)} · ${esc(z)}">−</button><input data-mzs-n type="text" inputmode="numeric" maxlength="4" placeholder="0" aria-label="${esc(W.pieces)} · ${esc(z)}" /><button type="button" data-mzs-step="1" aria-label="${esc(W.up)} · ${esc(z)}">+</button></span>
    </div>`).join('')}</div>
    <div class="mzs-foot"><span>${esc(W.hint)}</span><b data-mzs-total></b></div>`;
  body.querySelectorAll('[data-mzs-code]').forEach((inp) => {
    inp.addEventListener('input', () => { inp.setAttribute('aria-invalid', 'false'); say(el, ''); count(el); });
    /* Une douchette finit par « Entrée » : taille suivante, jamais « Créer ». */
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const done = e.defaultPrevented;
      e.preventDefault(); e.stopPropagation();
      if (!done) next(el, cat, inp);
    });
  });
  body.querySelectorAll('[data-mzs-n]').forEach((inp) => {
    inp.addEventListener('keydown', (e) => {
      const t = Date.now(); if (t - (inp._kt || 0) > 120) inp._snap = inp.value; inp._kt = t;   // valeur d'avant une rafale de douchette
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); }
    });
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/[^\d]/g, '').slice(0, 4); say(el, ''); count(el); });
  });
  body.querySelectorAll('[data-mzs-step]').forEach((b) => b.addEventListener('click', () => {
    const inp = b.parentNode.querySelector('[data-mzs-n]');
    const v = Math.max(0, Math.min(9999, (parseInt(inp.value, 10) || 0) + Number(b.getAttribute('data-mzs-step'))));
    inp.value = v ? String(v) : '';
    say(el, ''); count(el);
  }));
  count(el);
}

/* Au montage du formulaire : suit le type choisi. */
export function wire(el, cat) {
  const sel = el && el.querySelector('#mzi-n-kind');
  if (!sel) return;
  sel.addEventListener('change', () => paint(el, cat));
  paint(el, cat);
}

/* Un scan capté par la caisse : rend true s'il est pris par la grille. Il va
   dans la case de code qui a le curseur, sinon dans celle de la taille dont on
   tape les pièces (qui reprend sa valeur d'avant la rafale), sinon dans la
   première case vide. */
export function scan(el, code, cat) {
  if (!el || !on(el)) return false;
  const all = Array.from(el.querySelectorAll('[data-mzs-code]'));
  const a = document.activeElement;
  let inp = a && all.includes(a) ? a : null;
  if (!inp && a && a.hasAttribute && a.hasAttribute('data-mzs-n')) {
    if (a._snap != null && a.value !== a._snap) a.value = a._snap;
    const r = a.closest('[data-mzs-row]');
    inp = r ? r.querySelector('[data-mzs-code]') : null;
  }
  if (!inp) inp = all.find((x) => !String(x.value).trim()) || null;
  if (!inp) return true;
  inp.value = String(code || '').trim();
  next(el, cat, inp);
  return true;
}

/* À l'enregistrement. null : pas de grille (pièce unique, la ligne d'avant).
   { error } : rien n'est créé, la case fautive a le curseur.
   { sizes: [{ size, stock, code }] } sinon. */
export function read(el, cat) {
  if (!el || !on(el)) return null;
  const sizes = [], seen = {};
  for (const r of el.querySelectorAll('[data-mzs-row]')) {
    const size = r.getAttribute('data-mzs-row');
    const ci = r.querySelector('[data-mzs-code]'), ni = r.querySelector('[data-mzs-n]');
    const stock = parseInt(ni.value, 10) || 0, raw = String(ci.value || '').trim();
    ci.setAttribute('aria-invalid', 'false');
    if (!stock && !raw) continue;
    let code = '';
    if (raw) {
      const j = judge(cat, raw);
      const fail = (msg) => { ci.setAttribute('aria-invalid', 'true'); ci.focus(); say(el, msg); return { error: msg }; };
      if (j.bad) return fail(j.bad === 'taken' ? W.taken(size, j.who) : W.bad(size));
      if (seen[j.code]) return fail(W.twice(size));
      seen[j.code] = true; code = j.code;
    }
    sizes.push({ size, stock, code });
  }
  if (!sizes.length) { say(el, W.none); const f = el.querySelector('[data-mzs-n]'); if (f) f.focus(); return { error: W.none }; }
  return { sizes };
}
