/* Kiwi · la barre de recherche des longues listes (27 nov. 2026)
 * ---------------------------------------------------------------------------
 * « Search bar needed » (Jon's Burgers) : 59 plats dans la grille des prix de
 * livraison, 59 recettes, et le patron cherche le sien en faisant défiler.
 * Une seule barre, la même partout, posée par le balisage :
 *
 *   <div data-find-scope>
 *     <div data-find="clé" data-find-ph="Rechercher un plat"></div>
 *     <… data-find-group>Burgers</…>            (facultatif, se masque si vide)
 *     <… data-find-row data-find-text="Cheese burger Burgers">…</…>
 *   </div>
 *
 * Ce module, chargé une fois par import(), pose la barre dans chaque
 * [data-find] qui apparaît (un MutationObserver, avant la peinture : pas
 * d'éclair de la liste complète) et garde la recherche par clé quand l'écran
 * se repeint. Il ne crée aucun global.
 *
 * Recherche : sans accents ni majuscules, chaque mot tapé doit se trouver,
 * dans n'importe quel ordre, et une faute d'une lettre passe sur un mot de
 * cinq lettres ou plus (« tacos marocian » trouve « Tacos Marocain »).
 * Échap vide la barre ; Entrée va au premier résultat.
 * ─────────────────────────────────────────────────────────────────────────── */

const SEARCH = 'M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z';
const CLOSE = 'm256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z';
const icon = (d, cls) => `<svg class="${cls}" viewBox="0 -960 960 960" aria-hidden="true" fill="currentColor"><path d="${d}"/></svg>`;

const WORDS = {
  ph: ['Rechercher', 'Search', 'بحث'],
  clear: ['Effacer la recherche', 'Clear search', 'مسح البحث'],
  none: ['Aucun résultat pour « {q} »', 'No result for « {q} »', 'لا نتيجة لـ « {q} »'],
  count: ['{n} sur {t}', '{n} of {t}', '{n} من {t}'],
};
function lang() {
  let l = '';
  try { l = localStorage.getItem('kiwiLang') || ''; } catch (_) {}
  if (!l && typeof document !== 'undefined') l = document.documentElement.lang || '';
  l = String(l).slice(0, 2);
  return l === 'en' ? 1 : l === 'ar' ? 2 : 0;
}
const say = (k, vars) => Object.keys(vars || {}).reduce((s, v) => s.split('{' + v + '}').join(String(vars[v])), WORDS[k][lang()] || WORDS[k][0]);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── La recherche, sans DOM (testée seule) ─────────────────────────────── */
export function norm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('fr').replace(/[’'`´]/g, "'").replace(/[^\p{L}\p{N}']+/gu, ' ').trim();
}
/* Au plus une lettre de différence (remplacée, ajoutée, retirée). */
function nearOne(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
  }
  return edits + (la - i) + (lb - j) <= 1;
}
/* Une interversion de deux lettres voisines (« marocian ») compte pour une faute. */
function swapped(a, b) {
  if (a.length !== b.length) return false;
  const d = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { d.push(i); if (d.length > 2) return false; }
  return d.length === 2 && d[1] === d[0] + 1 && a[d[0]] === b[d[1]] && a[d[1]] === b[d[0]];
}
function tokenHit(tok, text, words) {
  if (text.indexOf(tok) !== -1) return true;
  if (tok.length < 5) return false;
  return words.some((w) => {
    if (w.length + 1 < tok.length) return false;
    const head = w.slice(0, tok.length);
    return nearOne(tok, head) || nearOne(tok, w.slice(0, tok.length + 1)) || nearOne(tok, w.slice(0, tok.length - 1)) || swapped(tok, head);
  });
}
/* Vrai si chaque mot de la requête se trouve dans le texte. */
export function matches(query, text) {
  const q = norm(query);
  if (!q) return true;
  const t = norm(text);
  const words = t.split(' ');
  return q.split(' ').every((tok) => tokenHit(tok, t, words));
}

/* ── La barre ──────────────────────────────────────────────────────────── */
const queries = new Map();

