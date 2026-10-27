/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · pages-pro.js — sidebar handler upgrade pass
 *
 * Concatenation of 9 sub-agent outputs covering:
 *   Section 1: nav-accueil / nav-transactions / nav-terminaux / nav-reglements
 *              nav-conformite / nav-equipe / nav-payroll / nav-reservations
 *   Section 2 restaurant: nav-tables / nav-menu / nav-kds / nav-stock
 *   Section 2 boutique:   nav-inventory / nav-categories / nav-promos / nav-returns
 *   Section 2 spa:        nav-appointments / nav-services
 *                         nav-practitioners / nav-clients
 *
 * Loads after pages.js — overrides original handlers + adds 8 new ones.
 * Each agent's section is wrapped in its own IIFE to isolate scopes.
 *
 * Découpé le 22 octobre 2026 en quatre fichiers chargés à la suite (dashboard.html),
 * sections recopiées à l'octet :
 *   pages-pro-office.js      Section 1A et 1B (avant ce fichier)
 *   pages-pro.js             Section 2 rest A et rest B, puis le registre des
 *                            sections chargées au premier usage (les URL
 *                            littérales que tools/stamps.js lit ICI)
 *   pages-pro-boutique.js    Section 2 boutique A
 *   pages-pro-spa-starter.js Section 2 spa clients et les pages de départ
 * ─────────────────────────────────────────────────────────────────────────── */

