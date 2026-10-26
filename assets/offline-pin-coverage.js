/* Identity-only coverage notice. Never receives verifier material. */
export function coverageText(names, tr) {
  return tr('Accès hors ligne sur cet appareil') + ' · ' +
    (names.length ? names.join(', ') : tr('Aucun employé vérifié')) + '. ' +
    tr('Validité maximale : 7 jours. Les autres employés doivent se connecter.');
}
export function showCoverage(screen, names, tr) {
  if (!screen) return;
  const old = screen.querySelector('[data-offline-coverage]');
  if (old) old.remove();
  const notice = document.createElement('p');
  notice.setAttribute('data-offline-coverage', '');
  notice.style.cssText = 'font-size:12px;line-height:1.5;max-width:40ch;margin:12px auto;overflow-wrap:anywhere;';
  notice.textContent = coverageText(names, tr);
  (screen.querySelector('.pin-card') || screen).appendChild(notice);
}
