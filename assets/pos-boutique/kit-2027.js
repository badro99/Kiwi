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
/* Les vues secondaires, celles qui ne tiennent pas dans le rail et vivent
   donc dans le tiroir. L'icône est nommée ici, jamais devinée : une icône
   absente du sprite dessine un blanc SILENCIEUX (§21.3). */
const BQ_MORE_VIEWS = [
  ['scan', 'barcode_scanner'],
  ['vendus', 'receipt_long'],
  ['acomptes', 'account_balance_wallet'],
];
/* Les commandes du tiroir, reconnues sur le bouton LIVRÉ : son identifiant,
   sa classe ou son action. Inconnue, elle garde « more_horiz » et sa place —
   on n'écarte jamais un bouton qu'on n'a pas su nommer. */
const BQ_MORE_ICONS = [
  ['#bq-fs', 'fullscreen'],
  ['#bq-lock', 'lock'],
  ['.kx-refresh', 'refresh'],
  ['[data-action="printer-connect"]', 'print'],
  ['[data-bq-act="reprint"]', 'print'],
  ['[data-bq-act="clock"]', 'schedule'],
  ['[data-bq-act="endshift"]', 'power_settings_new'],
  ['[data-bq-act="logout"]', 'logout'],
];
let bqRail = null, bqMore = null, bqRoot = null, bqQ = null, bqWho = '';
let bqSide = null;

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
  bqKitMorePaint();
}

/* L'élément LIVRÉ derrière une rangée du tiroir. Les destinations portent
   data-bq-view ; les commandes sont retrouvées par l'index qu'on leur a donné
   au repeint, pour ne dépendre d'aucune classe qui pourrait bouger. */
function bqMoreTarget(id) {
  if (!bqMore || !bqRoot) return null;
  if (id.indexOf('act:') === 0) {
    const i = parseInt(id.slice(4), 10);
    return bqMoreActs()[i] || null;
  }
  return bqQ('#bq-nav .bq-nav-it[data-bq-view="' + id + '"]', bqRoot);
}

/* Les commandes du tiroir : tout ce qui n'est ni une destination, ni le
   bandeau, ni le nav du kit, ni le pied — et rien de volontairement caché
   (#bq-net porte .kcl-hidden-net). */
function bqMoreActs() {
  if (!bqMore) return [];
  return [...bqMore.children].filter((el) => (
    el !== bqSide &&
    !el.classList.contains('bq-more-brand') &&
    !el.classList.contains('kcl') &&
    !el.classList.contains('kcl-hidden-net') &&
    !(el.dataset && el.dataset.bqView)
  ));
}

const bqIconFor = (el) => {
  for (const [sel, ic] of BQ_MORE_ICONS) { try { if (el.matches(sel)) return ic; } catch (_) {} }
  return 'more_horiz';
};

/* Repeint le tiroir depuis le DOM livré, comme le rail : libellés, pastilles
   et destination courante sont LUS, jamais tenus en double. */