function css() {
  if (document.getElementById('kfb-css')) return;
  const s = document.createElement('style');
  s.id = 'kfb-css';
  /* Le même dessin que la recherche de la carte (.rmw-menu-search), en plus discret. */
  s.textContent = '.kfb{position:relative;display:flex;align-items:center;gap:4px;min-height:48px;max-width:460px;padding:5px 4px 5px 5px;border:1px solid var(--n-200,#e5e2da);border-radius:14px;background:color-mix(in srgb,var(--surface,#fff) 92%,var(--paper-soft,var(--paper,#F7F5F0)));cursor:text;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease}'
    + '.kfb:hover{border-color:color-mix(in srgb,var(--atlas,#0B6E4F) 30%,var(--n-200,#e5e2da));background:var(--surface,#fff)}'
    + '.kfb:focus-within{border-color:color-mix(in srgb,var(--atlas,#0B6E4F) 72%,var(--n-200,#e5e2da));background:var(--surface,#fff);box-shadow:0 0 0 3px color-mix(in srgb,var(--atlas,#0B6E4F) 13%,transparent)}'
    + '.kfb-c{flex:0 0 auto;display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:color-mix(in srgb,var(--atlas,#0B6E4F) 10%,transparent);color:var(--atlas,#0B6E4F);transition:background .16s ease,transform .16s ease}'
    + '.kfb:focus-within .kfb-c{background:color-mix(in srgb,var(--atlas,#0B6E4F) 16%,transparent);transform:scale(1.03)}.kfb-c svg{width:18px;height:18px}'
    + '.kfb-in{flex:1;min-width:0;height:36px;border:0!important;outline:0!important;background:transparent!important;box-shadow:none!important;padding:0 8px;font:550 14px var(--sans,inherit);letter-spacing:-.005em;color:var(--ink,#0A0F0D);-webkit-appearance:none;appearance:none}'
    + '.kfb-in::placeholder{color:var(--n-500,#8a857a);opacity:.8;font-weight:500}.kfb-in::-webkit-search-cancel-button{display:none}'
    + '.kfb-n{flex:0 0 auto;font-size:12px;font-variant-numeric:tabular-nums;color:var(--n-500,#8a857a);white-space:nowrap}'
    + '.kfb-x{flex:0 0 auto;display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:10px;background:none;color:var(--n-500,#8a857a);cursor:pointer;transition:color .16s ease,background .16s ease}'
    + '.kfb-x:hover{color:var(--ink,#0A0F0D);background:color-mix(in srgb,var(--ink,#0A0F0D) 6%,transparent)}.kfb-x:focus-visible{outline:2px solid var(--atlas,#0B6E4F);outline-offset:-2px}.kfb-x svg{width:17px;height:17px}'
    + '.kfb[data-empty] .kfb-x,.kfb[data-empty] .kfb-n{display:none}'
    + '.kfb-none{margin:14px 2px 4px;font-size:13.5px;color:var(--n-500,#8a857a)}'
    + '.kfb-hide{display:none!important}'
    + '@media (max-width:640px){.kfb{max-width:none}}';
  document.head.appendChild(s);
}

function scopeOf(slot) { return slot.closest('[data-find-scope]') || slot.parentElement; }

function apply(slot) {
  const scope = scopeOf(slot);
  if (!scope) return;
  const q = queries.get(slot.getAttribute('data-find')) || '';
  const items = scope.querySelectorAll('[data-find-row],[data-find-group]');
  let group = null, groupHit = false, shown = 0, total = 0;
  const closeGroup = () => { if (group) group.classList.toggle('kfb-hide', !groupHit); };
  items.forEach((el) => {
    if (el.hasAttribute('data-find-group')) { closeGroup(); group = el; groupHit = false; return; }
    total++;
    const hit = matches(q, el.getAttribute('data-find-text') || el.textContent);
    el.classList.toggle('kfb-hide', !hit);
    if (hit) { shown++; groupHit = true; }
  });
  closeGroup();
  const bar = slot.querySelector('.kfb');
  if (!bar) return;
  bar.toggleAttribute('data-empty', !q);
  bar.querySelector('.kfb-n').textContent = q ? say('count', { n: shown, t: total }) : '';
  const none = slot.querySelector('.kfb-none');
  none.hidden = !q || shown > 0;
  if (!none.hidden) none.textContent = say('none', { q: q.trim() });
}

function firstResult(slot) {
  const row = [...scopeOf(slot).querySelectorAll('[data-find-row]')].find((el) => !el.classList.contains('kfb-hide'));
  if (!row) return;
  const target = row.matches('input,button,a,[tabindex]') ? row : row.querySelector('input,button,a,[tabindex]');
  if (target) { target.focus(); if (target.select) try { target.select(); } catch (_) {} }
}

export function mountSlot(slot) {
  if (!slot || slot.hasAttribute('data-find-on')) return;
  slot.setAttribute('data-find-on', '');
  css();
  const key = slot.getAttribute('data-find');
  const q = queries.get(key) || '';
  const ph = slot.getAttribute('data-find-ph') || say('ph');
  slot.innerHTML = `<label class="kfb"${q ? '' : ' data-empty'}><span class="kfb-c">${icon(SEARCH, '')}</span><input class="kfb-in" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="${esc(ph)}" aria-label="${esc(ph)}" value="${esc(q)}"><span class="kfb-n" aria-live="polite"></span><button type="button" class="kfb-x" aria-label="${esc(say('clear'))}" title="${esc(say('clear'))}">${icon(CLOSE, '')}</button></label><p class="kfb-none" hidden></p>`;
  const input = slot.querySelector('.kfb-in');
  input.addEventListener('input', () => { queries.set(key, input.value); apply(slot); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (input.value) { e.preventDefault(); e.stopPropagation(); input.value = ''; queries.set(key, ''); apply(slot); } else input.blur(); }
    else if (e.key === 'Enter') { e.preventDefault(); firstResult(slot); }
  });
  slot.querySelector('.kfb-x').addEventListener('click', (e) => { e.preventDefault(); input.value = ''; queries.set(key, ''); apply(slot); input.focus(); });
  apply(slot);
}

export function mount(root) {
  (root || document).querySelectorAll('[data-find]').forEach(mountSlot);
}

/* Une liste repeinte sous une barre déjà posée : on refiltre son périmètre. */
function refilter(node) {
  const scope = node.closest && node.closest('[data-find-scope]');
  const slot = scope && scope.querySelector('[data-find][data-find-on]');
  if (slot) apply(slot);
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  mount(document);
  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches('[data-find]')) mountSlot(n);
        else n.querySelectorAll('[data-find]').forEach(mountSlot);
        if (n.matches('[data-find-row],[data-find-group]') || n.querySelector('[data-find-row]')) refilter(n);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}
