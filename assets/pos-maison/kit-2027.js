/* La caisse MAISON (art de table) sous la peau 2027 (kiwiSkin2027:till).
 * Copie de assets/pos-boutique/kit-2027.js, préfixe mz- : la maison est un
 * fork de la boutique, donc mêmes écrans, mêmes places (propriétaire,
 * 2026-10-30 : « fais-la ressembler à la boutique »). Ce qui ne diffère :
 * Fournisseurs va dans Plus ; Mouvements de stock et Déclarer Casse s'ouvrent
 * depuis l'Inventaire, pas de Remise au ticket, et son écran
 * d'ouverture garde les identifiants bqci-* hérités de la boutique.
 * Drapeau éteint ou kit absent, rien ici ne s'exécute. */
let mzFloatSheet = null;
const tr = (s) => (window.KiwiCaisseLang && typeof window.KiwiCaisseLang.tr === 'function' ? window.KiwiCaisseLang.tr(s) : s);
/* La feuille de comptage du fond d'ouverture, une fois le drapeau vérifié par
   pos-boutique.js (mzKitFloat). Rend true ; onCounted reçoit le montant COMPTÉ. */
function mzKitOpenSheet(screen, cc, onCounted, memKey) {
  if (mzFloatSheet) { try { mzFloatSheet.remove(); } catch (_) {} mzFloatSheet = null; }
  const sheet = document.createElement('k-sheet');
  sheet.setAttribute('size', 'count');
  sheet.appendChild(cc);
  document.body.appendChild(sheet);
  mzFloatSheet = sheet;
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
    mzFloatSheet = null;
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
   vit DANS #mz-nav, donc la délégation de clic du métier (switchView) voit
   encore les destinations déplacées. Et le rail n'invente aucun bouton : il
   CLIQUE celui que la boutique a livré, ce qui fait tourner son code à lui.
   Un libellé absent de #mz-nav ne donne pas de ligne de rail : il n'y a pas
   de liste de sélecteurs à mentir. */
const MZ_RAIL_MAIN = [
  ['vente', 'shopping_bag'],
  ['echanges', 'sync_alt'],
  ['inventaire', 'inventory_2'],
  ['clientes', 'group'],
];
/* Les vues secondaires, celles qui ne tiennent pas dans le rail et vivent
   donc dans le tiroir. L'icône est nommée ici, jamais devinée : une icône
   absente du sprite dessine un blanc SILENCIEUX (§21.3). */
const MZ_MORE_VIEWS = [
  ['scan', 'barcode_scanner'],
  ['vendus', 'receipt_long'],
  ['acomptes', 'account_balance_wallet'],
  ['livraisons', 'local_shipping'],
  /* La vue propre à la maison, après celles de la boutique. */
  ['fournisseurs', 'storefront'],
];
/* Mouvements de stock et Déclarer casse s'ouvrent depuis l'Inventaire
   (propriétaire, 2026-10-30 : « pas besoin d'un bouton à eux ») : ni rail ni
   Plus, et pendant qu'ils sont ouverts le rail reste sur Inventaire. */
const MZ_PARENT = { mouvements: 'inventaire', casse: 'inventaire' };
const mzRailValue = (cur) => { const v = (cur && cur.dataset.mzView) || 'vente'; return MZ_PARENT[v] || v; };
/* Les commandes du tiroir, reconnues sur le bouton LIVRÉ : son identifiant,
   sa classe ou son action. Inconnue, elle garde « more_horiz » et sa place —
   on n'écarte jamais un bouton qu'on n'a pas su nommer. */
const MZ_MORE_ICONS = [
  ['#mz-fs', 'fullscreen'],
  ['#mz-lock', 'lock'],
  ['.kx-refresh', 'refresh'],
  ['[data-action="printer-connect"]', 'print'],
  /* Les trois que posent la boutique et les modules partagés : Fin de
     service (pos-boutique.js), Code de pointage (caisse-refresh.js) et
     Réimprimer (pos-reprint.js). */
  ['#mz-open-drawer', 'point_of_sale'],
  ['#mz-close-day', 'power_settings_new'],
  ['.kx-attendance-code', 'key'],
  ['.kx-reprint', 'receipt'],
  ['[data-mz-act="reprint"]', 'print'],
  ['[data-mz-act="clock"]', 'schedule'],
  ['[data-mz-act="endshift"]', 'power_settings_new'],
  ['[data-mz-act="logout"]', 'logout'],
];
let mzRail = null, mzMore = null, mzRoot = null, mzQ = null, mzWho = '';
let mzSide = null;

/* Repeint le rail depuis le DOM livré : libellés et pastilles sont lus sur
   les boutons d'origine, donc rien à tenir en double. */
function mzKitRailPaint() {
  if (!mzRail || !mzMore || !mzRoot) return;
  const items = [];
  for (const [view, ic] of MZ_RAIL_MAIN) {
    const b = mzQ('#mz-nav .mz-nav-it[data-mz-view="' + view + '"]', mzRoot);
    if (!b) continue;
    const lab = b.querySelector('span');
    const bad = b.querySelector('.mz-nav-badge');
    const n = bad ? parseInt(String(bad.textContent).replace(/[^\d]/g, ''), 10) : 0;
    items.push({ id: view, icon: ic, label: (lab ? lab.textContent : view).trim(), badge: n > 0 ? n : 0 });
  }
  const open = !mzMore.hidden;
  /* La feuille en a besoin pour passer Plus au-dessus du carnet clients. */
  try { document.documentElement.toggleAttribute('data-mz-more', open); } catch (_) {}
  items.push(open ? { id: 'more', icon: 'close', label: tr('Moins') } : { id: 'more', icon: 'more_horiz', label: tr('Plus') });
  mzRail.items = items;
  mzRail.footer = mzWho ? { cashier: mzWho } : {};
  /* Plus n'est jamais la valeur : <k-rail> refuse de ré-émettre sur
     l'élément qui porte déjà sa valeur, et Moins ne pourrait plus refermer. */
  const cur = mzQ('#mz-nav .mz-nav-it.on', mzRoot);
  mzRail.setAttribute('value', mzRailValue(cur));
  mzKitMorePaint();
}

/* L'élément LIVRÉ derrière une rangée du tiroir. Les destinations portent
   data-mz-view ; les commandes sont retrouvées par l'index qu'on leur a donné
   au repeint, pour ne dépendre d'aucune classe qui pourrait bouger. */
function mzMoreTarget(id) {
  if (!mzMore || !mzRoot) return null;
  if (id.indexOf('act:') === 0) {
    const i = parseInt(id.slice(4), 10);
    return mzMoreActs()[i] || null;
  }
  return mzQ('#mz-nav .mz-nav-it[data-mz-view="' + id + '"]', mzRoot);
}

/* Les commandes du tiroir : tout ce qui n'est ni une destination, ni le
   bandeau, ni le nav du kit, ni le pied — et rien de volontairement caché
   (#mz-net porte .kcl-hidden-net). */
function mzMoreActs() {
  if (!mzMore) return [];
  return [...mzMore.children].filter((el) => (
    el !== mzSide &&
    !el.classList.contains('mz-more-brand') &&
    !el.classList.contains('kcl') &&
    !el.classList.contains('kcl-hidden-net') &&
    !(el.dataset && el.dataset.mzView)
  ));
}

/* L'ordre du tiroir (propriétaire, 2026-10-28 : « ça semble mélangé »).
   Service : ce que l'on fait au comptoir, la fin de service en dernier.
   Cet appareil : la tablette elle-même, Verrouiller en dernier. Une commande
   inconnue se range dans Service, avant la fin de service. */
const MZ_MORE_ORDER = [
  ['#mz-open-drawer', 1],
  ['.kx-reprint, [data-mz-act="reprint"]', 2],
  ['.kx-attendance-code, [data-mz-act="clock"]', 3],
  ['#mz-close-day, [data-mz-act="endshift"]', 9],
  ['[data-action="printer-connect"]', 11],
  ['#mz-fs', 12],
  ['.kx-refresh', 13],
  ['#mz-lock, [data-mz-act="logout"]', 19],
];
const mzMoreRank = (el) => {
  for (const [sel, n] of MZ_MORE_ORDER) { try { if (el.matches(sel)) return n; } catch (_) {} }
  return 5;
};
/* Titres de section : les clés du kit, déjà traduites FR · EN · AR. */
const mzKitT = (key, fb) => {
  try { const K = window.KiwiKit; const v = K && typeof K.t === 'function' ? K.t(key) : ''; if (v && v !== key) return v; } catch (_) {}
  return fb;
};

const mzIconFor = (el) => {
  for (const [sel, ic] of MZ_MORE_ICONS) { try { if (el.matches(sel)) return ic; } catch (_) {} }
  return 'more_horiz';
};

/* Repeint le tiroir depuis le DOM livré, comme le rail : libellés, pastilles
   et destination courante sont LUS, jamais tenus en double. */
function mzKitMorePaint() {
  if (!mzSide || !mzRoot) return;
  const label = (el) => {
    const sp = el.querySelector('span:not(.mz-nav-badge)');
    return ((sp ? sp.textContent : el.textContent) || '').replace(/\s+/g, ' ').trim();
  };
  const views = [];
  for (const [view, ic] of MZ_RAIL_MAIN.concat(MZ_MORE_VIEWS)) {
    const b = mzQ('#mz-nav .mz-nav-it[data-mz-view="' + view + '"]', mzRoot);
    if (!b) continue;
    const bad = b.querySelector('.mz-nav-badge');
    const n = bad ? parseInt(String(bad.textContent).replace(/[^\d]/g, ''), 10) : 0;
    views.push({ id: view, icon: ic, label: label(b), badge: n > 0 ? n : 0 });
  }
  views.push({ id: 'more', icon: 'close', label: tr('Moins') });
  /* Rangées triées en deux groupes, comme le Plus du restaurant
     : Service, puis Cet appareil. L'id reste
     l'index LIVRÉ, donc chaque rangée clique toujours son propre bouton. */
  const acts = mzMoreActs().map((el, i) => ({ id: 'act:' + i, icon: mzIconFor(el), label: label(el), at: mzMoreRank(el), i }))
    .sort((a, b) => (a.at - b.at) || (a.i - b.i));
  const strip = (r) => ({ id: r.id, icon: r.icon, label: r.label });
  const shift = acts.filter((r) => r.at < 10).map(strip);
  const device = acts.filter((r) => r.at >= 10).map(strip);
  mzSide.sections = [{ items: views }]
    .concat(shift.length ? [{ label: mzKitT('till.more.shift', tr('Service')), items: shift }] : [])
    .concat(device.length ? [{ label: mzKitT('till.more.device', tr('Cet appareil')), items: device }] : []);
  const cur = mzQ('#mz-nav .mz-nav-it.on', mzRoot);
  mzSide.setAttribute('value', mzRailValue(cur));
}

function mzKitRail(root, $, icons, on, who) {
  if (!root || !on || !customElements.get('k-rail')) return false;
  const nav = $('#mz-nav', root);
  const rail = root.querySelector('.mz-rail');
  if (!nav || !rail || nav.querySelector('#mz-more')) return false;
  const foot = root.querySelector('.mz-rail-foot');
  mzRoot = root; mzQ = $; mzWho = who || '';

  const more = document.createElement('div');
  more.className = 'mz-more';
  more.id = 'mz-more';
  more.hidden = true;
  /* Tout le tiroir est sombre : la marque et la langue lisent le jeu sombre
     du kit, comme le nav (§20.7, règle 5), sinon leur encre sort foncée. */
  more.setAttribute('data-k-ground', 'inverse');
  /* Ordre d'origine conservé : les destinations d'abord, le pied ensuite. */
  const main = MZ_RAIL_MAIN.map((r) => r[0]);
  [...nav.children].forEach((el) => {
    if (el.dataset && main.indexOf(el.dataset.mzView) >= 0) return;
    more.appendChild(el);
  });
  if (foot) [...foot.children].forEach((el) => more.appendChild(el));
  nav.appendChild(more);
  mzMore = more;
  /* Le voile du restaurant (#kit-more-scrim) : le panneau s'ouvre À LA PLACE
     du rail, la page derrière s'assombrit, et toucher le voile referme
     seulement — un article ne s'ajoute pas au ticket par un geste de
     fermeture (propriétaire, 2026-10-28). Il suit `more.hidden` par la
     feuille (.mz-more:not([hidden]) + .mz-more-scrim), sans état en double. */
  const scrim = document.createElement('div');
  scrim.className = 'mz-more-scrim';
  scrim.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); close(); });
  scrim.addEventListener('click', (e) => e.stopPropagation());
  nav.appendChild(scrim);

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
    brand.className = 'mz-more-brand';
    const logo = root.querySelector('.mz-brand img');
    const vname = root.querySelector('.mz-venue-name');
    /* Construit par nœuds : le nom de l'enseigne est un texte, jamais du HTML. */
    if (logo) {
      const img = document.createElement('img');
      img.className = 'mz-more-logo'; img.alt = ''; img.src = logo.getAttribute('src');
      brand.appendChild(img);
    }
    const vn = document.createElement('span');
    vn.className = 'mz-more-venue';
    vn.textContent = ((vname && vname.textContent) || '').trim();
    const live = document.createElement('span');
    live.className = 'mz-more-live';
    live.appendChild(document.createElement('i'));
    live.appendChild(document.createTextNode(tr('En service')));
    brand.append(vn, live);
    more.insertBefore(brand, more.firstChild);

    mzSide = document.createElement('k-sidebar');
    mzSide.setAttribute('flush', '');
    /* Le fond est déjà sombre : le nav lit le jeu sombre du kit par l'îlot
       (§20.7, règle 5). Un hôte ne redéclare jamais un --k-* lui-même. */
    mzSide.setAttribute('data-k-ground', 'inverse');
    mzSide.setAttribute('label', tr('Plus'));
    more.insertBefore(mzSide, brand.nextSibling);

    /* Ce qui n'est PAS une rangée garde sa forme : le sélecteur de langue est
       un interrupteur à trois voies, pas un lien. Sa place au pied est tenue
       par `order` dans la feuille, pas par un déplacement ici — son module le
       réinsère APRÈS ce montage, et un nœud déplacé serait revenu en tête. */

    mzSide.addEventListener('kiwi:action', (e) => {
      const d = e.detail || {};
      if (d.action !== 'k.sidebar.select') return;
      e.stopPropagation();
      const id = d.id == null ? '' : String(d.id);
      if (id === 'more') { more.hidden = true; mzKitRailPaint(); icons(); return; }
      /* Le bouton livré, pas une copie : son écouteur, sa logique. */
      const el = mzMoreTarget(id);
      if (el) el.click();
      more.hidden = true;
      mzKitRailPaint();
      icons();
    });
  }

  const box = document.createElement('div');
  box.id = 'mz-kit-rail';
  rail.parentNode.insertBefore(box, rail);
  mzRail = document.createElement('k-rail');
  mzRail.setAttribute('label', tr('Plus'));
  box.appendChild(mzRail);

  const close = () => { if (!more.hidden) { more.hidden = true; mzKitRailPaint(); } };
  const toggle = () => { more.hidden = !more.hidden; mzKitRailPaint(); icons(); };

  mzRail.addEventListener('kiwi:action', (e) => {
    const d = e.detail || {};
    if (d.action !== 'k.rail.select') return;
    e.stopPropagation();
    const id = d.id == null ? '' : String(d.id);
    if (id === 'more') { toggle(); return; }
    /* Le bouton livré, pas une copie : son écouteur, son switchView. */
    const b = $('#mz-nav .mz-nav-it[data-mz-view="' + id + '"]', root);
    if (b) b.click();
    close();
    mzKitRailPaint();
  });

  /* Un geste dans Plus fait son travail puis referme : le panneau ne reste
     pas par-dessus l'écran qu'il vient d'ouvrir. */
  more.addEventListener('click', () => setTimeout(close, 0));
  document.addEventListener('click', (e) => {
    if (!more.hidden && !more.contains(e.target) && !box.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  mzKitRailPaint();
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
function mzKitTicketFoot(ticketEl, $, icons, on, o) {
  if (!ticketEl || !on) return false;
  mzKitTicketEmpty(ticketEl);
  if (!customElements.get('k-button')) return false;
  const foot = ticketEl.querySelector('.mz-tk-foot');
  const pay = ticketEl.querySelector('#mz-validate');
  if (!foot || !pay || foot.querySelector('#mz-kit-tkacts')) return false;

  const mk = (w, label, attrs) => {
    const b = document.createElement('k-button');
    b.dataset.mzTkAct = w;
    b.setAttribute('label', label);
    Object.keys(attrs || {}).forEach((k) => b.setAttribute(k, attrs[k]));
    return b;
  };

  const sec = document.createElement('div');
  sec.id = 'mz-kit-tkacts';
  sec.appendChild(mk('client', o.clientLabel));
  /* La maison n'a pas de remise au ticket : sans o.onRemise, pas de bouton. */
  if (typeof o.onRemise === 'function') sec.appendChild(mk('remise', tr('Remise'), o.canRemise ? {} : { disabled: '' }));
  foot.insertBefore(sec, pay);

  /* Le primaire porte le libellé ET l'état du bouton livré : c'est lui qui
     décide quand on peut encaisser, pas nous. */
  const prim = mk('pay', pay.textContent.trim(), pay.disabled ? { variant: 'primary', size: 'L', full: '', disabled: '' } : { variant: 'primary', size: 'L', full: '' });
  foot.insertBefore(prim, pay.nextSibling);

  foot.addEventListener('kiwi:action', (e) => {
    const d = e.detail || {};
    if (d.action !== 'k.button.press') return;
    const host = e.target && e.target.closest ? e.target.closest('[data-mz-tk-act]') : null;
    if (!host) return;
    e.stopPropagation();
    const w = host.dataset.mzTkAct;
    /* Le bouton livré, pas une copie : son écouteur, sa logique. */
    if (w === 'pay') { pay.click(); return; }
    if (w === 'client') { const c = ticketEl.querySelector('#mz-tk-client'); if (c) c.click(); return; }
    if (w === 'remise' && typeof o.onRemise === 'function') o.onRemise();
  });
  icons();
  return true;
}

/* Le ticket vide, avec les mots et le corps du restaurant (<k-bill>, .em :
   un titre k-heading, une ligne k-foot, rien d'autre). L'icône livrée porte
   son display EN LIGNE : une règle de feuille ne l'éteint pas, il faut
   réécrire le bloc. Le bloc garde sa classe, donc tout ce qui le cherche le
   trouve encore. */
function mzKitTicketEmpty(ticketEl) {
  const em = ticketEl.querySelector('.mz-tk-empty');
  if (!em || em.dataset.mzKit) return;
  em.dataset.mzKit = '1';
  em.removeAttribute('style');
  em.innerHTML = '<p class="k-heading">' + tr('Aucun article') + '</p>'
    + '<p class="k-foot k-ink2">' + tr('Touchez un article.') + '</p>';
}

/* ═══════════ La barre de vente (peau 2027) ═══════════
   Le code-barres du rail, et une liste qui répond dès le premier chiffre :
   chaque chiffre de plus la resserre. La recherche elle-même vit dans
   pos-boutique.js (o.search) ; ici on ne fait que dessiner et choisir.

   La douchette ne doit rien sentir. Elle tape le code d'un trait puis Entrée,
   et c'est l'écouteur livré qui l'ajoute. Une ligne n'est donc JAMAIS
   présélectionnée : Entrée ne choisit une ligne que si on l'a désignée aux
   flèches, sinon elle passe à l'écouteur livré comme avant. On écoute en
   CAPTURE sur la barre (un ancêtre du champ) pour pouvoir, dans ce seul cas,
   arrêter Entrée avant lui. Choisir une ligne passe par o.commit (commitEan,
   le chemin de la douchette) ou, pour un article sans code, o.open (la fiche
   de la tuile) : aucune logique de vente n'est copiée ici. */
function mzKitScanBar(bar, o) {
  /* o.id : deux barres (Vente, Inventaire) vivent dans le même écran, chacune
     sa liste. o.plain : la livrée d'avant garde son icône et ses mots. */
  const lid = o.id || 'mz-sgst';
  if (!bar || !o || !o.input || bar.querySelector('.mz-sgst')) return false;
  const input = o.input;
  const old = o.plain ? null : bar.querySelector(':scope > svg, :scope > i');
  if (old) {
    const ic = document.createElement('i');
    ic.setAttribute('data-icon', 'barcode_scanner');
    ic.className = 'mz-sell-scan-ic';
    old.replaceWith(ic);
  }
  if (!o.plain) input.setAttribute('placeholder', tr('Rechercher un article'));
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', lid);
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('inputmode', 'search');
  const list = document.createElement('div');
  list.id = lid;
  list.className = 'mz-sgst';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  bar.appendChild(list);

  let rows = [], at = -1, timer = 0;
  const esc = o.esc;
  const close = () => {
    clearTimeout(timer);
    list.hidden = true; list.innerHTML = ''; rows = []; at = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  const mark = (i) => {
    at = i;
    list.querySelectorAll('.mz-sgst-it').forEach((b, k) => b.classList.toggle('on', k === i));
    const b = list.querySelector('[data-sgst="' + i + '"]');
    if (b) { input.setAttribute('aria-activedescendant', b.id); b.scrollIntoView({ block: 'nearest' }); }
  };
  /* La partie tapée, en gras dans le code : on voit d'un coup d'œil ce qui reste. */
  const hl = (text, q) => {
    const k = text.toLowerCase().indexOf(q.toLowerCase());
    if (k < 0 || !q) return esc(text);
    return esc(text.slice(0, k)) + '<b>' + esc(text.slice(k, k + q.length)) + '</b>' + esc(text.slice(k + q.length));
  };
  const row = (r, i, q) => '<button type="button" class="mz-sgst-it" role="option" tabindex="-1" id="' + lid + '-' + i + '" data-sgst="' + i + '">'
    + '<span class="mz-sgst-art">' + o.visual(r) + '</span>'
    + '<span class="mz-sgst-txt"><span class="mz-sgst-nm">' + (r.why === 'nom' ? hl(r.name, q) : esc(r.name)) + '</span>'
    + '<span class="mz-sgst-sub">' + (r.detail ? esc(r.detail) : '')
    + (r.ean ? '<span class="mz-sgst-cd">' + (r.why === 'ean' ? hl(r.ean, q) : esc(r.ean)) + '</span>' : '') + '</span></span>'
    + '<span class="mz-sgst-end"><span class="mz-sgst-pz">' + (r.was ? '<s>' + o.money(r.was) + '</s> ' : '') + o.money(r.price) + '</span>'
    + (r.stock > 0 ? '<span class="mz-sgst-st">' + r.stock + ' ' + tr('en stock') + '</span>' : '<span class="mz-sgst-st out">' + tr('épuisé') + '</span>')
    + '</span></button>';
  const paint = () => {
    const q = input.value.trim();
    if (!q) { close(); return; }
    rows = o.search(q) || [];
    if (!rows.length) {
      list.innerHTML = '<div class="mz-sgst-none">' + tr('Aucun article trouvé') + '</div>';
      list.hidden = false; at = -1;
      input.setAttribute('aria-expanded', 'false');
      return;
    }
    at = -1;
    list.innerHTML = rows.map((r, i) => row(r, i, q)).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
    if (typeof o.icons === 'function') o.icons();
  };
  const choose = (i) => {
    const r = rows[i];
    if (!r) return;
    input.value = '';
    close();
    try { input.focus(); } catch (_) {}
    if (r.ean) o.commit(r.ean); else o.open(r.pid);
  };

  /* Une frappe humaine voit la liste « tout de suite » (moins d'une image) ;
     une douchette finit son code avant, et ne fait qu'une recherche. */
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(paint, 60); });
  input.addEventListener('focus', () => { if (input.value.trim()) paint(); });
  input.addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== input) close(); }, 150); });
  bar.addEventListener('keydown', (e) => {
    if (e.target !== input) return;
    if (e.key === 'Escape') { if (!list.hidden) { e.preventDefault(); close(); } return; }
    if (e.key === 'Enter') {
      if (at >= 0 && rows[at]) { e.preventDefault(); e.stopPropagation(); choose(at); return; }
      /* o.enterFirst (Inventaire) : un NOM tapé puis Entrée ouvre le premier
         résultat ; un code (chiffres seuls) part toujours à la douchette. */
      const q = input.value.trim();
      if (o.enterFirst && q && !/^[0-9]+$/.test(q)) {
        rows = o.search(q) || [];
        if (rows.length) { e.preventDefault(); e.stopPropagation(); choose(0); return; }
      }
      close();          // Entrée part à l'écouteur livré, qui vide le champ
      return;
    }
    if (list.hidden || !rows.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); mark(at + 1 >= rows.length ? 0 : at + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mark(at <= 0 ? rows.length - 1 : at - 1); }
  }, true);
  /* Le doigt sur une ligne ne doit pas faire perdre le focus au champ. */
  list.addEventListener('pointerdown', (e) => { e.preventDefault(); });
  list.addEventListener('mousedown', (e) => { e.preventDefault(); });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sgst]');
    if (b) choose(Number(b.dataset.sgst));
  });
  if (typeof o.icons === 'function') o.icons();
  return true;
}

