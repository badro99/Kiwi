/* Identity-only coverage notice. Never receives verifier material. */
export function coverageText(names, tr, available = true) {
  if (!available) return tr('Accès hors ligne indisponible sur ce navigateur. Une connexion est nécessaire pour déverrouiller.');
  return tr('Accès hors ligne sur cet appareil') + ' · ' +
    (names.length ? names.join(', ') : tr('Aucun employé vérifié')) + '. ' +
    tr('Validité maximale : 7 jours. Les autres employés doivent déverrouiller une fois avec une connexion.');
}
export function showCoverage(screen, names, tr, available = true) {
  if (!screen) return;
  const old = screen.querySelector('[data-offline-coverage]');
  if (old) old.remove();
  const notice = document.createElement('p');
  notice.setAttribute('data-offline-coverage', '');
  notice.style.cssText = 'font-size:12px;line-height:1.5;max-width:40ch;margin:12px auto;overflow-wrap:anywhere;';
  notice.textContent = coverageText(names, tr, available);
  (screen.querySelector('.pin-card') || screen).appendChild(notice);
}
