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
  ['livraisons', 'local_shipping'],
];
/* Les commandes du tiroir, reconnues sur le bouton LIVRÉ : son identifiant,
   sa classe ou son action. Inconnue, elle garde « more_horiz » et sa place —
   on n'écarte jamais un bouton qu'on n'a pas su nommer. */
const BQ_MORE_ICONS = [
  ['#bq-fs', 'fullscreen'],
  ['#bq-lock', 'lock'],
  ['.kx-refresh', 'refresh'],
  ['[data-action="printer-connect"]', 'print'],
  /* Les trois que posent la boutique et les modules partagés : Fin de
     service (pos-boutique.js), Code de pointage (caisse-refresh.js) et
     Réimprimer (pos-reprint.js). */
  ['#bq-open-drawer', 'point_of_sale'],
  ['#bq-close-day', 'power_settings_new'],
  ['.kx-attendance-code', 'key'],
  ['.kx-reprint', 'receipt'],
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
  /* La feuille en a besoin pour passer Plus au-dessus du carnet clients. */
  try { document.documentElement.toggleAttribute('data-bq-more', open); } catch (_) {}
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

/* L'ordre du tiroir (propriétaire, 2026-10-28 : « ça semble mélangé »).
   Service : ce que l'on fait au comptoir, la fin de service en dernier.
   Cet appareil : la tablette elle-même, Verrouiller en dernier. Une commande
   inconnue se range dans Service, avant la fin de service. */
const BQ_MORE_ORDER = [
  ['#bq-open-drawer', 1],
  ['.kx-reprint, [data-bq-act="reprint"]', 2],
  ['.kx-attendance-code, [data-bq-act="clock"]', 3],
  ['#bq-close-day, [data-bq-act="endshift"]', 9],
  ['[data-action="printer-connect"]', 11],
  ['#bq-fs', 12],
  ['.kx-refresh', 13],
  ['#bq-lock, [data-bq-act="logout"]', 19],
];
const bqMoreRank = (el) => {
  for (const [sel, n] of BQ_MORE_ORDER) { try { if (el.matches(sel)) return n; } catch (_) {} }
  return 5;
};
/* Titres de section : les clés du kit, déjà traduites FR · EN · AR. */
const bqKitT = (key, fb) => {
  try { const K = window.KiwiKit; const v = K && typeof K.t === 'function' ? K.t(key) : ''; if (v && v !== key) return v; } catch (_) {}
  return fb;
};

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
  /* Rangées triées en deux groupes, comme le Plus du restaurant
     : Service, puis Cet appareil. L'id reste
     l'index LIVRÉ, donc chaque rangée clique toujours son propre bouton. */
  const acts = bqMoreActs().map((el, i) => ({ id: 'act:' + i, icon: bqIconFor(el), label: label(el), at: bqMoreRank(el), i }))
    .sort((a, b) => (a.at - b.at) || (a.i - b.i));
  const strip = (r) => ({ id: r.id, icon: r.icon, label: r.label });
  const shift = acts.filter((r) => r.at < 10).map(strip);
  const device = acts.filter((r) => r.at >= 10).map(strip);
  bqSide.sections = [{ items: views }]
    .concat(shift.length ? [{ label: bqKitT('till.more.shift', tr('Service')), items: shift }] : [])
    .concat(device.length ? [{ label: bqKitT('till.more.device', tr('Cet appareil')), items: device }] : []);
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
  /* Tout le tiroir est sombre : la marque et la langue lisent le jeu sombre
     du kit, comme le nav (§20.7, règle 5), sinon leur encre sort foncée. */
  more.setAttribute('data-k-ground', 'inverse');
  /* Ordre d'origine conservé : les destinations d'abord, le pied ensuite. */
  const main = BQ_RAIL_MAIN.map((r) => r[0]);
  [...nav.children].forEach((el) => {
    if (el.dataset && main.indexOf(el.dataset.bqView) >= 0) return;
    more.appendChild(el);
  });
  if (foot) [...foot.children].forEach((el) => more.appendChild(el));
  nav.appendChild(more);
  bqMore = more;
  /* Le voile du restaurant (#kit-more-scrim) : le panneau s'ouvre À LA PLACE
     du rail, la page derrière s'assombrit, et toucher le voile referme
     seulement — un article ne s'ajoute pas au ticket par un geste de
     fermeture (propriétaire, 2026-10-28). Il suit `more.hidden` par la
     feuille (.bq-more:not([hidden]) + .bq-more-scrim), sans état en double. */
  const scrim = document.createElement('div');
  scrim.className = 'bq-more-scrim';
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
    brand.className = 'bq-more-brand';
    const logo = root.querySelector('.bq-brand img');
    const vname = root.querySelector('.bq-venue-name');
    /* Construit par nœuds : le nom de l'enseigne est un texte, jamais du HTML. */
    if (logo) {
      const img = document.createElement('img');
      img.className = 'bq-more-logo'; img.alt = ''; img.src = logo.getAttribute('src');
      brand.appendChild(img);
    }
    const vn = document.createElement('span');
    vn.className = 'bq-more-venue';
    vn.textContent = ((vname && vname.textContent) || '').trim();
    const live = document.createElement('span');
    live.className = 'bq-more-live';
    live.appendChild(document.createElement('i'));
    live.appendChild(document.createTextNode(tr('En service')));
    brand.append(vn, live);
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
  if (!ticketEl || !on) return false;
  bqKitTicketEmpty(ticketEl);
  if (!customElements.get('k-button')) return false;
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

/* Le ticket vide, avec les mots et le corps du restaurant (<k-bill>, .em :
   un titre k-heading, une ligne k-foot, rien d'autre). L'icône livrée porte
   son display EN LIGNE : une règle de feuille ne l'éteint pas, il faut
   réécrire le bloc. Le bloc garde sa classe, donc tout ce qui le cherche le
   trouve encore. */
function bqKitTicketEmpty(ticketEl) {
  const em = ticketEl.querySelector('.bq-tk-empty');
  if (!em || em.dataset.bqKit) return;
  em.dataset.bqKit = '1';
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
function bqKitScanBar(bar, o) {
  /* o.id : deux barres (Vente, Inventaire) vivent dans le même écran, chacune
     sa liste. o.plain : la livrée d'avant garde son icône et ses mots. */
  const lid = o.id || 'bq-sgst';
  if (!bar || !o || !o.input || bar.querySelector('.bq-sgst')) return false;
  const input = o.input;
  const old = o.plain ? null : bar.querySelector(':scope > svg, :scope > i');
  if (old) {
    const ic = document.createElement('i');
    ic.setAttribute('data-icon', 'barcode_scanner');
    ic.className = 'bq-sell-scan-ic';
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
  list.className = 'bq-sgst';
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
    list.querySelectorAll('.bq-sgst-it').forEach((b, k) => b.classList.toggle('on', k === i));
    const b = list.querySelector('[data-sgst="' + i + '"]');
    if (b) { input.setAttribute('aria-activedescendant', b.id); b.scrollIntoView({ block: 'nearest' }); }
  };
  /* La partie tapée, en gras dans le code : on voit d'un coup d'œil ce qui reste. */
  const hl = (text, q) => {
    const k = text.toLowerCase().indexOf(q.toLowerCase());
    if (k < 0 || !q) return esc(text);
    return esc(text.slice(0, k)) + '<b>' + esc(text.slice(k, k + q.length)) + '</b>' + esc(text.slice(k + q.length));
  };
  const row = (r, i, q) => '<button type="button" class="bq-sgst-it" role="option" tabindex="-1" id="' + lid + '-' + i + '" data-sgst="' + i + '">'
    + '<span class="bq-sgst-art">' + o.visual(r) + '</span>'
    + '<span class="bq-sgst-txt"><span class="bq-sgst-nm">' + (r.why === 'nom' ? hl(r.name, q) : esc(r.name)) + '</span>'
    + '<span class="bq-sgst-sub">' + (r.detail ? esc(r.detail) : '')
    + (r.ean ? '<span class="bq-sgst-cd">' + (r.why === 'ean' ? hl(r.ean, q) : esc(r.ean)) + '</span>' : '') + '</span></span>'
    + '<span class="bq-sgst-end"><span class="bq-sgst-pz">' + (r.was ? '<s>' + o.money(r.was) + '</s> ' : '') + o.money(r.price) + '</span>'
    + (r.stock > 0 ? '<span class="bq-sgst-st">' + r.stock + ' ' + tr('en stock') + '</span>' : '<span class="bq-sgst-st out">' + tr('épuisé') + '</span>')
    + '</span></button>';
  const paint = () => {
    const q = input.value.trim();
    if (!q) { close(); return; }
    rows = o.search(q) || [];
    if (!rows.length) {
      list.innerHTML = '<div class="bq-sgst-none">' + tr('Aucun article trouvé') + '</div>';
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
function bqKitSellScroll(sell) {
  if (!sell || sell.querySelector(':scope > .bq-sell-scroll')) return false;
  const scan = sell.querySelector(':scope > .bq-sell-scan');
  const cats = sell.querySelector(':scope > #bq-cats');
  const grid = sell.querySelector(':scope > #bq-gridwrap');
  if (!scan || !cats || !grid) return false;
  const box = document.createElement('div');
  box.className = 'bq-sell-scroll';
  sell.insertBefore(box, scan);
  box.appendChild(scan);
  box.appendChild(cats);
  box.appendChild(grid);
  return true;
}

export { bqKitRail, bqKitRailPaint, bqKitOpenSheet, bqKitTicketFoot, bqKitScanBar, bqKitSellScroll };