/* La recherche et la barre des rayons défilent AVEC les articles
   (propriétaire, 2026-10-28) : fixes, elles mangeaient la hauteur de la
   grille. Seul le titre Vente (et le bandeau d'échange en cours) reste. Les
   nœuds livrés sont DÉPLACÉS dans une boîte qui défile, jamais reconstruits :
   leurs id, leurs écouteurs (douchette, liste de recherche) et renderCats /
   renderGrid (qui écrivent leur innerHTML) ne voient aucune différence. */
function mzKitSellScroll(sell) {
  if (!sell || sell.querySelector(':scope > .mz-sell-scroll')) return false;
  const scan = sell.querySelector(':scope > .mz-sell-scan');
  const cats = sell.querySelector(':scope > #mz-cats');
  const grid = sell.querySelector(':scope > #mz-gridwrap');
  if (!scan || !cats || !grid) return false;
  const box = document.createElement('div');
  box.className = 'mz-sell-scroll';
  sell.insertBefore(box, scan);
  box.appendChild(scan);
  box.appendChild(cats);
  box.appendChild(grid);
  return true;
}


/* ═══════════ La recherche de la barre de vente (peau 2027) ═══════════
   Copie de pos-boutique/search.js › searchArticles, mot pour mot. Seule
   différence côté appelant : la maison retire le stock dès qu'un article
   entre au ticket (holdStock), donc son « disponible » est le rayon tel quel. */
