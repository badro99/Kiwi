/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LES SAISIES D'UNE BOUTIQUE QUI NE SE PERDENT PLUS
 * ---------------------------------------------------------------------------
 * Un carton se compte long : vingt-six pièces, sept couleurs, une main qui
 * ferme la fenêtre par erreur, et tout était à refaire (propriétaire, 25 nov.
 * 2026). Ce qui est tapé dans la grille des tailles (boutique-sizes.js › mount)
 * et dans le formulaire « Nouveau produit » (caisse et tableau de bord) est
 * gardé SUR CET APPAREIL, par compte (kiwiAccountKey), sept jours au plus, et
 * revient tel quel à la réouverture. Un enregistrement réussi l'efface.
 *
 * Rien ne part au serveur : c'est un brouillon, pas une donnée du magasin.
 * ═══════════════════════════════════════════════════════════════════════════ */

const PREFIX = 'kiwiDraft:';
const LIFE_MS = 7 * 24 * 3600 * 1000;
const MAX_DRAFTS = 40;

const W = {
  fr: { back: 'Votre saisie est revenue là où vous l’aviez laissée.', clear: 'Tout effacer' },
  en: { back: 'Your entries are back where you left them.', clear: 'Clear all' },
  ar: { back: 'رجع ما كتبته كما تركته.', clear: 'امسح الكل' },
};
export const draftWords = (lang) => W[lang] || W.fr;

function store() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; } }
function scope() {
  const ls = store();
  try { return String((ls && ls.getItem('kiwiAccountKey')) || '').trim().toLowerCase() || 'local'; } catch (_) { return 'local'; }
}
const keyOf = (name) => PREFIX + scope() + ':' + name;

export function readDraft(name, now = Date.now()) {
  const ls = store();
  if (!ls) return null;
  try {
    const box = JSON.parse(ls.getItem(keyOf(name)) || 'null');
    if (!box || typeof box !== 'object' || !box.data) return null;
    if (now - (Number(box.at) || 0) > LIFE_MS) { ls.removeItem(keyOf(name)); return null; }
    return box.data;
  } catch (_) { return null; }
}
export function writeDraft(name, data, now = Date.now()) {
  const ls = store();
  if (!ls) return;
  try { ls.setItem(keyOf(name), JSON.stringify({ at: now, data })); prune(ls, now); } catch (_) { /* appareil plein : la saisie reste à l'écran */ }
}
export function clearDraft(name) {
  const ls = store();
  try { if (ls) ls.removeItem(keyOf(name)); } catch (_) { /* rien */ }
}
/* Les brouillons expirés partent ; au-delà de quarante, les plus vieux. */
function prune(ls, now) {
  const mine = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (!k || !k.startsWith(PREFIX)) continue;
    let at = 0;
    try { at = Number((JSON.parse(ls.getItem(k) || 'null') || {}).at) || 0; } catch (_) { at = 0; }
    mine.push([k, at]);
  }
  mine.forEach(([k, at]) => { if (now - at > LIFE_MS) ls.removeItem(k); });
  const live = mine.filter(([, at]) => now - at <= LIFE_MS).sort((a, b) => a[1] - b[1]);
  while (live.length > MAX_DRAFTS) ls.removeItem(live.shift()[0]);
}

let cssDone = false;
export function draftCss() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = `.kbd-note { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin: 0 0 12px; padding: 10px 14px; border: 1px solid #CFE3D7; border-radius: 12px;
  background: #EEF6F1; color: var(--riad, #053B2C); font-size: 13px; line-height: 1.4; }
.kbd-note button { min-height: 32px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: var(--atlas, #0B6E4F); font: 600 13px var(--sans, inherit); text-decoration: underline; cursor: pointer; }
.kbd-note button:focus-visible { outline: 2px solid var(--atlas, #0B6E4F); outline-offset: 2px; }`;
  document.head.appendChild(s);
}

/* Le petit bandeau « votre saisie est revenue · Tout effacer ». */
export function noteHtml(lang) {
  const w = draftWords(lang);
  return `<p class="kbd-note" role="status" data-kbd-note><span>${w.back}</span><button type="button" data-kbd-clear>${w.clear}</button></p>`;
}

/* Un formulaire entier (« Nouveau produit ») : chaque champ est repris par sa
   place et sa nature, jamais par son texte. La grille des tailles, si elle est
   dedans, a son propre brouillon. Rend { clear(), restored }. */
const FIELDS = 'input, select, textarea';
/* La grille des tailles a son propre brouillon ; la photo (colonne de côté) se monte après coup. */
const skip = (el) => el.closest('[data-kbs], .bqx-pf-side, [data-ktp]') || /^(file|hidden|button|submit|reset|image)$/i.test(el.type || '');
const sig = (el) => [el.tagName, el.type || '', el.name || '', el.type === 'radio' || el.type === 'checkbox' ? el.value : ''].join(':');
const snap = (root) => Array.from(root.querySelectorAll(FIELDS)).filter((el) => !skip(el))
  .map((el) => ({ s: sig(el), v: el.type === 'radio' || el.type === 'checkbox' ? '' : String(el.value || ''), c: !!el.checked }));
const same = (a, b) => a.length === b.length && a.every((f, i) => f.s === b[i].s && f.v === b[i].v && f.c === b[i].c);

export function rememberForm(root, name, lang, opts = {}) {
  if (!root || !name) return { clear() {}, restored: false };
  draftCss();
  const blank = snap(root);
  const fields = () => Array.from(root.querySelectorAll(FIELDS)).filter((el) => !skip(el));
  const put = (list) => {
    fields().forEach((el, i) => {
      const f = list[i];
      if (!f || f.s !== sig(el)) return;
      if (el.type === 'radio' || el.type === 'checkbox') { if (el.checked === f.c) return; el.checked = f.c; }
      else { if (String(el.value || '') === f.v) return; el.value = f.v; }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  let quiet = false;
  const save = () => {
    if (quiet) return;
    const now = snap(root);
    if (same(now, blank)) clearDraft(name); else writeDraft(name, { fields: now });
  };
  const saved = opts.restore === false ? null : readDraft(name);
  let restored = false;
  if (saved && Array.isArray(saved.fields)) {
    quiet = true; put(saved.fields); quiet = false;
    restored = !same(snap(root), blank);
  }
  root.addEventListener('input', save);
  root.addEventListener('change', save);
  const host = root.querySelector(opts.noteIn || '.bqx-pf-main') || root.querySelector('[data-bqx-pf]') || root;   // en tête de la colonne des champs
  if (restored && host) {
    host.insertAdjacentHTML('afterbegin', noteHtml(lang));
    const note = host.querySelector('[data-kbd-note]');
    note.querySelector('[data-kbd-clear]').addEventListener('click', () => {
      quiet = true; put(blank); quiet = false;
      clearDraft(name);
      note.remove();
    });
  }
  return {
    restored,
    clear() { quiet = true; clearDraft(name); root.removeEventListener('input', save); root.removeEventListener('change', save); },
  };
}
