/* Identity-only coverage notice. Never receives verifier material. */
export function coverageText(names, tr, available = true, endsAt = null) {
  if (!available) return tr('Ouverture sans internet indisponible sur ce navigateur. Une connexion est nécessaire.');
  /* Plain words (owner, 2026-10-27): who can open this till without internet,
     and what the others must do first. */
  return (names.length
    ? tr('Sans internet, ces employés peuvent ouvrir la caisse :') + ' ' + names.join(', ') + ' ' + tr('(72 heures au plus).') + ' ' +
      tr('Les autres doivent entrer leur code une fois avec internet.')
    : tr('Sans internet, personne ne peut encore ouvrir cette caisse.') + ' ' +
      tr('Chaque employé doit d’abord entrer son code une fois avec internet.')) +
    (endsAt ? ' ' + tr('Jusqu’au') + ' ' + new Date(endsAt).toLocaleString() : '');
}
export function showCoverage(screen, names, tr, available = true, endsAt = null) {
  if (!screen) return;
  const old = screen.querySelector('[data-offline-coverage]');
  if (old) old.remove();
  const notice = document.createElement('p');
  notice.setAttribute('data-offline-coverage', '');
  notice.style.cssText = 'font-size:12px;line-height:1.5;max-width:40ch;margin:12px auto;overflow-wrap:anywhere;';
  notice.textContent = coverageText(names, tr, available, endsAt);
  (screen.querySelector('.pin-card') || screen).appendChild(notice);
}