function mzSearchArticles(raw, d, limit, opts) {
  const { P, BY_EAN, promoFor, shelf, stockOf, availableStock, colorLabel } = d;
  const q = String(raw || '').trim();
  if (!q) return [];
  /* opts.variants (barre de vente) : un nom trouvé liste CHAQUE déclinaison
     (taille × couleur) avec son propre stock, comme la fiche de la tuile. La
     barre de l'Inventaire garde une ligne par article : elle ouvre sa fiche. */
  const byVariant = !!(opts && opts.variants);
  const max = limit || (byVariant ? 30 : 8);
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const needle = fold(q);
  const cat = window.KiwiBoutiqueCatalog;
  const out = [], seen = new Set();
  const push = (pid, ean, why, variant) => {
    const p = P[pid];
    const key = ean || (variant ? 'v:' + variant.id : 'p:' + pid);
    if (!p || seen.has(key) || out.length >= max) return;
    seen.add(key);
    let hit = null;
    try { hit = ean && cat ? cat.resolveScan(ean) : null; } catch (_) {}
    if (!hit && variant) hit = { size: variant.size, colorId: variant.colorId, colorFamily: variant.colorFamily };
    const color = hit && (hit.colorFamily || hit.colorId);
    const pr = promoFor(pid);
    out.push({
      pid, ean: ean || '', why, name: p.name,
      detail: [hit && hit.size, color ? colorLabel(color) : ''].filter(Boolean).join(' · '),
      price: pr ? pr.price : shelf(p.price), was: pr ? pr.was : 0,
      stock: hit && hit.size ? availableStock(pid, hit.size, color || p.colors[0]) : stockOf(p),   // ce qui reste, ticket déduit
      art: p.art, artPicked: !!p.artPicked, colors: p.colors, photo: p.photo || '',
    });
  };
  if (/^[0-9]+$/.test(q)) {
    const codes = Object.keys(BY_EAN);
    for (const c of codes) { if (out.length >= max) break; if (c.indexOf(q) === 0) push(BY_EAN[c], c, 'ean'); }
    for (const c of codes) { if (out.length >= max) break; if (c.indexOf(q) > 0) push(BY_EAN[c], c, 'ean'); }
  }
  for (const pid of Object.keys(P)) {
    if (out.length >= max) break;
    const p = P[pid];
    if (!p || p.id !== pid) continue;           // un alias (legacyId) pointe le même article
    if (fold(p.name + ' ' + (p.marque || '') + ' ' + (p.sku || '')).indexOf(needle) >= 0) {
      let vs = [];
      try { vs = byVariant && cat && cat.listVariants ? cat.listVariants(pid) || [] : []; } catch (_) { vs = []; }
      if (!vs.length) { push(pid, p.ean || '', 'nom'); continue; }
      for (const v of vs) {
        if (out.length >= max) break;
        const code = (v.barcodes || []).length ? ((v.barcodes.find((b) => b.primary) || v.barcodes[0]).code || '') : '';
        push(pid, code, 'nom', v);
      }
    }
  }
  return out;
}