/* ═══ Section 2 rest A · tables / menu ═══ */
(function() {
  "use strict";
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const Kiwi = window.Kiwi;
  const handlers = Kiwi.handlers;
  const drawer = Kiwi.drawer;
  const fullpage = Kiwi.fullpage;
  const modal = Kiwi.modal;
  const toast = Kiwi.toast;
  const menu = Kiwi.menu;
  const confetti = Kiwi.confetti;
  /* Locale helper — every i18n lookup in this IIFE reads through trLang(). */
  const trLang = () => (window.KiwiI18n?.getLang?.() || 'fr');
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Section 2a — restaurant vertical handlers
 * Replaces (or supplements) the existing `nav-tables` and `nav-menu`
 * handlers in /Users/badrosonair/Documents/kiwi/assets/pages.js.
 *
 * APPLY:
 *   1. Append the contents of /tmp/kiwi-s2-rest-css.css to the CSS template
 *      literal at the top of pages.js (just before `</style>`).
 *   2. Replace the bodies of `handlers['nav-tables']` and `handlers['nav-menu']`
 *      in pages.js with the bodies below. Auxiliary handlers
 *      (`tables-merge`, `tables-split`, `tables-move`, `tables-new`,
 *      `menu-add`, `menu-86`, `menu-edit`, `menu-mass`, `menu-schedule`)
 *      can sit alongside in the same `handlers = { ... }` block.
 *
 * DEPENDENCIES (already on window.Kiwi):
 *   toast, modal, drawer, handlers, confetti
 * ─────────────────────────────────────────────────────────────────────────── */

/* ─── helper: wire `data-dismiss` buttons on a modal/drawer to close ─── */
function wireDismiss(m) {
  if (!m || !m.el) return;
  m.el.addEventListener('click', (e) => {
    if (e.target.closest('[data-dismiss]')) m.close();
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 2 ·  MENU & MODIFICATEURS  ·  width 980
 * ═══════════════════════════════════════════════════════════════════════════ */
handlers['nav-menu'] = () => {
  const CATS = [
    { key: 'entrees', label: 'Entrées',  count: 8 },
    { key: 'tajines', label: 'Tajines',  count: 9 },
    { key: 'couscous', label: 'Couscous', count: 5 },
    { key: 'desserts', label: 'Desserts', count: 8 },
    { key: 'boissons', label: 'Boissons', count: 18 },
  ];
  const MENU = {
    entrees: [
      ['ent-1', 'Salade marocaine',   'Tomate, concombre, oignon, huile d\'olive',     32,  'ok',  'illimité', 'sans coriandre', '', 6,  142, '+ 32 cette semaine'],
      ['ent-2', 'Briouates viande',    'Triangles croustillants, bœuf mijoté',          45,  'ok',  '32 portions', '', '', 8,  84, '+ 8 %'],
      ['ent-3', 'Harira',              'Soupe traditionnelle pois chiches & lentilles', 28,  'ok',  'illimité', 'extra dattes · sans céleri', '', 7,  98,  'pic Ramadan'],
      ['ent-4', 'Zaalouk',             'Aubergine fumée, tomate, ail',                  28,  'low', '6 portions',  'sans coriandre', 'gluten-free', 12, 56, 'top 30 %'],
      ['ent-5', 'Bissara',             'Fèves moulues, cumin, huile d\'olive',           22,  'ok',  'illimité', '', 'gluten-free', 14, 38, 'classique'],
    ],
    tajines: [
      ['taj-1', 'Tajine kefta œuf',     'Viande hachée, œuf, tomate, épices',           85,  'ok',  '+ 3 modificateurs', 'sans coriandre · pain à part · piment fort', '', 1, 312, '+ 12 % marge'],
      ['taj-2', 'Tajine agneau pruneaux','Agneau mijoté, pruneaux, amandes',            110, 'out', '0 portion · ruptu.','sans gluten', 'sans gluten', 4, 184, 'top weekend'],
      ['taj-3', 'Tajine poulet citron',  'Poulet, olives, citron confit',                95,  'ok',  '24 portions',  'sans olives', '', 3, 226, '+ 5 %'],
      ['taj-4', 'Tajine kefta classique','Boulettes, sauce tomate, œufs',                75,  'ok',  '18 portions',  '', '', 5, 168, 'régulier'],
      ['taj-5', 'Tajine boeuf prunes',   'Bœuf mijoté 4h, pruneaux d\'Agen',             125, 'low', '4 portions',   '', '', 6, 142, 'premium'],
    ],
    couscous: [
      ['cou-1', 'Couscous royal',         'Bœuf, poulet, merguez, légumes',             95,  'ok',  '+ 2 modificateurs', 'sans piment · merguez doux', '', 2, 287, 'vendredi · top'],
      ['cou-2', 'Couscous légumes',       '7 légumes, pois chiches, raisins',           68,  'ok',  'illimité',  '', 'végan', 9, 64, 'gluten · semoule'],
      ['cou-3', 'Couscous agneau',        'Agneau braisé, oignons confits',             105, 'low', '5 portions','sans piment', '', 7, 98, '+ 18 %'],
      ['cou-4', 'Pastilla au poulet',     'Feuille fine, amandes, cannelle',            120, 'low', '3 portions','sucré ou salé', '', 3, 156, 'effet wow'],
    ],
    desserts: [
      ['des-1', 'Msemen beurre & miel',   'Crêpe feuilletée, beurre, miel',             12,  'ok',  'illimité',  '', '', 6,  221, 'top breakfast'],
      ['des-2', 'Cornes de gazelle',      'Pâte d\'amande, fleur d\'oranger',           28,  'low', '12 pièces', '', 'sans gluten possible', 11, 72, 'cadeau client'],
      ['des-3', 'Sellou',                 'Graines de sésame, amandes, miel',           30,  'ok',  'artisanal', '', '', 13, 38, 'occasionnel'],
      ['des-4', 'Chebakia',               'Gâteaux de miel frit · Ramadan',             24,  'out', 'saisonnier','', '', 15, 0,  'rupture'],
    ],
    boissons: [
      ['bo-1', 'Thé à la menthe',         'Gunpowder + menthe fraîche + sucre',         12,  'ok',  'illimité',  'sucre à part · double menthe', '', 5, 412, '#1 vente'],
      ['bo-2', 'Orange pressée',          'Pressée minute · 45 oranges en stock',       18,  'ok',  '45 oranges','sans glace · double', '', 7, 198, '+ 8 %'],
      ['bo-3', 'Café noir double',        'Espresso double · grain Algeria',            14,  'ok',  '+ 4 modif. lait',  'lait amande · lait avoine · sans sucre', '', 10, 124, 'régulier'],
      ['bo-4', 'Limonade traditionnelle', 'Citron vert + eau de fleur d\'oranger',      16,  'ok',  'illimité',  'sans sucre · pétillante', '', 8, 87, 'été'],
      ['bo-5', 'Méchoui',                 'Agneau rôti, parts pour 2 · 4',              180, 'low', '2 portions', 'parts pour 4 · épices fortes', '', 16, 24, 'haut de gamme'],
    ],
  };
  let activeCat = 'tajines';
  let menu86 = new Set(['taj-2', 'des-4']);

  const tagsHtml = (allerg, free) => {
    const out = [];
    if (allerg) out.push(`<span class="tg warn">${allerg.split(' · ')[0]}</span>`);
    if (free)   out.push(`<span class="tg">${free}</span>`);
    return out.join('');
  };
  const stockChip = (st) => st === 'ok' ? '<span class="chip ok">en stock</span>' : st === 'low' ? '<span class="chip pend">stock bas</span>' : '<span class="chip ref">RUPTURE</span>';

  const renderRow = (item, idx, total) => {
    const [id, name, desc, price, st, , mod, free, rank, sold, perf] = item;
    const is86 = menu86.has(id);
    return `
      <div class="menu-row ${is86 ? 'is-86' : ''}" data-row="${id}">
        <div class="photo">${name.includes('Tajine') ? '◉' : name.includes('Couscous') ? '◓' : name.includes('Café') || name.includes('Thé') ? '☕' : name.includes('Pastilla') ? '✦' : name.includes('Salade') ? '◴' : '●'}</div>
        <div class="nm">${name}<div class="desc">${desc}</div><div class="tags">${stockChip(is86 ? 'out' : st)} ${mod ? `<span class="tg">${mod.split(' · ').length} modif.</span>` : ''} ${tagsHtml('', free)}</div></div>
        <div class="pr">${(window.KiwiNumber?.format(price, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? price.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))} MAD</div>
        <div class="rk"><b>#${rank}</b><div style="font-size:11px; color:var(--n-500);">${sold} vendus</div></div>
        <div class="menu-cat-actions" style="justify-content:flex-end;">
          <button class="ord-arrow" data-row-act="up" data-id="${id}" ${idx === 0 ? 'disabled style="opacity:0.3;"' : ''} aria-label="Monter">▲</button>
          <button class="ord-arrow" data-row-act="dn" data-id="${id}" ${idx === total - 1 ? 'disabled style="opacity:0.3;"' : ''} aria-label="Descendre">▼</button>
          <span class="toggle-86 ${is86 ? 'on' : ''}" data-row-act="86" data-id="${id}" title="${is86 ? 'Réactiver' : '86 it (rupture)'}"></span>
        </div>
        <div class="more" data-row-act="edit" data-id="${id}">⋯</div>
      </div>
    `;
  };

  const renderItems = (catKey) => {
    const list = MENU[catKey] || [];
    return list.map((it, i) => renderRow(it, i, list.length)).join('');
  };

  const menuDr = drawer({
    title: 'Menu & modificateurs · Café Atlas',
    subtitle: '45 items actifs · 5 catégories · 12 modificateurs · 2 produits 86\'d',
    width: 980,
    body: `
      <div class="p-kpis">
        <div class="p-kpi"><div class="l">CARTE ACTIVE</div><div class="v">45<span class="u">items</span></div><div class="d up">+ 3 ce mois</div></div>
        <div class="p-kpi"><div class="l">PANIER MOYEN</div><div class="v">158<span class="u"> MAD</span></div><div class="d up">+ 4,2 % vs sem. dernière</div></div>
        <div class="p-kpi"><div class="l">MARGE BRUTE</div><div class="v">66<span class="u">%</span></div><div class="d">cible 68 %</div></div>
        <div class="p-kpi" style="background:rgba(201,74,58,0.06); border-color:rgba(201,74,58,0.25);"><div class="l">86'D</div><div class="v" style="color:var(--danger);">2</div><div class="d">tajine agneau · chebakia</div></div>
      </div>

      <div class="menu-ai">
        <div class="ic">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="currentColor"/></svg>
        </div>
        <div class="b">
          <div class="t">INSIGHT KIWI · 4H AGO</div>
          <div class="n">Promouvoir le tajine kefta œuf cette semaine.</div>
          <div class="d">+ 12 % de marge vs moyenne carte · lift +18 % attendu si placé en bannière catalogue.</div>
        </div>
        <button class="kb" style="background:var(--mint); color:var(--riad);" data-action="menu-promote">Mettre en avant</button>
      </div>

      <div class="p-toolbar">
        <div class="p-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
          Rechercher un item, un modificateur, un allergène…
        </div>
        <button class="kb ghost" data-action="menu-schedule">⏱ Plages horaires</button>
        <button class="kb ghost" data-action="menu-mass">Édition groupée</button>
        <button data-activation=write class="kb atlas" data-action="menu-add">+ Ajouter un item</button>
      </div>

      <div class="menu-pill-cats" id="menu-cats">
        ${CATS.map(c => `<button data-activation=write class="menu-pill-cat ${c.key === activeCat ? 'on' : ''}" data-cat="${c.key}">${c.label}<span class="ct">${c.count}</span></button>`).join('')}
      </div>

      <div class="p-pane" id="menu-pane">
        ${renderItems(activeCat)}
      </div>

      <div class="p-card" style="margin-top:18px;">
        <div class="head">
          <h4>Modificateurs partagés</h4>
          <span class="meta">12 ACTIFS · GLOBAUX SUR LA CARTE</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; font-size:12.5px;">
          ${[
            ['Sans coriandre', '21 items', 'gratuit'],
            ['Sans piment',    '18 items', 'gratuit'],
            ['Pain à part',    '15 items', 'gratuit'],
            ['Sucre à part',   '8 items',  'gratuit'],
            ['Double menthe',  'thé · 1 item', '+ 2 MAD'],
            ['Lait amande',    'cafés · 4 items', '+ 4 MAD'],
            ['Lait avoine',    'cafés · 4 items', '+ 4 MAD'],
            ['Parts pour 4',   'méchoui · 1 item', '+ 90 MAD'],
            ['Sans gluten',    '6 items',  'gratuit'],
            ['Bien cuit',      'tajines · 5', 'gratuit'],
            ['Saignant',       'tajines · 5', 'gratuit'],
            ['Pétillante',     'limonade · 1', '+ 1 MAD'],
          ].map(([n, scope, fee]) => `
            <div style="background:var(--surface); border:1px solid var(--n-200); border-radius:9px; padding:9px 11px;">
              <div style="font-weight:500; letter-spacing:-0.005em;">${n}</div>
              <div style="font-size:11px; color:var(--n-500); font-family:var(--mono); margin-top:3px; display:flex; justify-content:space-between;"><span>${scope}</span><span>${fee}</span></div>
            </div>
          `).join('')}
        </div>
      </div>
    `,
    foot: `
      <div style="display:flex; gap:8px; justify-content:space-between; width:100%; align-items:center;">
        <span style="font-family:var(--mono); font-size:11px; color:var(--n-500); letter-spacing:0.06em;">SYNC POS · 100 % · DERNIÈRE MAJ 12:42</span>
        <div style="display:flex; gap:8px;">
          <button class="kb ghost" data-dismiss>Fermer</button>
          <button data-activation=write class="kb primary" data-action="menu-publish">Publier la carte</button>
        </div>
      </div>
    `,
  });

  wireDismiss(menuDr);

  /* — wire up tabs, 86 toggles, reorder arrows, edit row — */
  setTimeout(() => {
    const root = menuDr.el;
    if (!root) return;
    const pane = root.querySelector('#menu-pane');

    root.querySelectorAll('#menu-cats .menu-pill-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-cat');
        if (key === activeCat) return;
        activeCat = key;
        root.querySelectorAll('#menu-cats .menu-pill-cat').forEach(b => b.classList.toggle('on', b === btn));
        pane.innerHTML = renderItems(activeCat);
        wireRows();
      });
    });

    function wireRows() {
      pane.querySelectorAll('[data-row-act]').forEach(b => {
        b.onclick = (e) => {
          e.stopPropagation();
          const a = b.getAttribute('data-row-act');
          const id = b.getAttribute('data-id');
          const list = MENU[activeCat];
          const idx = list.findIndex(x => x[0] === id);
          if (a === '86') {
            if (menu86.has(id)) menu86.delete(id); else menu86.add(id);
            window.Kiwi.toast(menu86.has(id) ? `${list[idx][1]} marqué 86 (rupture)` : `${list[idx][1]} de retour à la carte`, { type: menu86.has(id) ? 'warn' : 'success', desc: menu86.has(id) ? 'Retiré de la caisse et du QR menu.' : 'Item disponible sur tous les canaux.' });
            pane.innerHTML = renderItems(activeCat);
            wireRows();
          }
          if (a === 'up' && idx > 0) {
            [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
            pane.innerHTML = renderItems(activeCat);
            wireRows();
            window.Kiwi.toast(`${list[idx - 1][1]} repositionné`, { type: 'info' });
          }
          if (a === 'dn' && idx < list.length - 1) {
            [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
            pane.innerHTML = renderItems(activeCat);
            wireRows();
            window.Kiwi.toast(`${list[idx + 1][1]} repositionné`, { type: 'info' });
          }
          if (a === 'edit') openItemEdit(list[idx]);
        };
      });
      pane.querySelectorAll('.menu-row').forEach(r => {
        r.addEventListener('click', (e) => {
          if (e.target.closest('[data-row-act]')) return;
          const id = r.getAttribute('data-row');
          const list = MENU[activeCat];
          const item = list.find(x => x[0] === id);
          if (item) openItemEdit(item);
        });
      });
    }
    wireRows();
  }, 0);
};

/* ─── Item edit modal ──────────────────────────────────────────────────── */
function openItemEdit(it) {
  const [, name, desc, price, , avail, mod, free, rank, sold, perf] = it;
  const editM = window.Kiwi.modal({
    tag: 'ITEM',
    title: name,
    desc: desc,
    width: 640,
    body: `
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Nom</label><input class="kf-input" value="${name}" /></div>
        <div class="kf-group"><label class="kf-label">Prix TTC</label><input class="kf-input mono" value="${price}.00" /></div>
      </div>
      <div class="kf-group">
        <label class="kf-label">Description courte</label>
        <input class="kf-input" value="${desc}" />
      </div>
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Catégorie</label>
          <select class="kf-input"><option>Entrées</option><option selected>Tajines</option><option>Couscous</option><option>Desserts</option><option>Boissons</option></select>
        </div>
        <div class="kf-group"><label class="kf-label">Temps de prep.</label>
          <select class="kf-input"><option>5 min</option><option>10 min</option><option selected>15 min</option><option>20 min</option><option>25 min</option><option>30 min</option></select>
        </div>
      </div>
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Allergènes</label>
          <input class="kf-input" value="œuf · gluten" placeholder="ex. arachides · gluten" />
        </div>
        <div class="kf-group"><label class="kf-label">Coût matière</label>
          <input class="kf-input mono" value="${Math.round(price * 0.34)}.00" />
        </div>
      </div>
      <div class="kf-group">
        <label class="kf-label">Modificateurs autorisés</label>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${['Sans coriandre', 'Sans piment', 'Pain à part', 'Bien cuit', 'Saignant', 'Sans gluten'].map((m, i) => `<span class="chip ${i<3?'ok':'neutral'}" style="cursor:pointer;">${i<3?'✓ ':''}${m}</span>`).join('')}
        </div>
      </div>
      <div class="p-card" style="margin:14px 0 0;">
        <div class="head"><h4 style="font-size:13px;">Performance · 30 derniers jours</h4><span class="meta">RANG #${rank}</span></div>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:14px; font-size:12.5px;">
          <div><div style="color:var(--n-500); font-size:11px;">Vendus</div><div class="mono" style="font-size:18px; font-weight:600;">${sold}</div></div>
          <div><div style="color:var(--n-500); font-size:11px;">CA</div><div class="mono" style="font-size:18px; font-weight:600;">${(window.KiwiNumber?.format((price * sold), {}) ?? (price * sold).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}))} MAD</div></div>
          <div><div style="color:var(--n-500); font-size:11px;">Marge brute</div><div class="mono" style="font-size:18px; font-weight:600; color:var(--atlas);">66 %</div></div>
        </div>
      </div>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Annuler</button>
      <button data-activation=write class="kb danger" data-dismiss onclick="window.Kiwi.toast('${name} supprimé de la carte',{type:'warn',desc:'Item retiré · les commandes ouvertes restent valides.'})">Supprimer</button>
      <button data-activation=write class="kb atlas" data-dismiss onclick="window.Kiwi.toast('${name} mis à jour',{type:'success',desc:'Visible sur votre caisse et votre QR menu.'})">Enregistrer</button>
    `
  });
  if (typeof wireDismiss === 'function') wireDismiss(editM);
}

handlers['menu-add'] = () => {
  wireDismiss(modal({
    tag: 'NOUVEAU',
    title: 'Ajouter un nouvel item',
    desc: 'L\'item sera publié sur le POS, le QR menu et les agrégateurs en sync.',
    width: 600,
    body: `
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Nom de l'item</label><input class="kf-input" placeholder="ex. Tajine boulettes" /></div>
        <div class="kf-group"><label class="kf-label">Prix TTC</label><input class="kf-input mono" placeholder="0,00 MAD" /></div>
      </div>
      <div class="kf-group"><label class="kf-label">Catégorie</label>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${['Entrées', 'Tajines', 'Couscous', 'Desserts', 'Boissons'].map((c, i) => `<button class="kb ${i===1?'atlas':'ghost'}" style="flex:1; min-width:90px; justify-content:center;">${c}</button>`).join('')}
        </div>
      </div>
      <div class="kf-group"><label class="kf-label">Description (visible client)</label><input class="kf-input" placeholder="Ingrédients clés et style" /></div>
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Allergènes</label><input class="kf-input" placeholder="optionnel" /></div>
        <div class="kf-group"><label class="kf-label">Temps de prep.</label>
          <select class="kf-input"><option>5</option><option>10</option><option selected>15</option><option>20</option><option>25</option><option>30</option></select>
        </div>
      </div>
      <label style="display:flex; gap:10px; align-items:center; padding:10px 12px; background:var(--paper-soft); border-radius:10px; font-size:13px; cursor:pointer; margin-bottom:6px;">
        <input type="checkbox" checked /> Publier immédiatement sur la caisse et le QR menu
      </label>
      <label style="display:flex; gap:10px; align-items:center; padding:10px 12px; background:var(--paper-soft); border-radius:10px; font-size:13px; cursor:pointer;">
        <input type="checkbox" /> Marquer "nouveau" pendant 14 jours
      </label>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Annuler</button>
      <button data-activation=write class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Item publié sur la carte',{type:'success',desc:'Visible sur votre caisse et votre QR menu.'}); window.Kiwi.confetti();">Créer & publier</button>
    `
  }));
};

handlers['menu-mass'] = () => {
  wireDismiss(modal({
    tag: 'ÉDITION GROUPÉE',
    title: 'Modifier toute une catégorie',
    desc: 'Affecte tous les items sélectionnés en une opération.',
    width: 540,
    body: `
      <div class="kf-group"><label class="kf-label">Catégorie</label>
        <select class="kf-input"><option>Entrées (8)</option><option selected>Tajines (9)</option><option>Couscous (5)</option><option>Desserts (8)</option><option>Boissons (18)</option></select>
      </div>
      <div class="kf-group"><label class="kf-label">Action</label>
        <select class="kf-input">
          <option>Augmenter les prix de…</option>
          <option>Diminuer les prix de…</option>
          <option>Marquer la catégorie 86 (rupture)</option>
          <option>Activer disponibilité midi uniquement</option>
          <option>Cacher de la carte client</option>
        </select>
      </div>
      <div class="kf-group"><label class="kf-label">Pourcentage</label>
        <div style="display:flex; gap:6px;">
          ${['+ 2 %', '+ 5 %', '+ 8 %', '+ 10 %', 'autre'].map((p, i) => `<button class="kb ${i===1?'atlas':'ghost'}" style="flex:1; justify-content:center;">${p}</button>`).join('')}
        </div>
      </div>
      <div class="kf-help">9 items recevront +5 % · panier moyen estimé : 165 MAD (vs 158 MAD aujourd'hui).</div>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Annuler</button>
      <button class="kb atlas" data-dismiss onclick="window.Kiwi.toast('9 tajines ré-tarifés (+5 %)',{type:'success',desc:'Sync en cours · prochaine commande à 16:42.'})">Appliquer</button>
    `
  }));
};

handlers['menu-schedule'] = () => {
  wireDismiss(modal({
    tag: 'PLAGES HORAIRES',
    title: 'Carte programmée',
    desc: 'Affiche / cache automatiquement des items selon le service ou la saison.',
    width: 600,
    body: `
      <div class="p-card" style="margin:0 0 10px;">
        <div class="head"><h4 style="font-size:14px;">Couscous royal</h4><span class="chip ok">vendredi 11h–15h</span></div>
        <div style="font-size:12.5px; color:var(--n-500);">Affiché automatiquement le vendredi · masqué les autres jours.</div>
      </div>
      <div class="p-card" style="margin:0 0 10px;">
        <div class="head"><h4 style="font-size:14px;">Méchoui</h4><span class="chip pend">soir 19h–23h</span></div>
        <div style="font-size:12.5px; color:var(--n-500);">Service du soir uniquement · 24h de préavis automatique.</div>
      </div>
      <div class="p-card" style="margin:0 0 10px;">
        <div class="head"><h4 style="font-size:14px;">Carte Ramadan complète</h4><span class="chip pend">programmée</span></div>
        <div style="font-size:12.5px; color:var(--n-500);">Bascule automatique au coucher du soleil · 15 mars → 13 avril 2027. Harira, chebakia, briouates en avant-plan.</div>
      </div>
      <div class="p-card" style="margin:0;">
        <div class="head"><h4 style="font-size:14px;">Petit-déj.</h4><span class="chip neutral">8h–11h tous les jours</span></div>
        <div style="font-size:12.5px; color:var(--n-500);">Msemen, harira, café, thé. Switch automatique sur la carte midi à 11h00.</div>
      </div>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Fermer</button>
      <button data-activation=write class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Programmation enregistrée',{type:'success',desc:'4 plages actives · sync POS et agrégateurs.'})">+ Ajouter une plage</button>
    `
  }));
};

handlers['menu-promote'] = () => {
  wireDismiss(modal({
    tag: 'PROMOUVOIR',
    title: 'Mettre en avant le tajine kefta œuf',
    desc: 'L\'item apparaîtra en bannière sur le QR menu et la caisse pendant 7 jours.',
    width: 540,
    body: `
      <div class="p-card" style="margin:0 0 10px;">
        <div class="head"><h4 style="font-size:14px;">Estimation</h4><span class="meta">7 JOURS</span></div>
        <dl style="display:grid; grid-template-columns:1fr auto; gap:5px 14px; font-size:13px; margin:0;">
          <dt style="color:var(--n-500);">Lift de ventes attendu</dt><dd class="mono" style="color:var(--success); font-weight:600;">+18 %</dd>
          <dt style="color:var(--n-500);">Marge incrémentale</dt><dd class="mono">+ 2 184 MAD</dd>
          <dt style="color:var(--n-500);">Coût</dt><dd class="mono">0 MAD</dd>
        </dl>
      </div>
      <label style="display:flex; gap:10px; align-items:center; padding:10px 12px; background:var(--paper-soft); border-radius:10px; font-size:13px; cursor:pointer;">
        <input type="checkbox" checked /> Inclure une photo générée par IA (gratuit)
      </label>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Plus tard</button>
      <button class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Tajine kefta œuf en avant',{type:'success',desc:'Bannière live sur le QR menu et la caisse.'}); window.Kiwi.confetti();">Lancer la promo</button>
    `
  }));
};

handlers['menu-publish'] = () => {
  wireDismiss(modal({
    tag: 'PUBLIER',
    title: 'Publier la carte ?',
    desc: 'La nouvelle version sera synchronisée sur tous les canaux en moins de 10 secondes.',
    width: 520,
    body: `
      <div class="p-card" style="margin:0;">
        <div class="head"><h4 style="font-size:14px;">12 modifications en attente</h4><span class="meta">DEPUIS 12:42</span></div>
        <ul style="list-style:none; margin:0; padding:0; font-size:13px;">
          <li style="padding:8px 0; border-top:1px solid var(--n-200);">+ Ajout : <b>Pastilla aux fruits de mer</b></li>
          <li style="padding:8px 0; border-top:1px solid var(--n-200);">~ Prix : Tajine kefta œuf 80 → <b>85 MAD</b></li>
          <li style="padding:8px 0; border-top:1px solid var(--n-200);">86 : Tajine agneau pruneaux <span class="chip ref">RUPTURE</span></li>
          <li style="padding:8px 0; border-top:1px solid var(--n-200);">~ Modificateurs : 3 nouveaux sur tajines</li>
          <li style="padding:8px 0; border-top:1px solid var(--n-200);">~ 8 réorderings de catégorie</li>
        </ul>
      </div>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Garder en brouillon</button>
      <button data-activation=write class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Carte publiée',{type:'success',desc:'Caisse et QR menu à jour.'}); window.Kiwi.confetti();">Publier maintenant</button>
    `
  }));
};
})();

/* ═══ Section 2 rest B · kds / stock ═══ */
(function() {
  "use strict";
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const Kiwi = window.Kiwi;
  const handlers = Kiwi.handlers;
  const drawer = Kiwi.drawer;
  const fullpage = Kiwi.fullpage;
  const modal = Kiwi.modal;
  const toast = Kiwi.toast;
  const menu = Kiwi.menu;
  const confetti = Kiwi.confetti;
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Section 2-B (restaurant vertical) — sidebar handlers
 *
 * Two replacement handlers for /Users/badrosonair/Documents/kiwi/assets/pages.js:
 *   1. handlers['nav-kds']    · Écran cuisine · live ticket queue (1040-wide)
 *   2. handlers['nav-stock']  · Stock ingrédients · 20-item grid (1000-wide)
 *
 * Plus auxiliary action handlers (kds-bump, kds-recall, stock-reorder…).
 * Drop the contents of this file in place of the existing nav-kds and nav-stock
 * blocks (and append the auxiliary handlers next to the other action stubs).
 *
 * Companion CSS: /tmp/kiwi-s2-rest-css.css (append additions there).
 * ─────────────────────────────────────────────────────────────────────────── */

  /* ═══════════════════ ÉCRAN CUISINE (KDS) ═══════════════════ */
  handlers['nav-kds'] = () => {
    const tickets = [
      { id: 'T-7821', table: 'T4', src: 'salle',  cook: 'MM', elapsed: 412, items: [{ q: 2, n: 'Salade marocaine', st: 'salade' }, { q: 1, n: 'Tajine kefta œuf', st: 'cuisson' }, { q: 3, n: 'Thé menthe', st: 'boissons' }] },
      { id: 'T-7822', table: 'T7', src: 'salle',  cook: 'MM', elapsed: 198, items: [{ q: 1, n: 'Couscous royal', st: 'cuisson' }, { q: 1, n: 'Pastilla poulet', st: 'cuisson' }] },
      { id: 'T-7823', table: 'T2', src: 'salle',  cook: 'AY', elapsed: 632, items: [{ q: 4, n: 'Briouates viande', st: 'cuisson' }, { q: 2, n: 'Caviar d\'aubergine', st: 'salade' }] },
      { id: 'T-7824', table: 'TR2',src: 'terrasse', cook: 'AY', elapsed: 88,  items: [{ q: 2, n: 'Tajine kefta', st: 'cuisson' }, { q: 1, n: 'Salade marocaine', st: 'salade' }, { q: 2, n: 'Orange pressée', st: 'boissons' }] },
      { id: 'G-3412', table: 'GLOVO', src: 'livraison', cook: 'MM', elapsed: 548, items: [{ q: 2, n: 'Tajine kefta œuf', st: 'cuisson' }, { q: 1, n: 'Salade marocaine', st: 'salade' }] },
      { id: 'T-7825', table: 'T9', src: 'salle',  cook: 'AY', elapsed: 944, items: [{ q: 1, n: 'Pastilla poulet', st: 'cuisson' }, { q: 1, n: 'Salade marocaine', st: 'salade' }, { q: 1, n: 'Pâtisseries assorties', st: 'desserts' }] },
      { id: 'Y-8821', table: 'YASSIR', src: 'livraison', cook: 'MM', elapsed: 318, items: [{ q: 3, n: 'Tajine kefta', st: 'cuisson' }] },
      { id: 'T-7826', table: 'TR1', src: 'terrasse', cook: 'AY', elapsed: 42,  items: [{ q: 2, n: 'Briouates viande', st: 'cuisson' }, { q: 1, n: 'Caviar d\'aubergine', st: 'salade' }, { q: 4, n: 'Café double', st: 'boissons' }] },
    ];
    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const cls = (s) => s < 480 ? 'ok' : s < 900 ? 'warn' : 'over';
    const stationLabel = { salade: 'Salade', cuisson: 'Cuisson', boissons: 'Boissons', desserts: 'Desserts' };

    const ticketHtml = (t) => `
      <div class="kds-tk ${cls(t.elapsed)}" data-tk="${t.id}" data-stations="${[...new Set(t.items.map(i => i.st))].join(' ')}">
        <div class="kds-tk-head">
          <div class="kds-tk-id">
            <b>${t.table}</b><span class="kds-tk-src">· ${t.src}</span>
          </div>
          <div class="kds-tk-time mono ${cls(t.elapsed)}">${fmt(t.elapsed)}</div>
        </div>
        <ul class="kds-tk-items">
          ${t.items.map(i => `<li><span class="kds-q mono">×${i.q}</span><span class="kds-it">${i.n}</span><span class="kds-st kds-st-${i.st}">${stationLabel[i.st]}</span></li>`).join('')}
        </ul>
        <div class="kds-tk-foot">
          <span class="kds-tk-cook">Affecté : <b>${t.cook === 'MM' ? 'Mehdi M.' : 'Ayoub Y.'}</b></span>
          <span class="kds-tk-acts">
            <button class="kb ghost xs" data-action="kds-recall" data-id="${t.id}">Rappeler</button>
            <button class="kb atlas xs" data-action="kds-bump" data-id="${t.id}">Bump</button>
          </span>
        </div>
      </div>`;

    const r = drawer({
      title: 'Écran cuisine · KDS',
      subtitle: '8 tickets en préparation · service midi · Mehdi Mansouri (chef)',
      width: 1040,
      body: `
        <div class="p-kpis kds-stat-strip">
          <div class="p-kpi"><div class="l">TICKETS ACTIFS</div><div class="v">8</div><div class="d">3 cuisson · 2 salade · 2 livraison · 1 terrasse</div></div>
          <div class="p-kpi"><div class="l">PRÉP. MOYENNE</div><div class="v">8 min <span class="u">14 s</span></div><div class="d up">SLA 12 min · respecté à 87 %</div></div>
          <div class="p-kpi"><div class="l">STATION CHARGÉE</div><div class="v">Cuisson</div><div class="d">5 tickets en file · 14 plats</div></div>
          <div class="p-kpi"><div class="l">PLAT DU MOMENT</div><div class="v">Tajine kefta</div><div class="d">7 commandes en 30 min</div></div>
        </div>

        <div class="kds-board">
          <div class="kds-main">
            <div class="kds-toolbar">
              <div class="kds-pills" role="tablist">
                <button class="kds-pill on" data-kds-st="all">Tout <span class="mono">8</span></button>
                <button class="kds-pill" data-kds-st="salade">Salade <span class="mono">4</span></button>
                <button class="kds-pill" data-kds-st="cuisson">Cuisson <span class="mono">7</span></button>
                <button class="kds-pill" data-kds-st="boissons">Boissons <span class="mono">3</span></button>
                <button class="kds-pill" data-kds-st="desserts">Desserts <span class="mono">1</span></button>
              </div>
              <div class="kds-tools">
                <button class="kb ghost xs" data-action="kds-fullscreen">Plein écran</button>
                <button class="kb ghost xs" data-action="kds-reassign">Réaffecter cuisinier</button>
              </div>
            </div>

            <div class="kds-grid-tk">
              ${tickets.map(ticketHtml).join('')}
            </div>
          </div>

          <aside class="kds-side">
            <div class="kds-side-head">
              <h5>Notifications cuisine</h5>
              <span class="chip neutral mono">5 nouvelles</span>
            </div>
            <div class="kds-notif warn">
              <div class="kds-notif-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg></div>
              <div><b>Ticket T9 dépasse 15 min</b><div class="m">Pastilla en attente cuisson · prévenir Mehdi M.</div></div>
            </div>
            <div class="kds-notif info">
              <div class="kds-notif-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></div>
              <div><b>2 tajines kefta encore prévus</b><div class="m">Pré-cuire les œufs · gain estimé 90 s/ticket</div></div>
            </div>
            <div class="kds-notif info">
              <div class="kds-notif-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></div>
              <div><b>Coursier Glovo arrivé</b><div class="m">Ticket G-3412 · prêt à récupérer comptoir</div></div>
            </div>
            <div class="kds-notif warn">
              <div class="kds-notif-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg></div>
              <div><b>Stock bas · feuilles de brick</b><div class="m">3 portions restantes · 86 le plat ?</div><button class="kds-notif-cta" data-action="kds-86" data-item="Pastilla poulet">86 cet item</button></div>
            </div>
            <div class="kds-notif">
              <div class="kds-notif-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg></div>
              <div><b>Sofia (salle) demande</b><div class="m">T4, sans coriandre sur le tajine</div></div>
            </div>

            <div class="kds-side-head" style="margin-top:18px;">
              <h5>Performance cuisinier</h5>
            </div>
            <div class="kds-cook">
              <div class="kds-cook-av">MM</div>
              <div class="kds-cook-info">
                <b>Mehdi Mansouri · chef</b>
                <div class="m">4 tickets actifs · prép. moy. <b>7 min 50 s</b></div>
              </div>
              <span class="chip ok">SLA 92 %</span>
            </div>
            <div class="kds-cook">
              <div class="kds-cook-av b">AY</div>
              <div class="kds-cook-info">
                <b>Ayoub Yacoubi · auxiliaire</b>
                <div class="m">4 tickets actifs · prép. moy. <b>9 min 12 s</b></div>
              </div>
              <span class="chip pend">SLA 79 %</span>
            </div>
          </aside>
        </div>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>Fermer</button>
        <button data-activation=write class="kb ghost" data-action="kds-print-summary">Imprimer récap service</button>
        <button class="kb atlas" data-action="kds-fullscreen">Basculer iPad mural</button>
      `,
    });
    r.el.querySelector('.kiwi-drawer').classList.add('page-xl');
    r.el.querySelector('.kiwi-drawer').style.width = '1040px';

    // Click delegation: filter pills + ticket interactions
    r.el.addEventListener('click', (e) => {
      const pill = e.target.closest('[data-kds-st]');
      if (pill) {
        r.el.querySelectorAll('[data-kds-st]').forEach(p => p.classList.toggle('on', p === pill));
        const k = pill.dataset.kdsSt;
        r.el.querySelectorAll('.kds-tk').forEach(tk => {
          const stations = (tk.dataset.stations || '').split(' ');
          tk.style.display = (k === 'all' || stations.includes(k)) ? '' : 'none';
        });
        return;
      }
      const tk = e.target.closest('.kds-tk');
      if (tk && !e.target.closest('button')) {
        const id = tk.dataset.tk;
        toast(`Ticket ${id} agrandi`, { type: 'info', desc: 'Mode focus · police × 1,4 pour brigade éloignée.' });
      }
    });
  };

  /* Stub handlers used inside the KDS drawer */
  handlers['kds-bump'] = (el) => {
    const id = el?.dataset.id || 'ticket';
    const tk = el?.closest('.kds-tk');
    modal({
      tag: 'CUISINE',
      title: `Bump ticket ${id} ?`,
      desc: 'Le ticket disparaît de l\'écran cuisine. La salle reçoit la notification « plat prêt ».',
      width: 460,
      body: `<div style="display:flex; gap:12px; padding:12px 14px; background:var(--paper-soft); border-radius:10px; font-size:13px; color:var(--n-600); line-height:1.5;">
        <span style="color:var(--atlas);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L20 7"/></svg></span>
        <div>Sofia (salle) sera notifiée pour récupérer les plats au pass. Action irréversible, utilisez « Rappeler » si besoin.</div>
      </div>`,
      foot: `<button class="kb ghost" data-dismiss-modal>Annuler</button><button class="kb atlas" data-confirm-bump="${id}">Bump ${id}</button>`,
    });
    document.querySelector('[data-confirm-bump]')?.addEventListener('click', () => {
      document.querySelector('.kiwi-backdrop')?.remove();
      if (tk) { tk.style.transition = 'all 280ms'; tk.style.opacity = '0'; tk.style.transform = 'translateX(20px)'; setTimeout(() => tk.remove(), 280); }
      toast(`Ticket ${id} bumpé`, { type: 'success', desc: 'Notification salle envoyée à Sofia · pass · ouvert depuis 4 s.' });
    });
    document.querySelector('[data-dismiss-modal]')?.addEventListener('click', () => document.querySelector('.kiwi-backdrop')?.remove());
  };
  handlers['kds-recall'] = (el) => {
    const id = el?.dataset.id || 'ticket';
    toast(`Ticket ${id} rappelé en cuisine`, { type: 'warn', desc: 'Le ticket revient en haut de la file · cuisinier averti.' });
  };
  handlers['kds-86'] = (el) => {
    const item = el?.dataset.item || 'plat';
    modal({
      tag: 'STOCK',
      title: `Mettre « ${item} » en 86 ?`,
      desc: 'Le plat devient indisponible sur la caisse et le QR table.',
      width: 480,
      body: `<div style="font-size:13px; color:var(--n-600); line-height:1.5;">Le client en train de commander voit le plat barré. Vous pouvez le réactiver dès que le stock revient.</div>`,
      foot: `<button class="kb ghost" data-dismiss-modal>Annuler</button><button class="kb danger" data-confirm-86>Confirmer le 86</button>`,
    });
    document.querySelector('[data-confirm-86]')?.addEventListener('click', () => {
      document.querySelector('.kiwi-backdrop')?.remove();
      toast(`${item} en 86`, { type: 'success', desc: 'Désactivé sur la caisse et le QR table.' });
    });
    document.querySelector('[data-dismiss-modal]')?.addEventListener('click', () => document.querySelector('.kiwi-backdrop')?.remove());
  };
  handlers['kds-fullscreen'] = () => toast('Mode iPad mural activé', { type: 'info', desc: 'Police × 1,4 · auto-refresh 3 s · interface tactile gants compatible.' });
  handlers['kds-reassign'] = () => toast('Réaffecter ticket', { type: 'info', desc: 'Glissez le ticket vers Mehdi M. ou Ayoub Y. pour transférer.' });
  handlers['kds-print-summary'] = () => toast('Récap service midi imprimé', { type: 'success', desc: '47 plats servis · prép. moy. 8 min 14 s · 3 retours cuisine.' });
})();

/* First-use sections. Keep URLs literal so tools/stamps.js can version them. */
(() => {
  if (!window.Kiwi?.handlers) return;
  const H = window.Kiwi.handlers;
  const LAZY_SECTIONS = [
    { url: 'assets/pages/tables.js?v=4', dependencies: ['assets/pages/tables-data.js?v=1', 'assets/pages/tables-drawing.js?v=3', 'assets/pages/tables-operations.js?v=2'], handlers: ["nav-tables"] },
    { url: 'assets/pages-pro/spa-appointments.js?v=2', handlers: ["nav-appointments", "appt-filter", "appt-export", "appt-wait-add", "appt-auto-toggle", "appt-wait-detail", "appt-cancel-confirm", "appt-new", "nav-services", "svc-export", "svc-season", "svc-season-edit", "svc-ai-action", "pkg-edit-go"] },
    { url: 'assets/pages-pro/spa-practitioners.js?v=2', handlers: ["nav-practitioners", "practitioner-add", "practitioner-commission", "practitioner-edit", "practitioner-tracker"] },
    { url: 'assets/pages-pro/boutique-promos-returns.js?v=9', handlers: ["nav-returns", "credit-adjust", "credit-adjust-confirm", "credit-cancel", "ret-approve", "ret-block", "ret-detail", "ret-exchange", "ret-export", "ret-policy-jump", "ret-policy-save", "ret-refund-credit", "ret-refund-original", "ret-refund-whatsapp", "ret-refuse"] },
    { url: 'assets/pages-pro/restaurant-stations.js?v=2', handlers: ["nav-menu", "nav-kds", "menu-stations-manage", "menu-station-create", "menu-cat-add", "menu-cat-edit", "menu-opt-add", "menu-promote", "menu-add", "menu-schedule", "menu-publish", "kds-bump", "kds-recall", "kds-86", "kds-fullscreen", "kds-reassign", "kds-print-summary"] },
  ];
  LAZY_SECTIONS.forEach(entry => {
    let loading;
    const registered = new Set();
    function load() {
      if (loading) return loading;
      let script;
      function append(url, verify) {
        script = document.createElement('script');
        script.src = url;
        return new Promise((resolve, reject) => {
        script.onload = () => !verify || registered.size === entry.handlers.length
          ? resolve() : reject(new Error('Module incomplet'));
        script.onerror = () => reject(new Error('Module indisponible'));
        document.head.appendChild(script);
        });
      }
      loading = (entry.dependencies?.length
        ? entry.dependencies.reduce((ready, url) => ready.then(() => append(url, false)), Promise.resolve()).then(() => append(entry.url, true))
        : append(entry.url, true)).catch(error => {
        loading = null;
        script.remove();
        throw error;
      });
      return loading;
    }
    entry.handlers.forEach(name => {
      let live, real, forwarding = false;
      function stub() {
        const self = this, args = arguments;
        function forward() {
          // Captured wrappers call this stub again: terminate at the real handler.
          if (forwarding) return real.apply(self, args);
          forwarding = true;
          try { return H[name].apply(self, args); }
          finally { forwarding = false; }
        }
        if (real) return forward();
        return load().then(forward, () => {
          const dt = (key, fr) => window.KiwiI18n?.T?.[window.KiwiI18n.getLang()]?.[key] ?? fr;
          window.Kiwi.toast(dt("page.unavailable", "Module indisponible"), { type: 'error', desc: dt("page.retry", "Impossible de charger cette page. Réessayez.") });
        });
      }
      live = stub;
      Object.defineProperty(H, name, {
        configurable: true, enumerable: true,
        get: () => live,
        set(fn) {
          // Only assignments made by this chunk are registration. Later guards
          // retain their captured stub and must remain installed above the real fn.
          if (document.currentScript?.src === new URL(entry.url, document.baseURI).href) {
            real = fn;
            registered.add(name);
            if (live === stub) live = fn;
          } else live = fn;
        },
      });
    });
  });
})();
