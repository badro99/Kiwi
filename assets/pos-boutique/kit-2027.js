/* La caisse boutique sous la peau 2027 (kiwiSkin2027:till) : le rail du kit et
 * le fond d'ouverture compté sur le kit. Sorti de pos-boutique.js tel quel ;
 * drapeau éteint ou éléments du kit absents, rien ici ne s'exécute. */
let bqFloatSheet = null;
const tr = (s) => (window.KiwiCaisseLang && typeof window.KiwiCaisseLang.tr === 'function' ? window.KiwiCaisseLang.tr(s) : s);
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

/* Le rail du kit (§10.20) : quatre destinations et Plus, comme la caisse
   restaurant.

   On REMPLACE la barre livrée, on ne la REPEINT pas. C'est la recette de la
   caisse restaurant (assets/caisse/till-frame.js › tillKitOn : une boîte
   neuve avant .sidebar, que kit.css éteint ensuite). La repeindre était
   l'erreur : la barre livrée est SOMBRE, donc son logo est la version
   inverse (kiwi-newlogo-inverse.svg) et son enseigne est en #fff. Sur un
   fond clair ils devenaient blanc sur blanc, et les libellés dessinés en
   ligne se chevauchaient dès qu'on leur imposait une colonne (propriétaire,
   2026-10-28, captures de la tablette). Une barre qui ne peint plus n'a
   aucun de ces défauts, et il n'y a plus une seule couleur à rattraper.

   Ce qui n'est pas sur le rail n'est pas SUPPRIMÉ, il est DÉPLACÉ dans le
   panneau Plus : les mêmes nœuds, avec leurs propres écouteurs. Le panneau
   vit DANS #bq-nav, donc la délégation de clic du métier (switchView) voit
   encore les destinations déplacées. Et le rail n'invente aucun bouton : il
   CLIQUE celui que la boutique a livré, ce qui fait tourner son code à lui.
   Un libellé absent de #bq-nav ne donne pas de ligne de rail : il n'y a pas
   de liste de sélecteurs à mentir. */
const BQ_RAIL_MAIN = [
  ['vente', 'shopping_bag'],
  ['echanges', 'sync_alt'],
  ['inventaire', 'inventory_2'],
  ['clientes', 'group'],
];
let bqRail = null, bqMore = null, bqRoot = null, bqQ = null, bqWho = '';

/* Repeint le rail depuis le DOM livré : libellés et pastilles sont lus sur
   les boutons d'origine, donc rien à tenir en double. */
function bqKitRailPaint() {
  if (!bqRail || !bqMore || !bqRoot) return;
  const items = [];
  for (const [view, ic] of BQ_RAIL_MAIN) {
    const b = bqQ('#bq-nav .bq-nav-it[data-bq-view="' + view + '"]', bqRoot);
    if (!b) continue;
    const lab = b.querySelector('span');
    const bad = b.querySelector('.bq-nav-badge');
    const n = bad ? parseInt(String(bad.textContent).replace(/[^\d]/g, ''), 10) : 0;
    items.push({ id: view, icon: ic, label: (lab ? lab.textContent : view).trim(), badge: n > 0 ? n : 0 });
  }
  const open = !bqMore.hidden;
  items.push(open ? { id: 'more', icon: 'close', label: tr('Moins') } : { id: 'more', icon: 'more_horiz', label: tr('Plus') });
  bqRail.items = items;
  bqRail.footer = bqWho ? { cashier: bqWho } : {};
  /* Plus n'est jamais la valeur : <k-rail> refuse de ré-émettre sur
     l'élément qui porte déjà sa valeur, et Moins ne pourrait plus refermer. */
  const cur = bqQ('#bq-nav .bq-nav-it.on', bqRoot);
  bqRail.setAttribute('value', (cur && cur.dataset.bqView) || 'vente');
}

function bqKitRail(root, $, icons, on, who) {
  if (!root || !on || !customElements.get('k-rail')) return false;
  const nav = $('#bq-nav', root);
  const rail = root.querySelector('.bq-rail');
  if (!nav || !rail || nav.querySelector('#bq-more')) return false;
  const foot = root.querySelector('.bq-rail-foot');
  bqRoot = root; bqQ = $; bqWho = who || '';

  const more = document.createElement('div');
  more.className = 'bq-more';
  more.id = 'bq-more';
  more.hidden = true;
  /* Ordre d'origine conservé : les destinations d'abord, le pied ensuite. */
  const main = BQ_RAIL_MAIN.map((r) => r[0]);
  [...nav.children].forEach((el) => {
    if (el.dataset && main.indexOf(el.dataset.bqView) >= 0) return;
    more.appendChild(el);
  });
  if (foot) [...foot.children].forEach((el) => more.appendChild(el));
  nav.appendChild(more);
  bqMore = more;

  const box = document.createElement('div');
  box.id = 'bq-kit-rail';
  rail.parentNode.insertBefore(box, rail);
  bqRail = document.createElement('k-rail');
  bqRail.setAttribute('label', tr('Plus'));
  box.appendChild(bqRail);

  const close = () => { if (!more.hidden) { more.hidden = true; bqKitRailPaint(); } };
  const toggle = () => { more.hidden = !more.hidden; bqKitRailPaint(); icons(); };

  bqRail.addEventListener('kiwi:action', (e) => {
    const d = e.detail || {};
    if (d.action !== 'k.rail.select') return;
    e.stopPropagation();
    const id = d.id == null ? '' : String(d.id);
    if (id === 'more') { toggle(); return; }
    /* Le bouton livré, pas une copie : son écouteur, son switchView. */
    const b = $('#bq-nav .bq-nav-it[data-bq-view="' + id + '"]', root);
    if (b) b.click();
    close();
    bqKitRailPaint();
  });

  /* Un geste dans Plus fait son travail puis referme : le panneau ne reste
     pas par-dessus l'écran qu'il vient d'ouvrir. */
  more.addEventListener('click', () => setTimeout(close, 0));
  document.addEventListener('click', (e) => {
    if (!more.hidden && !more.contains(e.target) && !box.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  bqKitRailPaint();
  icons();
  return true;
}

export { bqKitRail, bqKitRailPaint, bqKitOpenSheet };