/* Monte la liste sur la barre de vente, peau allumée et kit présent
   seulement. d vient de sales.js : ses propres fonctions, rien de copié. */
function mzSellSearch(bar, input, on, d) {
  if (!bar || !input || !on) return false;
  mzKitSellScroll(bar.parentNode);   // recherche + rayons défilent avec la grille
  return mzKitScanBar(bar, {
    input, commit: d.commit, open: d.open, money: d.money, esc: d.esc, icons: d.icons,
    search: (q) => mzSearchArticles(q, d.catalog(), 0, { variants: true }),
    visual: (r) => (r.photo ? '<img class="mz-product-photo" src="' + d.esc(r.photo) + '" alt="" loading="lazy" />' : d.artOf(r)),
  });
}

/* La même liste sur la barre de l'Inventaire, comme la boutique
   (pos-boutique/inv-tools.js › invSearch), sous la peau seulement : une ligne
   par article, Entrée sur un nom ouvre le premier, un code part à la douchette. */
function mzInvSearch(bar, input, on, d) {
  if (!bar || !input || !on) return false;
  return mzKitScanBar(bar, {
    input, id: 'mzi-sgst', enterFirst: true,
    commit: d.code, open: d.open, money: d.money, esc: d.esc, icons: d.icons,
    search: (q) => mzSearchArticles(q, d.catalog()),
    visual: (r) => (r.photo ? '<img class="mz-product-photo" src="' + d.esc(r.photo) + '" alt="" loading="lazy" />' : d.artOf(r)),
  });
}

