/* CALME À LA SAISIE · la caisse repeint l'écran affiché d'elle-même : le
   catalogue tiré toutes les 20 s, une promotion qui change, le retour au
   premier plan. Ce repeint reconstruit l'écran, champs compris. Pendant que la
   caissière tape (un code-barres au Scanner, une recherche aux Échanges, un
   montant), il effaçait sa saisie ou refermait le clavier de l'iPad.
   repaintCalm() garde donc le repeint tant qu'un champ de l'écran a le focus,
   puis le joue une fois, quand elle l'a quitté et que son doigt est levé : un
   repeint au milieu d'un toucher avalerait le clic (CLAUDE.md §5). */
const FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=range]),textarea,select,[contenteditable="true"]';
const held = new WeakMap();   // écran → dernier repeint demandé
let down = false;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => { down = true; }, true);
  document.addEventListener('pointerup', () => { down = false; }, true);
  document.addEventListener('pointercancel', () => { down = false; }, true);
}

export function typingIn(panel) {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  return !!(panel && active && panel.contains(active) && active.matches(FIELD));
}

function settle(panel) {
  if (!held.has(panel)) return;
  if (typingIn(panel)) { panel.addEventListener('focusout', () => setTimeout(() => settle(panel), 400), { once: true }); return; }
  if (down) { setTimeout(() => settle(panel), 200); return; }
  const run = held.get(panel); held.delete(panel);
  try { run(); } catch (_) {}
}

export function repaintCalm(panel, run) {
  if (!typingIn(panel)) { run(); return; }
  const waiting = held.has(panel);
  held.set(panel, run);
  if (!waiting) settle(panel);
}
