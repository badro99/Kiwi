/* L'erreur d'un champ de formulaire, dite SOUS le champ (caisses boutique et
 * maison, propriétaire 2026-11-24). Avant, « Le nom est requis » passait en
 * toast : rien ne montrait quel champ manquait, et le toast couvrait les
 * boutons du bas de la fenêtre.
 *
 * fieldErr(el, sélecteur, phrase) : bordure rouge, phrase dessous, curseur
 * posé, le champ ramené à l'écran. L'erreur s'efface dès que la saisie
 * reprend. Rend false, pour écrire `if (!name) return fieldErr(...)`. */
const CSS = '.kf-err-in{border-color:var(--danger,#B3261E)!important;box-shadow:0 0 0 3px rgba(179,38,30,.12)!important}'
  + '.kf-err{margin-top:6px;font-size:12.5px;font-weight:600;line-height:1.35;color:var(--danger,#B3261E)}'
  + '.kf-err[hidden]{display:none}';

function ensureCss() {
  if (typeof document === 'undefined' || !document.head || document.getElementById('kf-err-css')) return;
  const s = document.createElement('style');
  s.id = 'kf-err-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function fieldErr(el, sel, msg) {
  const input = el && el.querySelector(sel);
  if (!input) return false;
  ensureCss();
  const group = input.closest('.mzi-fg, .bqi-fg, .bq-field') || input.parentElement;
  let line = group.querySelector(':scope > .kf-err');
  if (!line) {
    line = document.createElement('div');
    line.className = 'kf-err';
    line.setAttribute('role', 'alert');
    group.appendChild(line);
  }
  line.textContent = msg;
  line.hidden = false;
  const marked = input.type === 'radio' || input.type === 'checkbox' ? [] : [input];
  marked.forEach((i) => i.classList.add('kf-err-in'));
  const clear = () => { line.hidden = true; marked.forEach((i) => i.classList.remove('kf-err-in')); };
  group.addEventListener('input', clear, { once: true });
  group.addEventListener('change', clear, { once: true });
  try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
  try { group.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
  return false;
}