/* La peau est-elle demandée (le drapeau seul ; chaque montage vérifie ensuite
   que ses éléments du kit sont définis). */
function mzSkinOn() { try { return document.documentElement.getAttribute('data-skin-2027') === 'till'; } catch (_) { return false; } }
/* Le libellé du bouton Clients du pied, comme la boutique (ticket-remise.js ›
   ticketClientLabel) : il porte la cliente attachée. */
function mzClientLabel(t, clById, firstName) {
  if (!t.client) return tr('Clients');
  if (t.client === 'passage') return tr('Cliente de passage');
  const c = clById(t.client);
  return c && c.name ? firstName(c.name) || c.name : tr('Clients');
}

/* kiwiSkin2027:till · le kit est là (drapeau + éléments définis), comme
   pos-boutique.js › bqKitSkin. Sans lui, l'écran d'ouverture garde ses pastilles. */
function mzKitReady() { try { return document.documentElement.getAttribute('data-skin-2027') === 'till' && !!customElements.get('k-cash-count') && !!customElements.get('k-sheet'); } catch (_) { return false; } }
/* Le fond d'ouverture compté sur <k-cash-count mode="open">, comme
   pos-boutique.js › bqKitFloat. Drapeau éteint : false, le bouton retombe sur les pastilles. */
function mzKitFloat(screen, memKey, onCounted) {
  if (!mzKitReady()) return false;
  const cc = document.createElement('k-cash-count'); cc.setAttribute('mode', 'open');
  return mzKitOpenSheet(screen, cc, onCounted, memKey);
}

export { mzKitReady, mzKitFloat, mzSkinOn, mzClientLabel, mzInvSearch, mzSellSearch, mzKitRail, mzKitRailPaint, mzKitOpenSheet, mzKitTicketFoot, mzKitScanBar, mzKitSellScroll };
