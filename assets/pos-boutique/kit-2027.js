/* La caisse boutique sous la peau 2027 (kiwiSkin2027:till) : le rail du kit et
 * le fond d'ouverture compté sur le kit. Sorti de pos-boutique.js tel quel ;
 * drapeau éteint ou éléments du kit absents, rien ici ne s'exécute. */
let bqFloatSheet = null;
/* La feuille de comptage du fond d'ouverture, une fois le drapeau vérifié par
   pos-boutique.js (bqKitFloat). Rend true ; onCounted reçoit le montant COMPTÉ. */
function bqKitOpenSheet(screen, cc, onCounted, memKey) {
  if (bqFloatSheet) { try { bqFloatSheet.remove(); } catch (_) {} bqFloatSheet = null; }
  const sheet = document.createElement('k-sheet');
  sheet.setAttribute('size', 'count');
  sheet.appendChild(cc);
  document.body.appendChild(sheet);
  bqFloatSheet = sheet;
  sheet.addEventListener('kiwi:action', (e) => {
    const d = e.detail || {};
    if (d.action === 'k.sheet.close') { sheet.removeAttribute('open'); return; }
    /* « Saisir le total » : les pastilles livrées reprennent la main, et ce
       sont elles qui portent alors le montant. */
    if (d.action === 'k.cash-count.enter-total') {
      sheet.removeAttribute('open');
      const box = screen.querySelector('.clockin-float');
      if (box) box.classList.add('k-shown');
      const other = screen.querySelector('#bqci-chips [data-float="custom"]');
      if (other) other.click();
      return;
    }
    if (d.action !== 'k.cash-count.open') return;
    try { cc.committed(); } catch (_) {}
    sheet.removeAttribute('open');
    setTimeout(() => { try { sheet.remove(); } catch (_) {} }, 400);
    bqFloatSheet = null;
    onCounted(Math.max(0, Number((d.value || {}).counted) || 0));
  });
  let last = NaN;
  try { last = parseFloat(localStorage.getItem(memKey)); } catch (_) {}
  cc.count = { lastFloat: Number.isFinite(last) && last > 0 ? last : null };
  sheet.setAttribute('open', '');
  return true;
}

/* kiwiSkin2027:till · le rail du kit (§10.20) : quatre destinations et Plus,
   comme la caisse restaurant. Le reste n'est pas SUPPRIMÉ, il est DÉPLACÉ
   dans le panneau Plus — les mêmes nœuds, avec leurs propres écouteurs.
   On ne reconstruit aucun bouton et on ne cherche aucun sélecteur : ce qui
   était dans la barre y est encore, ailleurs. C'est la différence avec la
   liste de sélecteurs écrits à la main du restaurant, où une ligne qui ne
   correspond plus tombe sans bruit : ici il n'y a pas de liste à mentir.
   Le panneau vit DANS #bq-nav, donc la délégation de clic du métier
   (switchView) continue de voir les destinations déplacées. */
const BQ_RAIL_MAIN = ['vente', 'echanges', 'inventaire', 'clientes'];
function bqKitRail(root, $, icons, on) {
  if (!root || !on) return false;
  const nav = $('#bq-nav', root);
  if (!nav || nav.querySelector('#bq-more')) return false;
  const foot = root.querySelector('.bq-rail-foot');

  const more = document.createElement('div');
  more.className = 'bq-more';
  more.id = 'bq-more';
  more.hidden = true;
  /* Ordre d'origine conservé : les destinations d'abord, le pied ensuite. */
  [...nav.children].forEach((el) => {
    if (el.dataset && BQ_RAIL_MAIN.indexOf(el.dataset.bqView) >= 0) return;
    more.appendChild(el);
  });
  if (foot) [...foot.children].forEach((el) => more.appendChild(el));

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'bq-nav-it bq-plus';
  plus.id = 'bq-plus';
  plus.setAttribute('aria-expanded', 'false');
  plus.setAttribute('aria-controls', 'bq-more');
  plus.innerHTML = '<i data-icon="more_horiz"></i><span>Plus</span>';
  nav.appendChild(plus);
  nav.appendChild(more);

  const close = () => { more.hidden = true; plus.setAttribute('aria-expanded', 'false'); };
  plus.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = more.hidden;
    more.hidden = !open;
    plus.setAttribute('aria-expanded', open ? 'true' : 'false');
    icons();
  });
  /* Un geste dans Plus fait son travail puis referme : le panneau ne reste
     pas par-dessus l'écran qu'il vient d'ouvrir. */
  more.addEventListener('click', () => setTimeout(close, 0));
  document.addEventListener('click', (e) => {
    if (!more.hidden && !more.contains(e.target) && !plus.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  icons();
  return true;
}

export { bqKitRail, bqKitOpenSheet };
