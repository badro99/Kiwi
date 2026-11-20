/* Le redessin de la vente après une arrivée du catalogue.
 *
 * Au déverrouillage le catalogue arrive en plusieurs fois (copie locale, base
 * de l'appareil, serveur), et chaque arrivée redessinait toute la vente : la
 * Maison en Vogue restait figée après le code (20 nov. 2026). Les arrivées
 * d'une même image ne donnent plus qu'un redessin, à l'image suivante. Et rien
 * ne se redessine pendant qu'un doigt est posé : un redessin sous le doigt
 * avale le toucher (CLAUDE.md §5), on attend qu'il se lève.
 *
 * mzSettle(run, win) rend kick() ; kick.flush() redessine tout de suite ce qui
 * attend. Sans fenêtre (banc d'essai), kick() redessine aussitôt, comme avant. */
export function mzSettle(run, win) {
  if (!win || typeof win.requestAnimationFrame !== 'function') {
    const now = () => run();
    now.flush = () => {};
    return now;
  }
  let pending = false, scheduled = false, down = false;
  const go = () => { scheduled = false; if (!pending || down) return; pending = false; run(); };
  const plan = () => { if (!scheduled && !down) { scheduled = true; win.requestAnimationFrame(go); } };
  win.addEventListener('pointerdown', () => { down = true; }, true);
  const lift = () => { down = false; if (pending) plan(); };
  win.addEventListener('pointerup', lift, true);
  win.addEventListener('pointercancel', lift, true);
  const kick = () => { pending = true; plan(); };
  kick.flush = () => { if (pending) { pending = false; run(); } };
  return kick;
}