function bqKitMorePaint() {
  if (!bqSide || !bqRoot) return;
  const label = (el) => {
    const sp = el.querySelector('span:not(.bq-nav-badge)');
    return ((sp ? sp.textContent : el.textContent) || '').replace(/\s+/g, ' ').trim();
  };
  const views = [];
  for (const [view, ic] of BQ_RAIL_MAIN.concat(BQ_MORE_VIEWS)) {
    const b = bqQ('#bq-nav .bq-nav-it[data-bq-view="' + view + '"]', bqRoot);
    if (!b) continue;
    const bad = b.querySelector('.bq-nav-badge');
    const n = bad ? parseInt(String(bad.textContent).replace(/[^\d]/g, ''), 10) : 0;
    views.push({ id: view, icon: ic, label: label(b), badge: n > 0 ? n : 0 });
  }
  views.push({ id: 'more', icon: 'close', label: tr('Moins') });
  const acts = bqMoreActs().map((el, i) => ({ id: 'act:' + i, icon: bqIconFor(el), label: label(el) }));
  bqSide.sections = [{ items: views }].concat(acts.length ? [{ label: tr('La caisse'), items: acts }] : []);
  const cur = bqQ('#bq-nav .bq-nav-it.on', bqRoot);
  bqSide.setAttribute('value', (cur && cur.dataset.bqView) || 'vente');
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

  /* Le tiroir du restaurant n'est pas une LISTE : c'est le rail déplié
     (assets/caisse/till-frame.js, tillKitMoreNavEl). Il pose un vrai
     <k-sidebar> du kit sur le fond sombre, destinations en tête, à pleine
     taille, puis les commandes en sections nommées. La boutique empilait ses
     boutons livrés tels quels — d'où la liste plate et le raccord visible
     (propriétaire, 2026-10-28). Même composant, donc : les rangées viennent
     du kit, et chacune clique le bouton d'origine. Le bandeau de marque et
     l'état de service tiennent le haut, comme là-bas. */
  if (customElements.get('k-sidebar')) {
    const brand = document.createElement('div');
    brand.className = 'bq-more-brand';
    const logo = root.querySelector('.bq-brand img');
    const vname = root.querySelector('.bq-venue-name');
    brand.innerHTML =
      (logo ? '<img class="bq-more-logo" alt="" src="' + logo.getAttribute('src') + '">' : '') +
      '<span class="bq-more-venue">' + ((vname && vname.textContent) || '').trim() + '</span>' +
      '<span class="bq-more-live"><i></i>' + tr('En service') + '</span>';
    more.insertBefore(brand, more.firstChild);

    bqSide = document.createElement('k-sidebar');
    bqSide.setAttribute('flush', '');
    /* Le fond est déjà sombre : le nav lit le jeu sombre du kit par l'îlot
       (§20.7, règle 5). Un hôte ne redéclare jamais un --k-* lui-même. */
    bqSide.setAttribute('data-k-ground', 'inverse');
    bqSide.setAttribute('label', tr('Plus'));
    more.insertBefore(bqSide, brand.nextSibling);

    /* Ce qui n'est PAS une rangée garde sa forme : le sélecteur de langue est
       un interrupteur à trois voies, pas un lien. Sa place au pied est tenue
       par `order` dans la feuille, pas par un déplacement ici — son module le
       réinsère APRÈS ce montage, et un nœud déplacé serait revenu en tête. */

    bqSide.addEventListener('kiwi:action', (e) => {
      const d = e.detail || {};
      if (d.action !== 'k.sidebar.select') return;
      e.stopPropagation();
      const id = d.id == null ? '' : String(d.id);
      if (id === 'more') { more.hidden = true; bqKitRailPaint(); icons(); return; }
      /* Le bouton livré, pas une copie : son écouteur, sa logique. */
      const el = bqMoreTarget(id);
      if (el) el.click();
      more.hidden = true;
      bqKitRailPaint();
      icons();
    });
  }

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

/* ═══════════ Le pied du ticket, comme au restaurant (peau 2027) ═══════════
   Le restaurant pose deux boutons secondaires côte à côte puis un primaire
   pleine largeur (assets/kit/till.js, .sec2 + primary). La boutique n'a pas
   de <k-bill> et n'en recevra pas un : on monte les MÊMES <k-button> du kit
   dans le pied livré, et chacun clique le bouton d'origine. Les couleurs
   viennent donc du kit, pas d'une copie — c'est la leçon du rail : remplacer,
   jamais repeindre. « Diviser » n'a pas de sens en boutique (chaque cliente
   paie la sienne), sa place revient à « Clientes » ; le bouton porte le nom
   de la cliente attachée, puisque la rangée du haut est éteinte.
   Kit absent : on rend false, le pied livré reste tel quel. */
function bqKitTicketFoot(ticketEl, $, icons, on, o) {
  if (!ticketEl || !on || !customElements.get('k-button')) return false;
  const foot = ticketEl.querySelector('.bq-tk-foot');
  const pay = ticketEl.querySelector('#bq-validate');
  if (!foot || !pay || foot.querySelector('#bq-kit-tkacts')) return false;

  const mk = (w, label, attrs) => {
    const b = document.createElement('k-button');
    b.dataset.bqTkAct = w;
    b.setAttribute('label', label);
    Object.keys(attrs || {}).forEach((k) => b.setAttribute(k, attrs[k]));
    return b;
  };

  const sec = document.createElement('div');
  sec.id = 'bq-kit-tkacts';
  sec.appendChild(mk('client', o.clientLabel));
  sec.appendChild(mk('remise', tr('Remise'), o.canRemise ? {} : { disabled: '' }));
  foot.insertBefore(sec, pay);

  /* Le primaire porte le libellé ET l'état du bouton livré : c'est lui qui
     décide quand on peut encaisser, pas nous. */
  const prim = mk('pay', pay.textContent.trim(), pay.disabled ? { variant: 'primary', size: 'L', full: '', disabled: '' } : { variant: 'primary', size: 'L', full: '' });
  foot.insertBefore(prim, pay.nextSibling);

  foot.addEventListener('kiwi:action', (e) => {
    const d = e.detail || {};
    if (d.action !== 'k.button.press') return;
    const host = e.target && e.target.closest ? e.target.closest('[data-bq-tk-act]') : null;
    if (!host) return;
    e.stopPropagation();
    const w = host.dataset.bqTkAct;
    /* Le bouton livré, pas une copie : son écouteur, sa logique. */
    if (w === 'pay') { pay.click(); return; }
    if (w === 'client') { const c = ticketEl.querySelector('#bq-tk-client'); if (c) c.click(); return; }
    if (w === 'remise' && typeof o.onRemise === 'function') o.onRemise();
  });
  icons();
  return true;
}

export { bqKitRail, bqKitRailPaint, bqKitOpenSheet, bqKitTicketFoot };
