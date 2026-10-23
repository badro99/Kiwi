/* ═══ STATION ROUTING OVERRIDE · rebuilds nav-menu + nav-kds with multi-station model ═══ */
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Section 2-S · STATION ROUTING
 * Adds the missing "stations de préparation" feature to the restaurant
 * vertical: every menu item routes to 1+ prep stations and the KDS lets
 * the brigade switch between station views.
 *
 *   · handlers['nav-menu']  · rebuilt with station-chip rows + edit modal
 *                             station picker + "Gérer les stations" CTA
 *   · handlers['nav-kds']   · rebuilt with top station-pill switcher and
 *                             per-station ticket filtering
 *
 * Appended to pages-pro.js at load time so it overrides the previous
 * implementations.  Vanilla JS · no build · no framework.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const Kiwi = window.Kiwi;
  const { handlers, drawer, fullpage, modal, toast, confetti } = Kiwi;

  /* ───────────── data · STATIONS registry (mutable, in-memory) ───────────── */
  const STATIONS = [
    { id: 'cuisson',  name: 'Cuisson chaude',  color: 'var(--atlas)',   raw: '#0B6E4F', kind: 'kitchen' },
    { id: 'salade',   name: 'Salade froide',   color: 'var(--success)', raw: '#1FB574', kind: 'kitchen' },
    { id: 'pastry',   name: 'Pâtisserie',      color: 'var(--warning)', raw: '#D99A2B', kind: 'kitchen' },
    { id: 'boissons', name: 'Boissons',        color: 'var(--info)',    raw: '#3677A6', kind: 'bar'     },
    { id: 'bar',      name: 'Bar cocktails',   color: 'var(--riad)',    raw: '#053B2C', kind: 'bar'     },
    { id: 'bbq',      name: 'Barbecue',        color: '#C24A2E',        raw: '#C24A2E', kind: 'kitchen', custom: true },
    { id: 'crepes',   name: 'Crêpes bar',      color: '#C97A4A',        raw: '#C97A4A', kind: 'kitchen', custom: true },
  ];
  const findStation = (id) => STATIONS.find((s) => s.id === id);

  /* ───────────── data · MENU items (id, name, desc, price, stations[]) ─── */
  const CATS = [
    { key: 'entrees',  label: 'Entrées',  count: 5 },
    { key: 'tajines',  label: 'Tajines',  count: 5 },
    { key: 'couscous', label: 'Couscous', count: 4 },
    { key: 'desserts', label: 'Desserts', count: 4 },
    { key: 'boissons', label: 'Boissons', count: 5 },
  ];
  const MENU = {
    entrees: [
      { id: 'ent-1', n: 'Salade marocaine',     d: 'Tomate, concombre, oignon, huile d\'olive',     p: 32,  st: 'ok',  stations: ['salade'],            sold: 142, rank: 6  },
      { id: 'ent-2', n: 'Caviar d\'aubergine',  d: 'Aubergine fumée, ail, cumin',                   p: 28,  st: 'ok',  stations: ['salade'],            sold: 96,  rank: 11 },
      { id: 'ent-3', n: 'Briouates viande',     d: 'Triangles croustillants, bœuf mijoté',          p: 45,  st: 'ok',  stations: ['cuisson'],           sold: 84,  rank: 8  },
      { id: 'ent-4', n: 'Harira',               'd': 'Soupe pois chiches & lentilles',              p: 28,  st: 'ok',  stations: ['cuisson'],           sold: 98,  rank: 7  },
      { id: 'ent-5', n: 'Zaalouk',              d: 'Aubergine fumée, tomate, ail',                  p: 28,  st: 'low', stations: ['salade'],            sold: 56,  rank: 12 },
    ],
    tajines: [
      { id: 'taj-1', n: 'Tajine kefta œuf',     d: 'Viande hachée, œuf, tomate, épices',           p: 85,  st: 'ok',  stations: ['cuisson'],           sold: 312, rank: 1  },
      { id: 'taj-2', n: 'Tajine agneau pruneaux', d: 'Agneau mijoté, pruneaux, amandes',           p: 110, st: 'out', stations: ['cuisson'],           sold: 184, rank: 4  },
      { id: 'taj-3', n: 'Tajine poulet citron', d: 'Poulet, olives, citron confit',                p: 95,  st: 'ok',  stations: ['cuisson'],           sold: 226, rank: 3  },
      { id: 'taj-4', n: 'Méchoui',              d: 'Agneau rôti à la braise, parts pour 2 · 4',    p: 180, st: 'low', stations: ['bbq'],               sold: 24,  rank: 16 },
      { id: 'taj-5', n: 'Pastilla poulet',      d: 'Feuille fine, amandes, cannelle, sucre glace', p: 120, st: 'low', stations: ['cuisson', 'pastry'], sold: 156, rank: 5  },
    ],
    couscous: [
      { id: 'cou-1', n: 'Couscous royal',       d: 'Bœuf, poulet, merguez, légumes',               p: 95,  st: 'ok',  stations: ['cuisson'],           sold: 287, rank: 2  },
      { id: 'cou-2', n: 'Couscous légumes',     d: '7 légumes, pois chiches, raisins',             p: 68,  st: 'ok',  stations: ['cuisson'],           sold: 64,  rank: 9  },
      { id: 'cou-3', n: 'Couscous agneau',      d: 'Agneau braisé, oignons confits',               p: 105, st: 'low', stations: ['cuisson'],           sold: 98,  rank: 7  },
      { id: 'cou-4', n: 'Couscous tfaya',       d: 'Poulet, oignons caramélisés, raisins',         p: 88,  st: 'ok',  stations: ['cuisson'],           sold: 72,  rank: 10 },
    ],
    desserts: [
      { id: 'des-1', n: 'Msemen beurre & miel', d: 'Crêpe feuilletée, beurre, miel d\'eucalyptus', p: 12,  st: 'ok',  stations: ['pastry'],            sold: 221, rank: 6  },
      { id: 'des-2', n: 'Crêpe complète',       d: 'Œuf, jambon de dinde, fromage, beurre',        p: 38,  st: 'ok',  stations: ['crepes'],            sold: 64,  rank: 11 },
      { id: 'des-3', n: 'Cornes de gazelle',    d: 'Pâte d\'amande, fleur d\'oranger',             p: 28,  st: 'low', stations: ['pastry'],            sold: 72,  rank: 11 },
      { id: 'des-4', n: 'Sellou',               d: 'Graines de sésame, amandes, miel',             p: 30,  st: 'ok',  stations: ['pastry'],            sold: 38,  rank: 13 },
    ],
    boissons: [
      { id: 'bo-1',  n: 'Thé à la menthe',       d: 'Gunpowder, menthe fraîche, sucre',            p: 12,  st: 'ok',  stations: ['boissons'],          sold: 412, rank: 5  },
      { id: 'bo-2',  n: 'Orange pressée',        d: 'Pressée minute · oranges Souss',              p: 18,  st: 'ok',  stations: ['boissons'],          sold: 198, rank: 7  },
      { id: 'bo-3',  n: 'Café noir double',      d: 'Espresso double · grain Algeria',             p: 14,  st: 'ok',  stations: ['boissons'],          sold: 124, rank: 10 },
      { id: 'bo-4',  n: 'Cocktail mocktail',     d: 'Citron vert, menthe, fleur d\'oranger',       p: 32,  st: 'ok',  stations: ['bar'],               sold: 87,  rank: 8  },
      { id: 'bo-5',  n: 'Limonade traditionnelle', d: 'Citron, eau de fleur d\'oranger, gazeuse', p: 16,  st: 'ok',  stations: ['boissons'],          sold: 54,  rank: 14 },
    ],
  };
  const allItems = () => Object.values(MENU).flat();
  const itemsForStation = (sid) => allItems().filter((it) => it.stations.includes(sid));
  const stationStats = (sid) => {
    const items = itemsForStation(sid);
    return { items: items.length, sold: items.reduce((acc, it) => acc + it.sold, 0) };
  };

  /* ───────────── injected styles · station chips + extras ───────────── */
  if (!document.querySelector('#kiwi-stations-css')) {
    const css = document.createElement('style');
    css.id = 'kiwi-stations-css';
    css.textContent = `
      .kiwi-st-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-family: var(--mono); letter-spacing: 0.04em; padding: 3px 7px 3px 6px; border-radius: 7px; background: var(--paper-soft); border: 1px solid var(--n-200); color: var(--n-600); white-space: nowrap; line-height: 1.2; }
      html[data-theme="dark"] .kiwi-st-chip { background: var(--paper-muted); }
      .kiwi-st-chip i { display: inline-block; width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
      .kiwi-st-chip.solid { background: var(--inverse-surface); color: var(--inverse-ink); border-color: transparent; }
      .kiwi-st-chips { display: inline-flex; gap: 5px; flex-wrap: wrap; margin-top: 4px; }
      .menu-row .kiwi-st-chips { margin-top: 5px; }

      .kiwi-st-pick { display: flex; gap: 7px; flex-wrap: wrap; padding: 4px 0 2px; }
      .kiwi-st-opt { display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px; border-radius: 999px; border: 1px solid var(--n-200); background: var(--paper-soft); color: var(--n-600); font-size: 12.5px; cursor: pointer; transition: transform 140ms, opacity 140ms, background-color 140ms, border-color 140ms, color 140ms, box-shadow 140ms; user-select: none; }
      html[data-theme="dark"] .kiwi-st-opt { background: var(--paper-muted); }
      .kiwi-st-opt:hover { border-color: var(--ink); color: var(--ink); }
      .kiwi-st-opt.on { background: var(--atlas); color: var(--paper); border-color: var(--atlas); }
      .kiwi-st-opt.on i { background: var(--mint) !important; }
      .kiwi-st-opt i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
      .kiwi-st-opt .kind { font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; opacity: 0.66; text-transform: uppercase; }

      .kiwi-st-mgr { display: grid; grid-template-columns: 28px 1fr auto auto; gap: 14px; align-items: center; padding: 13px 4px; border-bottom: 1px solid var(--n-200); }
      .kiwi-st-mgr:last-child { border-bottom: 0; }
      .kiwi-st-mgr .sw { width: 22px; height: 22px; border-radius: 7px; }
      .kiwi-st-mgr .nm { font-weight: 500; font-size: 14px; letter-spacing: -0.005em; }
      .kiwi-st-mgr .nm .m { font-size: 11.5px; color: var(--n-500); margin-top: 2px; font-family: var(--mono); letter-spacing: 0.04em; text-transform: uppercase; }
      .kiwi-st-mgr .ct { font-family: var(--mono); font-size: 12px; color: var(--ink); background: var(--paper-soft); padding: 4px 9px; border-radius: 999px; font-weight: 500; }

      .kiwi-st-swatch { display: inline-block; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; border: 2px solid transparent; transition: transform 120ms; }
      .kiwi-st-swatch:hover { transform: scale(1.08); }
      .kiwi-st-swatch.on { border-color: var(--ink); transform: scale(1.08); box-shadow: 0 0 0 2px var(--paper); }

      .kds-st-tabs { display: flex; gap: 6px; overflow-x: auto; padding: 4px 0 8px; margin: 2px 0 14px; border-bottom: 1px solid var(--n-200); }
      .kds-st-tab { display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px; border-radius: 10px 10px 0 0; border: 1px solid transparent; background: transparent; color: var(--n-500); font-size: 13px; font-weight: 500; letter-spacing: -0.005em; cursor: pointer; transition: color 140ms, background 140ms; white-space: nowrap; flex-shrink: 0; margin-bottom: -1px; }
      .kds-st-tab:hover { color: var(--ink); background: var(--paper-soft); }
      .kds-st-tab.on { color: var(--ink); background: var(--paper); border-color: var(--n-200); border-bottom-color: var(--paper); }
      html[data-theme="dark"] .kds-st-tab.on { background: var(--paper-muted); border-bottom-color: var(--paper-muted); }
      .kds-st-tab i { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .kds-st-tab .ct { font-family: var(--mono); font-size: 11px; color: var(--n-500); padding: 1px 6px; background: var(--paper-soft); border-radius: 999px; }
      html[data-theme="dark"] .kds-st-tab .ct { background: var(--paper-muted); }
      .kds-st-tab.on .ct { color: var(--atlas); background: var(--mint-soft); }

      .kds-tk-st-line { display: flex; align-items: center; gap: 6px; padding: 4px 0; font-size: 13px; line-height: 1.3; }
      .kds-tk-st-line .q { font-family: var(--mono); font-weight: 600; min-width: 24px; color: var(--n-600); }
      .kds-tk-st-line .nm { flex: 1; }
      .kds-tk-st-line .stations { display: inline-flex; gap: 4px; }
      .kds-tk-st-line.muted { opacity: 0.32; }
      .kds-tk-st-line.muted .nm { text-decoration: line-through; }
    `;
    document.head.appendChild(css);
  }

  /* ───────────── helpers · station chip rendering ───────────── */
  const stationChip = (sid, opts = {}) => {
    const s = findStation(sid);
    if (!s) return '';
    const cls = opts.solid ? 'kiwi-st-chip solid' : 'kiwi-st-chip';
    const bg = opts.solid ? `style="background:${s.raw}; color:var(--paper);"` : '';
    return `<span class="${cls}" ${bg} title="${s.name} · ${s.kind === 'bar' ? 'bar' : 'cuisine'}"><i style="background:${s.raw};"></i>${s.name}</span>`;
  };
  const stationKindLabel = (k) => (k === 'bar' ? 'BAR' : 'CUISINE');
  const stationSummaryHtml = () => STATIONS.map((s) => {
    const stats = stationStats(s.id);
    return `<div style="display:grid; grid-template-columns:14px 1fr auto; gap:10px; align-items:center; background:var(--surface); border:1px solid var(--n-200); border-radius:10px; padding:10px 12px;"><span style="width:10px; height:10px; border-radius:50%; background:${s.raw};"></span><div><div style="font-weight:500;">${s.name}</div><div style="font-size:11px; color:var(--n-500); font-family:var(--mono); letter-spacing:0.06em; text-transform:uppercase;">${stationKindLabel(s.kind)}${s.custom ? ' · custom' : ''}</div></div><span class="mono" style="font-size:11px; color:var(--n-500);">${stats.items} items · ${stats.sold} vendus</span></div>`;
  }).join('');

  /* ───────────── helper: dismiss buttons ───────────── */
  const wireDismiss = (m) => {
    if (!m || !m.el) return;
    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-dismiss]')) m.close();
    });
  };

  /* ═══════════════════════════════════════════════════════════════════════
   *   handlers['nav-menu']  ·  Menu & stations
   * ═════════════════════════════════════════════════════════════════════════ */
  /* ─── Options data · sample modifier groups (Glovo-style) ─────────────── */
  const OPTION_GROUPS = [
    { id: 'opt-cuisson',  name: 'Cuisson',            kind: 'radio',  applies: 6,  vals: [
      { n: 'Bleu' }, { n: 'Saignant' }, { n: 'À point' }, { n: 'Bien cuit' }
    ]},
    { id: 'opt-supp',     name: 'Suppléments fromage', kind: 'multi', applies: 12, vals: [
      { n: 'Cheddar', p: 8 }, { n: 'Comté', p: 12 }, { n: 'Bleu', p: 10 }, { n: 'Mozzarella', p: 8 }
    ]},
    { id: 'opt-sauces',   name: 'Sauces',              kind: 'multi', applies: 18, vals: [
      { n: 'BBQ' }, { n: 'Mayo' }, { n: 'Andalouse' }, { n: 'Algérienne' }, { n: 'Samouraï' }, { n: 'Harissa' }
    ]},
    { id: 'opt-pain',     name: 'Pain à part',         kind: 'toggle', applies: 8, vals: [ { n: 'Oui' } ]},
    { id: 'opt-cor',      name: 'Sans coriandre',      kind: 'toggle', applies: 22, vals: [ { n: 'Oui' } ]},
    { id: 'opt-piment',   name: 'Sans piment',         kind: 'toggle', applies: 14, vals: [ { n: 'Oui' } ]},
    { id: 'opt-boisson',  name: 'Boisson menu',        kind: 'radio',  applies: 5,  vals: [
      { n: 'Coca' }, { n: 'Coca Zero' }, { n: 'Sprite' }, { n: 'Thé menthe' }, { n: 'Eau' }
    ]},
    { id: 'opt-acc',      name: 'Accompagnement',      kind: 'radio',  applies: 9,  vals: [
      { n: 'Frites maison' }, { n: 'Salade verte' }, { n: 'Riz safrané' }, { n: 'Légumes vapeur' }
    ]},
  ];
  const optionKindLabel = (k) => k === 'radio' ? 'CHOIX UNIQUE' : k === 'multi' ? 'CHOIX MULTIPLE' : 'INTERRUPTEUR';

  /* ─── thumbnail glyph picker ───────────────────────────────────────────── */
  const itemGlyph = (n) =>
    /tajine/i.test(n)   ? '◉' :
    /couscous/i.test(n) ? '◓' :
    /pastilla/i.test(n) ? '✦' :
    /salade/i.test(n)   ? '◴' :
    /briouate|harira/i.test(n) ? '◔' :
    /msemen|crêpe|cornes|sellou/i.test(n) ? '✺' :
    /thé|café|coffee/i.test(n) ? '☕' :
    /orange|limonade|cocktail|jus/i.test(n) ? '◍' :
    /méchoui|bbq/i.test(n) ? '◈' :
    /zaalouk|aubergine|caviar/i.test(n) ? '◐' :
                          '●';

  /* ═══════════════════════════════════════════════════════════════════════
   *   handlers['nav-menu']  ·  Menu (Glovo-inspired) — Produits | Options | Stations
   *   Two-column layout (category rail + items pane) with three top-level tabs.
   * ═════════════════════════════════════════════════════════════════════════ */
  handlers['nav-menu'] = () => {
    let activeTab = 'products';      // products | options | stations
    let activeCat = 'tajines';
    let searchTerm = '';
    const menu86 = new Set(['taj-2']);

    const stockChip = (st) =>
      st === 'ok'  ? '' :
      st === 'low' ? '<span class="chip pend" style="font-size:11px;">stock bas</span>' :
                     '<span class="chip ref" style="font-size:11px;">RUPTURE</span>';

    /* ── helpers ─────────────────────────────────────────────────────────── */
    const catItems = (key) => MENU[key] || [];
    const catAlerts = (key) => catItems(key).filter((it) => menu86.has(it.id) || it.st === 'out').length;
    const catActive = (key) => catItems(key).filter((it) => !menu86.has(it.id)).length;

    const matchSearch = (it) => {
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return it.n.toLowerCase().includes(q)
        || it.d.toLowerCase().includes(q)
        || it.stations.some((sid) => (findStation(sid)?.name || '').toLowerCase().includes(q));
    };

    /* ── rail · category cards ───────────────────────────────────────────── */
    const renderRail = () => `
      <button data-activation=write class="kw-cat-add" data-action="menu-cat-add">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
        Ajouter une catégorie
      </button>
      ${CATS.map((c) => {
        const alerts = catAlerts(c.key);
        const total = catItems(c.key).length;
        return `
          <button data-activation=write class="kw-cat-card ${c.key === activeCat ? 'on' : ''}" data-cat="${c.key}">
            <div class="body">
              <div class="nm">${c.label}</div>
              <div class="ct">${total} produit${total > 1 ? 's' : ''}</div>
            </div>
            <div class="meta">
              ${alerts > 0 ? `<span class="badge alert" title="${alerts} en rupture / 86'd">${alerts}</span>` : ''}
              <span class="chev"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 6l6 6-6 6"/></svg></span>
            </div>
          </button>`;
      }).join('')}
    `;

    /* ── items pane · single category ───────────────────────────────────── */
    const renderItem = (it) => {
      const is86 = menu86.has(it.id);
      const stationChips = it.stations.map(stationChip).join('');
      return `
        <div class="kw-item ${is86 ? 'is-86' : ''}" data-row="${it.id}">
          <div class="thumb">${itemGlyph(it.n)}</div>
          <div class="body">
            <div class="nm">${it.n} ${stockChip(is86 ? 'out' : it.st)}</div>
            <div class="desc">${it.d}</div>
            <button data-activation=write class="view-opt" data-row-act="edit" data-id="${it.id}">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path d="M12 8v4l3 2"/></svg>
              Voir les options
            </button>
            <div class="st-chips" data-st-row="${it.id}">${stationChips}</div>
          </div>
          <div class="price">${(window.KiwiNumber?.format(it.p, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? it.p.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))} MAD<span class="rk">#${it.rank} · ${it.sold} vendus</span></div>
          <span class="sw ${is86 ? '' : 'on'}" data-row-act="86" data-id="${it.id}" title="${is86 ? '86 (rupture)' : 'En stock, cliquer pour 86'}" role="switch" aria-checked="${!is86}"></span>
        </div>`;
    };

    const renderItemsPane = () => {
      const cat = CATS.find((c) => c.key === activeCat);
      const list = catItems(activeCat).filter(matchSearch);
      const body = list.length
        ? list.map(renderItem).join('')
        : `<div class="kw-items-empty">Aucun produit ne correspond${searchTerm ? ` à « ${searchTerm} »` : ''}.</div>`;
      return `
        <div class="kw-items-pane">
          <div class="kw-items-head">
            <h3>
              ${cat ? cat.label.toUpperCase() : '·'}
              <span class="edit-cat" data-action="menu-cat-edit" title="Renommer · supprimer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z"/></svg>
              </span>
            </h3>
            <button data-activation=write class="add-prod" data-action="menu-add">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
              Ajouter un produit
            </button>
          </div>
          ${body}
        </div>`;
    };

    const renderProductsTab = () => `
      <div class="kw-menu-grid">
        <div class="kw-cat-rail" id="kw-cat-rail">${renderRail()}</div>
        <div id="kw-items-pane">${renderItemsPane()}</div>
      </div>
    `;

    /* ── Options tab pane ───────────────────────────────────────────────── */
    const kindPill = (k) => `<span class="kind-pill">${optionKindLabel(k)}</span>`;
    const renderOptionGroup = (g) => `
      <div class="kw-opt-group" data-opt="${g.id}">
        <div class="h">
          <div>
            <div class="nm">${g.name} ${kindPill(g.kind)}</div>
            <div class="meta">Appliqué à ${g.applies} produit${g.applies > 1 ? 's' : ''} · ${g.vals.length} option${g.vals.length > 1 ? 's' : ''}</div>
          </div>
          <button class="kw-menu-action icon" title="Éditer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z"/></svg>
          </button>
        </div>
        <div class="vals">
          ${g.vals.map((v) => `<span class="v ${v.p ? 'priced' : ''}">${v.n}${v.p ? `<span class="pr">+${v.p} MAD</span>` : ''}</span>`).join('')}
        </div>
      </div>
    `;
    const renderOptionsTab = () => `
      <div class="kw-opt-pane">
        <div class="head">
          <div>
            <h3>Groupes d'options</h3>
            <div class="sub">${OPTION_GROUPS.length} groupes · attachez-les à un produit depuis l'éditeur d'item.</div>
          </div>
          <button data-activation=write class="kw-menu-action" data-action="menu-opt-add" style="background:var(--inverse-surface); color:var(--inverse-ink); border-color:var(--inverse-surface);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
            Créer un groupe
          </button>
        </div>
        ${OPTION_GROUPS.map(renderOptionGroup).join('')}
      </div>
    `;

    /* ── Stations tab pane ──────────────────────────────────────────────── */
    const renderStationCard = (s) => {
      const stats = stationStats(s.id);
      return `
        <div class="kw-st-card" data-st="${s.id}">
          <span class="sw" style="background:${s.raw};"></span>
          <div class="body">
            <div class="nm">${s.name}</div>
            <div class="kind">${stationKindLabel(s.kind)}${s.custom ? ' · personnalisée' : ''}</div>
            <div class="stats">
              <div><b>${stats.items}</b>item${stats.items > 1 ? 's' : ''} routé${stats.items > 1 ? 's' : ''}</div>
              <div><b>${(window.KiwiNumber?.format(stats.sold, {}) ?? stats.sold.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}))}</b>vendus / 30 j</div>
            </div>
            <div class="row-actions">
              ${s.custom
                ? `<button data-activation=write class="kw-menu-action" data-st-delete-id="${s.id}" style="padding:6px 12px; font-size:11.5px;">Supprimer</button>`
                : `<span class="badge-sys">SYSTÈME</span>`}
              ${s.custom ? `<span class="badge-cust">CUSTOM</span>` : ''}
            </div>
          </div>
        </div>`;
    };
    const renderStationsTab = () => `
      <div class="kw-st-pane">
        <div class="head">
          <div>
            <h3>Stations de préparation</h3>
            <div class="sub">${STATIONS.length} stations actives · chaque produit est routé vers 1+ station${STATIONS.length > 1 ? 's' : ''}. Les tickets KDS apparaissent simultanément.</div>
          </div>
          <button data-activation=write class="kw-menu-action" data-action="menu-station-create" style="background:var(--atlas); color:var(--paper); border-color:var(--atlas);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
            Créer une station
          </button>
        </div>
        <div class="kw-st-grid">${STATIONS.map(renderStationCard).join('')}</div>
        <div style="margin-top:14px; padding:14px 16px; background:var(--paper-soft); border-radius:10px; font-size:12.5px; color:var(--n-600); line-height:1.5; display:flex; gap:10px; align-items:flex-start;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--atlas); flex-shrink:0; margin-top:1px;"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h0"/></svg>
          <div><b>Astuce :</b> ajoutez une station "Pizza four" ou "Bar à jus" si votre établissement a une zone dédiée. Le KDS basculera automatiquement vers la nouvelle station dans les 5 secondes.</div>
        </div>
      </div>
    `;

    /* ── full body ──────────────────────────────────────────────────────── */
    const tabCounts = {
      products: allItems().length,
      options:  OPTION_GROUPS.length,
      stations: STATIONS.length,
    };

    const renderTabBody = () =>
      activeTab === 'products' ? renderProductsTab() :
      activeTab === 'options'  ? renderOptionsTab()  :
                                 renderStationsTab();

    const menuDr = fullpage({
      title: 'Menu · Café Atlas',
      subtitle: `${allItems().length} produits · ${CATS.length} catégories · ${STATIONS.length} stations · ${menu86.size} en rupture`,
      width: 1080,
      body: `
        <div class="p-kpis">
          <div class="p-kpi"><div class="l">CARTE ACTIVE</div><div class="v">${allItems().length}<span class="u"> produits</span></div><div class="d up">+ 3 ce mois</div></div>
          <div class="p-kpi"><div class="l">PANIER MOYEN</div><div class="v">158<span class="u"> MAD</span></div><div class="d up">+ 4,2 % vs sem. dernière</div></div>
          <div class="p-kpi"><div class="l">STATIONS</div><div class="v">${STATIONS.length}</div><div class="d">${STATIONS.filter((s) => s.kind === 'kitchen').length} cuisine · ${STATIONS.filter((s) => s.kind === 'bar').length} bar</div></div>
          <div class="p-kpi" style="background:rgba(201,74,58,0.06); border-color:rgba(201,74,58,0.25);"><div class="l">EN RUPTURE</div><div class="v" style="color:var(--danger);">${menu86.size}</div><div class="d">tajine agneau · etc.</div></div>
        </div>

        <div class="menu-ai">
          <div class="ic">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="currentColor"/></svg>
          </div>
          <div class="b">
            <div class="t">INSIGHT KIWI · STATIONS</div>
            <div class="n">La station Cuisson chaude porte 64 % du chiffre · pensez à équilibrer.</div>
            <div class="d">Le tajine kefta œuf et le couscous royal saturent la cuisson aux pics. Le bar et la pâtisserie sont sous-utilisés à midi.</div>
          </div>
          <button class="kb" style="background:var(--mint); color:var(--riad);" data-action="menu-promote">Voir suggestions</button>
        </div>

        <div class="kw-menu-tabs" id="kw-menu-tabs">
          <button data-activation=write class="kw-menu-tab ${activeTab === 'products' ? 'on' : ''}" data-tab="products">
            Produits <span class="ct">${tabCounts.products}</span>
          </button>
          <button data-activation=write class="kw-menu-tab ${activeTab === 'options' ? 'on' : ''}" data-tab="options">
            Options <span class="ct">${tabCounts.options}</span>
          </button>
          <button data-activation=write class="kw-menu-tab ${activeTab === 'stations' ? 'on' : ''}" data-tab="stations">
            Stations <span class="ct">${tabCounts.stations}</span>
          </button>
        </div>

        <div class="kw-menu-toolbar">
          <label class="kw-menu-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
            <input id="kw-menu-search-input" type="text" placeholder="Rechercher un produit, une station, un allergène…" />
          </label>
          <button class="kw-menu-action" data-action="menu-schedule" title="Plages horaires">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M6 12h12M9 18h6"/></svg>
            Filtres
          </button>
          <button data-activation=write class="kw-menu-action icon" title="Plus" data-action="menu-publish">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
          </button>
        </div>

        <div id="kw-menu-tab-body">${renderTabBody()}</div>
      `,
      foot: `
        <div style="display:flex; gap:8px; justify-content:space-between; width:100%; align-items:center;">
          <span style="font-family:var(--mono); font-size:11px; color:var(--n-500); letter-spacing:0.06em;">SYNC POS · 100 % · ROUTAGE STATIONS LIVE</span>
          <div style="display:flex; gap:8px;">
            <button class="kb ghost" data-dismiss>Fermer</button>
            <button data-activation=write class="kb primary" data-action="menu-publish">Publier la carte</button>
          </div>
        </div>
      `,
    });
    wireDismiss(menuDr);

    /* ── wire: tabs + rail + items ─────────────────────────────────────── */
    setTimeout(() => {
      const root = menuDr.el;
      if (!root) return;

      const body = root.querySelector('#kw-menu-tab-body');
      const tabs = root.querySelector('#kw-menu-tabs');
      const searchInput = root.querySelector('#kw-menu-search-input');

      const refreshTabBody = () => {
        body.innerHTML = renderTabBody();
        wireBody();
      };

      const refreshRail = () => {
        const rail = root.querySelector('#kw-cat-rail');
        if (rail) rail.innerHTML = renderRail();
        wireRail();
      };

      const refreshItems = () => {
        const pane = root.querySelector('#kw-items-pane');
        if (pane) pane.innerHTML = renderItemsPane();
        wireItems();
      };

      const refreshSubtitle = () => {
        const sub = root.querySelector('.kiwi-drawer-head p');
        if (sub) sub.textContent = `${allItems().length} produits · ${CATS.length} catégories · ${STATIONS.length} stations · ${menu86.size} en rupture`;
      };

      const wireRail = () => {
        body.querySelectorAll('.kw-cat-card').forEach((btn) => {
          btn.onclick = () => {
            const key = btn.getAttribute('data-cat');
            if (key === activeCat) return;
            activeCat = key;
            refreshRail();
            refreshItems();
          };
        });
      };

      const wireItems = () => {
        const pane = body.querySelector('#kw-items-pane');
        if (!pane) return;
        pane.querySelectorAll('[data-row-act]').forEach((b) => {
          b.onclick = (e) => {
            e.stopPropagation();
            const a = b.getAttribute('data-row-act');
            const id = b.getAttribute('data-id');
            const it = allItems().find((x) => x.id === id);
            if (!it) return;
            if (a === '86') {
              if (menu86.has(id)) menu86.delete(id);
              else menu86.add(id);
              toast(menu86.has(id) ? `${it.n} marqué en rupture` : `${it.n} de retour à la carte`, {
                type: menu86.has(id) ? 'warn' : 'success',
                desc: menu86.has(id) ? 'Retiré de la caisse et du QR menu.' : 'Produit disponible sur tous les canaux.',
              });
              refreshItems();
              refreshRail();
              refreshSubtitle();
            }
            if (a === 'edit') openItemEdit(it, () => { refreshItems(); refreshRail(); });
          };
        });
        pane.querySelectorAll('.kw-item').forEach((r) => {
          r.addEventListener('click', (e) => {
            if (e.target.closest('[data-row-act]')) return;
            const id = r.getAttribute('data-row');
            const it = allItems().find((x) => x.id === id);
            if (it) openItemEdit(it, () => { refreshItems(); refreshRail(); });
          });
        });
      };

      const wireStations = () => {
        body.querySelectorAll('.kw-st-card').forEach((card) => {
          card.addEventListener('click', (e) => {
            if (e.target.closest('[data-st-delete-id]')) return;
            const sid = card.getAttribute('data-st');
            const s = findStation(sid);
            if (s) toast(`Station "${s.name}"`, { type: 'info', desc: `${stationStats(sid).items} produits routés · ${stationKindLabel(s.kind)}.` });
          });
        });
        body.querySelectorAll('[data-st-delete-id]').forEach((btn) => {
          btn.onclick = (e) => {
            e.stopPropagation();
            const sid = btn.getAttribute('data-st-delete-id');
            const s = findStation(sid);
            if (!s) return;
            const stats = stationStats(sid);
            if (stats.items > 0) {
              toast(`Impossible · ${stats.items} produit${stats.items > 1 ? 's' : ''} routé${stats.items > 1 ? 's' : ''}`, {
                type: 'warn',
                desc: `Réaffectez les produits de la station "${s.name}" avant de la supprimer.`,
              });
              return;
            }
            const idx = STATIONS.findIndex((x) => x.id === sid);
            if (idx >= 0) STATIONS.splice(idx, 1);
            refreshTabBody();
            refreshSubtitle();
            toast(`Station "${s.name}" supprimée`, { type: 'success' });
          };
        });
      };

      const wireOptions = () => {
        body.querySelectorAll('.kw-opt-group').forEach((g) => {
          g.addEventListener('click', () => {
            const id = g.getAttribute('data-opt');
            const grp = OPTION_GROUPS.find((x) => x.id === id);
            if (grp) toast(`Groupe "${grp.name}"`, { type: 'info', desc: `${optionKindLabel(grp.kind)} · ${grp.vals.length} options · attaché à ${grp.applies} produits.` });
          });
        });
      };

      const wireBody = () => {
        if (activeTab === 'products') { wireRail(); wireItems(); }
        if (activeTab === 'options')  { wireOptions(); }
        if (activeTab === 'stations') { wireStations(); }
      };

      // Tabs
      tabs.querySelectorAll('.kw-menu-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
          const t = btn.getAttribute('data-tab');
          if (t === activeTab) return;
          activeTab = t;
          tabs.querySelectorAll('.kw-menu-tab').forEach((b) => b.classList.toggle('on', b === btn));
          refreshTabBody();
        });
      });

      // Search
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          searchTerm = searchInput.value.trim();
          if (activeTab === 'products') refreshItems();
        });
      }

      // Expose hooks for external handlers (station create modal etc.)
      root.__kiwiMenu = {
        refreshAllRowChips: refreshItems,
        refreshSummary: refreshTabBody,
        refreshTabBody,
      };

      wireBody();
    }, 0);
  };

  /* ═══════════════════════════════════════════════════════════════════════
   *   Item edit modal (with station picker)
   * ═════════════════════════════════════════════════════════════════════════ */
  const openItemEdit = (it, onSave) => {
    const draftStations = new Set(it.stations);

    const renderStationPicker = () => STATIONS.map((s) => `
      <button type="button" class="kiwi-st-opt ${draftStations.has(s.id) ? 'on' : ''}" data-st-toggle="${s.id}">
        <i style="background:${s.raw};"></i>${s.name}
        <span class="kind">· ${s.kind === 'bar' ? 'bar' : 'cuisine'}</span>
      </button>`).join('');

    const editM = modal({
      tag: 'ITEM',
      title: it.n,
      desc: it.d,
      width: 640,
      body: `
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Nom</label><input class="kf-input" value="${it.n}" /></div>
          <div class="kf-group"><label class="kf-label">Prix TTC</label><input class="kf-input mono" value="${it.p}.00" /></div>
        </div>
        <div class="kf-group">
          <label class="kf-label">Description courte</label>
          <input class="kf-input" value="${it.d}" />
        </div>
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Catégorie</label>
            <select class="kf-input">
              ${CATS.map((c) => `<option ${MENU[c.key].some((x) => x.id === it.id) ? 'selected' : ''}>${c.label}</option>`).join('')}
            </select>
          </div>
          <div class="kf-group"><label class="kf-label">Temps de prep.</label>
            <select class="kf-input"><option>5 min</option><option>10 min</option><option selected>15 min</option><option>20 min</option><option>25 min</option><option>30 min</option></select>
          </div>
        </div>

        <div class="kf-group" style="margin-top:8px;">
          <label class="kf-label" style="display:flex; justify-content:space-between; align-items:center;">
            <span>Stations de préparation</span>
            <span class="meta" style="font-family:var(--mono); font-size:11px; color:var(--n-500); letter-spacing:0.06em;">SÉLECTIONNEZ 1 OU PLUSIEURS</span>
          </label>
          <div class="kiwi-st-pick" id="kiwi-st-pick">${renderStationPicker()}</div>
          <div class="kf-help">Le ticket KDS apparaîtra simultanément sur chaque station sélectionnée. Idéal pour les plats croisés (ex. pastilla = cuisson + pâtisserie).</div>
        </div>

        <div class="kf-group">
          <label class="kf-label">Modificateurs autorisés</label>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${['Sans coriandre', 'Sans piment', 'Pain à part', 'Bien cuit', 'Saignant', 'Sans gluten'].map((m, i) => `<span class="chip ${i < 3 ? 'ok' : 'neutral'}" style="cursor:pointer;">${i < 3 ? '✓ ' : ''}${m}</span>`).join('')}
          </div>
        </div>

        <div class="p-card" style="margin:14px 0 0;">
          <div class="head"><h4 style="font-size:13px;">Performance · 30 derniers jours</h4><span class="meta">RANG #${it.rank}</span></div>
          <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:14px; font-size:12.5px;">
            <div><div style="color:var(--n-500); font-size:11px;">Vendus</div><div class="mono" style="font-size:18px; font-weight:600;">${it.sold}</div></div>
            <div><div style="color:var(--n-500); font-size:11px;">CA</div><div class="mono" style="font-size:18px; font-weight:600;">${(window.KiwiNumber?.format((it.p * it.sold), {}) ?? (it.p * it.sold).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}))} MAD</div></div>
            <div><div style="color:var(--n-500); font-size:11px;">Marge brute</div><div class="mono" style="font-size:18px; font-weight:600; color:var(--atlas);">66 %</div></div>
          </div>
        </div>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>Annuler</button>
        <button data-activation=write class="kb danger" data-st-delete>Supprimer</button>
        <button data-activation=write class="kb atlas" data-st-save>Enregistrer</button>
      `,
    });
    wireDismiss(editM);

    setTimeout(() => {
      const root = editM.el;
      if (!root) return;
      const pick = root.querySelector('#kiwi-st-pick');
      pick.addEventListener('click', (e) => {
        const t = e.target.closest('[data-st-toggle]');
        if (!t) return;
        const sid = t.getAttribute('data-st-toggle');
        if (draftStations.has(sid)) {
          if (draftStations.size === 1) {
            toast('Au moins 1 station requise', { type: 'warn', desc: 'Le ticket doit pouvoir être routé quelque part.' });
            return;
          }
          draftStations.delete(sid);
        } else {
          draftStations.add(sid);
        }
        t.classList.toggle('on', draftStations.has(sid));
      });

      root.querySelector('[data-st-save]').addEventListener('click', () => {
        it.stations = Array.from(draftStations);
        const stationNames = it.stations.map((sid) => findStation(sid).name).join(' · ');
        editM.close();
        toast(`${it.n} mis à jour`, { type: 'success', desc: `Routé sur ${it.stations.length} station${it.stations.length > 1 ? 's' : ''} · ${stationNames}` });
        onSave?.();
      });
      root.querySelector('[data-st-delete]').addEventListener('click', () => {
        editM.close();
        toast(`${it.n} supprimé de la carte`, { type: 'warn', desc: 'Item retiré · les commandes ouvertes restent valides.' });
      });
    }, 0);
  };

  /* ═══════════════════════════════════════════════════════════════════════
   *   handlers · gestion des stations
   * ═════════════════════════════════════════════════════════════════════════ */
  const refreshMenuDrawer = () => {
    const m = document.querySelector('.kiwi-drawer-backdrop .kiwi-drawer');
    if (m && m.parentElement && m.parentElement.__kiwiMenu) {
      m.parentElement.__kiwiMenu.refreshAllRowChips();
      m.parentElement.__kiwiMenu.refreshSummary();
    }
  };

  handlers['menu-stations-manage'] = () => {
    const renderList = () => STATIONS.map((s) => {
      const stats = stationStats(s.id);
      return `
        <div class="kiwi-st-mgr" data-st-mgr="${s.id}">
          <span class="sw" style="background:${s.raw};"></span>
          <div class="nm">${s.name}<div class="m">${stationKindLabel(s.kind)}${s.custom ? ' · personnalisée' : ''}</div></div>
          <span class="ct">${stats.items} item${stats.items > 1 ? 's' : ''} · ${stats.sold} vendus</span>
          ${s.custom
            ? `<button data-activation=write class="kb ghost xs" data-st-delete-id="${s.id}">Supprimer</button>`
            : `<span class="chip neutral mono" style="font-size:11px; padding:3px 8px;">SYSTÈME</span>`}
        </div>`;
    }).join('');

    const m = modal({
      tag: 'STATIONS',
      title: 'Gérer les stations de préparation',
      desc: 'Chaque item de la carte est routé vers 1 ou plusieurs stations. Les stations système ne peuvent pas être supprimées.',
      width: 620,
      body: `
        <button data-activation=write class="kb atlas" style="width:100%; justify-content:center; margin-bottom:14px;" data-st-create>+ Créer une station personnalisée</button>
        <div id="st-mgr-list" style="background:var(--surface); border:1px solid var(--n-200); border-radius:12px; padding:4px 16px;">${renderList()}</div>
        <div style="margin-top:12px; padding:12px 14px; background:var(--paper-soft); border-radius:10px; font-size:12.5px; color:var(--n-600); line-height:1.5;">
          <b>Astuce :</b> ajoutez une station "Pizza four" ou "Bar à jus" si votre établissement a une zone dédiée. Le KDS basculera automatiquement vers la nouvelle station.
        </div>
      `,
      foot: `<button class="kb ghost" data-dismiss>Fermer</button>`,
    });
    wireDismiss(m);

    setTimeout(() => {
      const root = m.el;
      if (!root) return;
      const list = root.querySelector('#st-mgr-list');

      const refresh = () => { list.innerHTML = renderList(); };

      root.querySelector('[data-st-create]').addEventListener('click', () => openStationCreate(refresh));

      list.addEventListener('click', (e) => {
        const del = e.target.closest('[data-st-delete-id]');
        if (!del) return;
        const sid = del.getAttribute('data-st-delete-id');
        const s = findStation(sid);
        if (!s) return;
        const stats = stationStats(sid);
        if (stats.items > 0) {
          toast(`Impossible · ${stats.items} item${stats.items > 1 ? 's' : ''} routé${stats.items > 1 ? 's' : ''}`, {
            type: 'warn',
            desc: `Réaffectez les items de la station "${s.name}" avant de la supprimer.`,
          });
          return;
        }
        const idx = STATIONS.findIndex((x) => x.id === sid);
        if (idx >= 0) STATIONS.splice(idx, 1);
        refresh();
        refreshMenuDrawer();
        toast(`Station "${s.name}" supprimée`, { type: 'success' });
      });
    }, 0);
  };

  const openStationCreate = (afterCreate) => {
    const SWATCHES = [
      ['var(--atlas)', '#0B6E4F'], ['var(--riad)', '#053B2C'], ['var(--success)', '#1FB574'],
      ['var(--warning)', '#D99A2B'], ['var(--info)', '#3677A6'], ['var(--danger)', '#C24A2E'],
      ['#C97A4A', '#C97A4A'], ['#8B5CF6', '#8B5CF6'], ['#0EA5E9', '#0EA5E9'],
      ['#EC4899', '#EC4899'], ['#F97316', '#F97316'], ['#14B8A6', '#14B8A6'],
    ];
    let chosenColor = SWATCHES[0];
    let chosenKind = 'kitchen';

    const m = modal({
      tag: 'NOUVELLE STATION',
      title: 'Créer une station personnalisée',
      desc: 'Une nouvelle station apparaîtra immédiatement dans le sélecteur d\'item et sur le KDS.',
      width: 540,
      body: `
        <div class="kf-group">
          <label class="kf-label">Nom de la station</label>
          <input class="kf-input" id="st-new-name" placeholder="ex. Pizza four · Bar à jus · Sushi" />
        </div>
        <div class="kf-group">
          <label class="kf-label">Couleur</label>
          <div id="st-new-swatches" style="display:flex; gap:8px; flex-wrap:wrap;">
            ${SWATCHES.map((c, i) => `<span class="kiwi-st-swatch ${i === 0 ? 'on' : ''}" data-sw="${i}" style="background:${c[1]};"></span>`).join('')}
          </div>
        </div>
        <div class="kf-group">
          <label class="kf-label">Type</label>
          <div style="display:flex; gap:8px;" id="st-new-kind">
            <button type="button" class="kb atlas" data-kind="kitchen" style="flex:1; justify-content:center;">Cuisine</button>
            <button type="button" class="kb ghost" data-kind="bar" style="flex:1; justify-content:center;">Bar</button>
          </div>
        </div>
        <div style="padding:12px 14px; background:var(--paper-soft); border-radius:10px; font-size:12.5px; color:var(--n-600); line-height:1.5;">
          La station sera disponible sur tous les iPad cuisine et terminaux POS dans les 5 secondes après création.
        </div>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>Annuler</button>
        <button data-activation=write class="kb atlas" data-st-create-go>Créer la station</button>
      `,
    });
    wireDismiss(m);

    setTimeout(() => {
      const root = m.el;
      if (!root) return;
      root.querySelector('#st-new-swatches').addEventListener('click', (e) => {
        const sw = e.target.closest('[data-sw]');
        if (!sw) return;
        chosenColor = SWATCHES[+sw.getAttribute('data-sw')];
        root.querySelectorAll('[data-sw]').forEach((x) => x.classList.toggle('on', x === sw));
      });
      root.querySelector('#st-new-kind').addEventListener('click', (e) => {
        const k = e.target.closest('[data-kind]');
        if (!k) return;
        chosenKind = k.getAttribute('data-kind');
        root.querySelectorAll('[data-kind]').forEach((x) => {
          x.classList.toggle('atlas', x === k);
          x.classList.toggle('ghost', x !== k);
        });
      });

      root.querySelector('[data-st-create-go]').addEventListener('click', () => {
        const nameInput = root.querySelector('#st-new-name');
        const name = (nameInput.value || '').trim();
        if (!name) {
          nameInput.focus();
          toast('Donnez un nom à la station', { type: 'warn' });
          return;
        }
        const id = `st-${Date.now().toString(36)}`;
        STATIONS.push({ id, name, color: chosenColor[0], raw: chosenColor[1], kind: chosenKind, custom: true });
        m.close();
        toast(`Station "${name}" créée`, { type: 'success', desc: 'Disponible sur tous les iPad cuisine et le KDS.' });
        confetti();
        afterCreate?.();
        refreshMenuDrawer();
      });
    }, 0);
  };

  handlers['menu-station-create'] = () => openStationCreate(() => {});

  /* ─── new Glovo-redesign actions (category + option group create/edit) ─── */
  handlers['menu-cat-add'] = () => {
    toast('Nouvelle catégorie', {
      type: 'info',
      desc: 'Saisissez le nom, l\'icône et les plages horaires de visibilité. Mock.',
    });
  };
  handlers['menu-cat-edit'] = () => {
    toast('Catégorie · édition', {
      type: 'info',
      desc: 'Renommer · réordonner · supprimer · plages horaires. Mock.',
    });
  };
  handlers['menu-opt-add'] = () => {
    toast('Nouveau groupe d\'options', {
      type: 'info',
      desc: 'Choix unique · multiple · interrupteur · avec ou sans surcoût. Mock.',
    });
  };

  handlers['menu-promote'] = () => {
    const m = modal({
      tag: 'INSIGHT',
      title: 'Suggestions par station',
      desc: 'Optimisations détectées par Kiwi sur les 30 derniers jours.',
      width: 520,
      body: `
        <div class="p-card" style="margin:0 0 10px;"><div class="head"><h4 style="font-size:14px;">Cuisson chaude · saturée</h4><span class="chip ref">+18 % temps de prép.</span></div><div style="font-size:12.5px; color:var(--n-500);">Pré-portionner les keftas · gain estimé 90 s/ticket.</div></div>
        <div class="p-card" style="margin:0 0 10px;"><div class="head"><h4 style="font-size:14px;">Bar cocktails · sous-utilisé midi</h4><span class="chip ok">+ marge potentielle</span></div><div style="font-size:12.5px; color:var(--n-500);">Promouvoir le mocktail · upsell +12 % panier.</div></div>
        <div class="p-card" style="margin:0;"><div class="head"><h4 style="font-size:14px;">Pâtisserie · pic petit-déjeuner</h4><span class="chip pend">files 8h–10h</span></div><div style="font-size:12.5px; color:var(--n-500);">Lancer le msemen 30 min plus tôt.</div></div>
      `,
      foot: `<button class="kb ghost" data-dismiss>Fermer</button><button class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Suggestions appliquées',{type:'success'}); window.Kiwi.confetti();">Appliquer le plan</button>`,
    });
    wireDismiss(m);
  };

  handlers['menu-add'] = () => {
    const m = modal({
      tag: 'NOUVEAU',
      title: 'Ajouter un nouvel item',
      desc: 'Sera publié sur le POS, le QR menu et les agrégateurs en sync.',
      width: 600,
      body: `
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Nom de l'item</label><input class="kf-input" placeholder="ex. Tajine boulettes" /></div>
          <div class="kf-group"><label class="kf-label">Prix TTC</label><input class="kf-input mono" placeholder="0,00 MAD" /></div>
        </div>
        <div class="kf-group"><label class="kf-label">Catégorie</label>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${CATS.map((c, i) => `<button class="kb ${i === 1 ? 'atlas' : 'ghost'}" style="flex:1; min-width:90px; justify-content:center;">${c.label}</button>`).join('')}
          </div>
        </div>
        <div class="kf-group"><label class="kf-label">Stations de préparation</label>
          <div class="kiwi-st-pick">
            ${STATIONS.map((s, i) => `<span class="kiwi-st-opt ${i === 0 ? 'on' : ''}" data-st-new="${s.id}"><i style="background:${s.raw};"></i>${s.name}</span>`).join('')}
          </div>
        </div>
        <div class="kf-group"><label class="kf-label">Description (visible client)</label><input class="kf-input" placeholder="Ingrédients clés et style" /></div>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>Annuler</button>
        <button data-activation=write class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Item publié sur la carte',{type:'success',desc:'Visible sur votre caisse et votre QR menu.'}); window.Kiwi.confetti();">Créer & publier</button>
      `,
    });
    wireDismiss(m);
    setTimeout(() => {
      m.el.querySelector('.kiwi-st-pick').addEventListener('click', (e) => {
        const t = e.target.closest('[data-st-new]');
        if (!t) return;
        t.classList.toggle('on');
      });
    }, 0);
  };

  handlers['menu-schedule'] = () => {
    const m = modal({
      tag: 'PLAGES HORAIRES',
      title: 'Carte programmée',
      desc: 'Affiche / cache automatiquement des items selon le service ou la saison.',
      width: 600,
      body: `
        <div class="p-card" style="margin:0 0 10px;"><div class="head"><h4 style="font-size:14px;">Couscous royal</h4><span class="chip ok">vendredi 11h–15h</span></div><div style="font-size:12.5px; color:var(--n-500);">Affiché automatiquement le vendredi.</div></div>
        <div class="p-card" style="margin:0 0 10px;"><div class="head"><h4 style="font-size:14px;">Méchoui</h4><span class="chip pend">soir 19h–23h</span></div><div style="font-size:12.5px; color:var(--n-500);">Service du soir uniquement.</div></div>
        <div class="p-card" style="margin:0;"><div class="head"><h4 style="font-size:14px;">Petit-déj.</h4><span class="chip neutral">8h–11h tous les jours</span></div><div style="font-size:12.5px; color:var(--n-500);">Msemen, harira, café, thé.</div></div>
      `,
      foot: `<button class="kb ghost" data-dismiss>Fermer</button><button data-activation=write class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Programmation enregistrée',{type:'success'})">+ Ajouter une plage</button>`,
    });
    wireDismiss(m);
  };

  handlers['menu-publish'] = () => {
    const m = modal({
      tag: 'PUBLIER',
      title: 'Publier la carte ?',
      desc: 'La nouvelle version sera synchronisée sur tous les canaux en moins de 10 secondes.',
      width: 520,
      body: `
        <div class="p-card" style="margin:0;">
          <div class="head"><h4 style="font-size:14px;">Modifications en attente</h4><span class="meta">DEPUIS 12:42</span></div>
          <ul style="list-style:none; margin:0; padding:0; font-size:13px;">
            <li style="padding:8px 0; border-top:1px solid var(--n-200);">~ Routage stations mis à jour sur 4 items</li>
            <li style="padding:8px 0; border-top:1px solid var(--n-200);">+ Station "Barbecue" créée · 1 item routé</li>
            <li style="padding:8px 0; border-top:1px solid var(--n-200);">+ Station "Crêpes bar" créée · 1 item routé</li>
            <li style="padding:8px 0; border-top:1px solid var(--n-200);">86 : Tajine agneau pruneaux <span class="chip ref">RUPTURE</span></li>
          </ul>
        </div>
      `,
      foot: `<button class="kb ghost" data-dismiss>Garder en brouillon</button><button data-activation=write class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Carte publiée',{type:'success',desc:'Caisse et QR menu à jour.'}); window.Kiwi.confetti();">Publier maintenant</button>`,
    });
    wireDismiss(m);
  };

  /* ═══════════════════════════════════════════════════════════════════════
   *   handlers['nav-kds']  ·  Écran cuisine avec switcher de stations
   * ═════════════════════════════════════════════════════════════════════════ */
  /* Kitchen-screen UI strings — FR / EN / AR. */
  const KDS_T = {
    fr: { title: 'Écran cuisine', subtitle: 'File de préparation · mise à jour en direct', allStations: 'Toutes', statusNew: 'Nouvelle', statusCooking: 'En préparation', accept: 'Accepter', ready: 'Prête', table: (n) => `Table ${n}`, takeaway: 'À emporter', close: 'Fermer', colNew: 'Nouvelles', colCooking: 'En préparation', history: 'Historique', historyTitle: 'Servies aujourd\'hui', emptyNew: 'Aucune nouvelle commande', emptyCooking: 'Aucune commande en préparation', emptyHistory: 'Aucune commande servie pour l\'instant', served: 'Servie', view: 'Agrandir', readyToast: (n) => `Commande #${n} prête`, notifyServer: 'Serveur prévenu · à servir en salle.', notifyCounter: 'Comptoir prévenu · prêt à remettre.', recipeEyebrow: 'Recette · par portion', recipeYield: (n) => `Rendement · ${n} portion${n > 1 ? 's' : ''}`, recipeIngredients: 'Ingrédients', recipePrep: 'Préparation', recipeFoot: 'Tapez sur un plat pour réafficher sa recette à tout moment.', recipeEmptyT: 'Recette pas encore définie', recipeEmptyB: 'Demandez au chef de la compléter dans Menu › Recettes pour la voir ici.' },
    en: { title: 'Kitchen display', subtitle: 'Prep queue · live updates', allStations: 'All', statusNew: 'New', statusCooking: 'In progress', accept: 'Accept', ready: 'Ready', table: (n) => `Table ${n}`, takeaway: 'Takeaway', close: 'Close', colNew: 'New', colCooking: 'In preparation', history: 'History', historyTitle: 'Served today', emptyNew: 'No new orders', emptyCooking: 'Nothing in preparation', emptyHistory: 'No orders served yet', served: 'Served', view: 'Enlarge', readyToast: (n) => `Order #${n} ready`, notifyServer: 'Server notified · to serve in the dining room.', notifyCounter: 'Counter notified · ready for pickup.', recipeEyebrow: 'Recipe · per portion', recipeYield: (n) => `Yields ${n} portion${n > 1 ? 's' : ''}`, recipeIngredients: 'Ingredients', recipePrep: 'Preparation', recipeFoot: 'Tap any dish on a ticket to view its recipe anytime.', recipeEmptyT: 'Recipe not yet defined', recipeEmptyB: 'Ask the chef to complete it in Menu › Recipes so it shows up here.' },
    ar: { title: 'شاشة المطبخ', subtitle: 'قائمة التحضير · تحديث مباشر', allStations: 'الكل', statusNew: 'جديدة', statusCooking: 'قيد التحضير', accept: 'قبول', ready: 'جاهزة', table: (n) => `طاولة ${n}`, takeaway: 'للأخذ', close: 'إغلاق', colNew: 'جديدة', colCooking: 'قيد التحضير', history: 'السجل', historyTitle: 'قُدّمت اليوم', emptyNew: 'لا توجد طلبات جديدة', emptyCooking: 'لا شيء قيد التحضير', emptyHistory: 'لم تُقدَّم أي طلبات بعد', served: 'قُدّمت', view: 'تكبير', readyToast: (n) => `الطلب #${n} جاهز`, notifyServer: 'تم إشعار النادل · للتقديم في القاعة.', notifyCounter: 'تم إشعار الكاونتر · جاهز للتسليم.', recipeEyebrow: 'الوصفة · لكل حصة', recipeYield: (n) => `الكمية · ${n} حصة`, recipeIngredients: 'المكونات', recipePrep: 'التحضير', recipeFoot: 'اضغط على أي طبق في تذكرة لرؤية وصفته في أي وقت.', recipeEmptyT: 'الوصفة لم تُعرَّف بعد', recipeEmptyB: 'اطلب من الشيف إكمالها في القائمة › الوصفات لتظهر هنا.' },
  };

  /* Kitchen-screen styles — self-contained, kit- prefix, copy-paste safe. */
  if (!document.querySelector('#kiwi-kds-css')) {
    const kdsCss = document.createElement('style');
    kdsCss.id = 'kiwi-kds-css';
    kdsCss.textContent = `
      .kit-screen { display: flex; flex-direction: column; gap: 14px; }
      .kit-topbar { display: flex; gap: 12px; align-items: flex-start; }
      .kit-stationbar { display: flex; gap: 7px; flex-wrap: nowrap; flex: 1; overflow-x: auto; scrollbar-width: none; }
      .kit-stationbar::-webkit-scrollbar { display: none; }
      .kit-station { display: inline-flex; align-items: center; gap: 7px; padding: 10px 12px; flex-shrink: 0; border-radius: 10px; border: 1px solid var(--n-200); background: var(--surface); cursor: pointer; font-family: var(--sans); font-size: 13px; font-weight: 500; color: var(--n-600); letter-spacing: -0.005em; white-space: nowrap; transition: background 130ms ease, border-color 130ms ease, color 130ms ease; }
      .kit-station:hover { border-color: var(--n-400); color: var(--ink); }
      .kit-station.on { background: var(--inverse-surface); border-color: var(--inverse-surface); color: var(--inverse-ink); }
      .kit-station i { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
      .kit-station-ct { font-family: var(--mono); font-size: 11.5px; font-weight: 600; line-height: 1; padding: 2px 6px; border-radius: 999px; background: var(--paper-soft); color: var(--n-600); }
      .kit-station.on .kit-station-ct { background: rgba(255,255,255,0.18); color: var(--paper); }
      .kit-history-toggle { display: inline-flex; align-items: center; gap: 8px; padding: 11px 15px; border-radius: 11px; border: 1px solid var(--n-200); background: var(--surface); cursor: pointer; font-family: var(--sans); font-size: 13.5px; font-weight: 500; color: var(--n-600); white-space: nowrap; flex-shrink: 0; transition: background 130ms ease, border-color 130ms ease, color 130ms ease; }
      .kit-history-toggle:hover { border-color: var(--n-400); color: var(--ink); }
      .kit-history-toggle.on { background: var(--inverse-surface); border-color: var(--inverse-surface); color: var(--inverse-ink); }
      .kit-history-toggle svg { width: 16px; height: 16px; }
      .kit-htg-ct { font-family: var(--mono); font-size: 12px; font-weight: 600; line-height: 1; padding: 3px 7px; border-radius: 999px; background: var(--paper-soft); color: var(--n-600); }
      .kit-history-toggle.on .kit-htg-ct { background: rgba(255,255,255,0.18); color: var(--paper); }
      .kit-cols { display: flex; gap: 14px; align-items: flex-start; }
      .kit-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 0; margin: 0; }
      .kit-col-new { width: 300px; flex-shrink: 0; }
      .kit-col-cooking { flex: 1; min-width: 0; }
      .kit-col-head { display: flex; align-items: center; gap: 7px; font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--n-500); padding: 1px 3px; }
      .kit-col-ct { font-weight: 700; color: var(--ink); }
      .kit-col-stack { display: flex; flex-direction: column; gap: 12px; }
      .kit-grid3 { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; align-items: start; }
      @media (max-width: 1100px) { .kit-grid3 { grid-template-columns: repeat(2, minmax(0,1fr)); } }
      .kit-order { display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--n-200); border-radius: 14px; overflow: hidden; }
      .kit-order.is-new { border: 2px solid var(--atlas); box-shadow: 0 0 0 4px rgba(11,110,79,0.10); }
      .kit-order.is-late { border-color: var(--danger); }
      .kit-order.is-late.is-new { box-shadow: 0 0 0 4px rgba(193,58,46,0.12); }
      .kit-order-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 15px 0; }
      .kit-order-tr { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
      .kit-order-num { font-size: 27px; font-weight: 700; letter-spacing: -0.03em; color: var(--ink); line-height: 1; }
      .kit-timer { display: inline-flex; align-items: center; gap: 5px; font-family: var(--mono); font-size: 15px; font-weight: 600; padding: 5px 9px; border-radius: 8px; line-height: 1; font-feature-settings: "tnum" 1; flex-shrink: 0; }
      .kit-timer svg { width: 13px; height: 13px; }
      .kit-timer.ok { color: var(--atlas); background: rgba(11,110,79,0.10); }
      .kit-timer.warn { color: var(--warn-ink); background: rgba(217,154,43,0.16); }
      .kit-timer.over { color: var(--danger); background: rgba(193,58,46,0.12); }
      .kit-eye { width: 38px; height: 38px; flex-shrink: 0; padding: 0; border: 1px solid var(--n-200); background: var(--paper-soft); border-radius: 9px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--n-500); transition: background 120ms ease, color 120ms ease, border-color 120ms ease; }
      .kit-eye:hover { color: var(--ink); border-color: var(--n-400); }
      .kit-eye:active { background: var(--n-200); }
      .kit-eye svg { width: 19px; height: 19px; }
      .kit-order-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 15px 13px; }
      .kit-type { display: inline-flex; align-items: center; font-size: 12.5px; font-weight: 600; padding: 5px 10px; border-radius: 8px; letter-spacing: -0.005em; }
      .kit-type.dineIn { background: rgba(11,110,79,0.10); color: var(--atlas); }
      .kit-type.glovo { background: rgba(242,145,55,0.20); color: #99540F; }
      .kit-type.yassir { background: rgba(43,90,168,0.16); color: #2B5AA8; }
      .kit-type.takeaway { background: var(--paper-soft); color: var(--n-600); }
      .kit-status { font-family: var(--mono); font-size: 11px; letter-spacing: 0.07em; text-transform: uppercase; color: var(--n-500); }
      .kit-order.is-new .kit-status { color: var(--atlas); font-weight: 600; }
      .kit-items { list-style: none; margin: 0; padding: 13px 15px 15px; border-top: 1px solid var(--n-200); display: flex; flex-direction: column; gap: 10px; flex: 1; }
      .kit-item { display: flex; align-items: flex-start; gap: 11px; }
      .kit-q { flex-shrink: 0; min-width: 28px; height: 25px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; font-family: var(--mono); font-size: 14px; font-weight: 700; color: var(--ink); background: var(--paper-soft); border-radius: 7px; }
      .kit-nm { font-size: 15.5px; font-weight: 500; line-height: 1.35; color: var(--ink); padding-top: 2px; }
      .kit-item-off { opacity: 0.32; }
      .kit-act { width: 100%; border: 0; margin: 0; padding: 15px; cursor: pointer; font-family: var(--sans); font-size: 15.5px; font-weight: 600; letter-spacing: -0.01em; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background 130ms ease, filter 120ms ease; }
      .kit-act svg { width: 17px; height: 17px; }
      .kit-act-accept { background: var(--inverse-surface); color: var(--inverse-ink); }
      .kit-act-accept:hover { background: #1c2723; }
      .kit-act-ready { background: var(--atlas); color: var(--paper); }
      .kit-act-ready:hover { background: var(--atlas-700); }
      .kit-act:active { filter: brightness(0.93); }
      .kit-empty { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; padding: 40px 20px; text-align: center; background: var(--paper-soft); border: 1px dashed var(--n-300); border-radius: 13px; }
      .kit-empty svg { width: 26px; height: 26px; color: var(--n-500); }
      .kit-empty span { font-size: 12.5px; color: var(--n-500); }
      .kit-history { position: fixed; top: 0; right: 0; bottom: 0; width: 340px; max-width: 86vw; z-index: 40; background: var(--paper); border-left: 1px solid var(--n-200); box-shadow: -24px 0 55px -30px rgba(10,15,13,0.5); transform: translateX(100%); transition: transform 300ms cubic-bezier(0.4,0,0.2,1); overflow-y: auto; padding: 18px; }
      .kit-history.open { transform: translateX(0); }
      .kit-history-inner { display: flex; flex-direction: column; gap: 10px; }
      .kit-history-head .kit-history-x { margin-inline-start: auto; width: 26px; height: 26px; padding: 0; flex-shrink: 0; border: 1px solid var(--n-200); background: var(--surface); border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--n-500); }
      .kit-history-head .kit-history-x:hover { color: var(--ink); border-color: var(--n-400); }
      .kit-history-head .kit-history-x svg { width: 13px; height: 13px; }
      .kit-history-rows { display: flex; flex-direction: column; gap: 8px; }
      .kit-hrow { display: flex; align-items: center; gap: 9px; width: 100%; text-align: start; font-family: inherit; appearance: none; -webkit-appearance: none; background: var(--surface); border: 1px solid var(--n-200); border-radius: 11px; padding: 11px 13px; cursor: pointer; transition: border-color 130ms ease, background 130ms ease; }
      .kit-hrow:hover { border-color: var(--n-400); background: var(--paper-soft); }
      .kit-hrow-num { font-size: 16px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; flex-shrink: 0; }
      .kit-hrow-time { margin-inline-start: auto; display: inline-flex; align-items: center; gap: 4px; font-family: var(--mono); font-size: 11px; color: var(--atlas); flex-shrink: 0; }
      .kit-hrow-time svg { width: 13px; height: 13px; }
      .kit-hrow-eye { width: 16px; height: 16px; color: var(--n-500); flex-shrink: 0; }
      .kit-served-at { display: inline-flex; align-items: center; gap: 5px; font-family: var(--mono); font-size: 15px; font-weight: 600; padding: 5px 9px; border-radius: 8px; line-height: 1; color: var(--atlas); background: rgba(11,110,79,0.10); flex-shrink: 0; }
      .kit-served-at svg { width: 13px; height: 13px; }
      .kit-zoom-backdrop { position: fixed; inset: 0; z-index: 9995; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(10,15,13,0.46); -webkit-backdrop-filter: blur(7px); backdrop-filter: blur(7px); opacity: 0; transition: opacity 220ms ease; }
      .kit-zoom-backdrop.in { opacity: 1; }
      .kit-zoom { width: 420px; max-width: 100%; background: var(--surface); border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 32px 70px -20px rgba(10,15,13,0.6); transform: scale(0.86); transition: transform 280ms cubic-bezier(0.34, 1.45, 0.5, 1); }
      .kit-zoom-backdrop.in .kit-zoom { transform: scale(1); }
      .kit-zoom .kit-order-top { padding: 22px 22px 0; }
      .kit-zoom .kit-order-num { font-size: 38px; }
      .kit-zoom .kit-timer { font-size: 17px; padding: 7px 12px; }
      .kit-zoom .kit-timer svg { width: 15px; height: 15px; }
      .kit-zoom .kit-served-at { font-size: 17px; padding: 7px 12px; }
      .kit-zoom .kit-served-at svg { width: 15px; height: 15px; }
      .kit-zoom .kit-order-meta { padding: 13px 22px 17px; }
      .kit-zoom .kit-type { font-size: 13.5px; padding: 6px 12px; }
      .kit-zoom .kit-items { padding: 18px 22px 22px; gap: 14px; }
      .kit-zoom .kit-q { min-width: 33px; height: 30px; font-size: 16px; }
      .kit-zoom .kit-nm { font-size: 18px; }
      .kit-zoom .kit-act { padding: 18px; font-size: 17px; }

      /* ── Recipe popup · cuisinier taps a dish on a ticket → ingredients + prep ─ */
      .kit-item.has-recipe { cursor: pointer; transition: background 120ms; border-radius: 6px; padding: 2px 4px; margin: -2px -4px; }
      .kit-item.has-recipe:hover { background: var(--paper-soft); }
      .kit-recipe-ico { width: 14px; height: 14px; flex-shrink: 0; color: var(--n-500); margin-left: auto; opacity: 0; transition: opacity 140ms, color 140ms; align-self: center; }
      .kit-item.has-recipe:hover .kit-recipe-ico { opacity: 1; color: var(--atlas); }
      /* Fire-schedule badge on each ticket item · shows when a sync-enabled
         station is being delayed so the plate finishes with the slowest one,
         or signals "served first" for stations with sync OFF (drinks etc.). */
      .kit-fire { display: inline-block; margin-left: 8px; padding: 1px 7px; border-radius: 99px; font-size: 11px; font-weight: 700; font-family: var(--mono); letter-spacing: 0.02em; vertical-align: middle; }
      .kit-fire-wait { background: rgba(217,154,43,0.18); color: var(--warning); }
      .kit-fire-now  { background: rgba(11,110,79,0.14); color: var(--atlas); }
      .kit-fire-fast { background: rgba(54,119,166,0.16); color: #3677A6; }
      .kit-zoom .kit-fire { font-size: 11px; padding: 2px 9px; }
      .kit-zoom .kit-recipe-ico { width: 16px; height: 16px; opacity: 0.5; }
      .kit-zoom .kit-item.has-recipe:hover .kit-recipe-ico { opacity: 1; }
      .kit-recipe-backdrop { position: fixed; inset: 0; z-index: 9996; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(10,15,13,0.5); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); opacity: 0; transition: opacity 200ms ease; }
      .kit-recipe-backdrop.in { opacity: 1; }
      .kit-recipe { width: 480px; max-width: 100%; max-height: calc(100vh - 48px); background: var(--surface); border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 32px 70px -20px rgba(10,15,13,0.6); transform: scale(0.86); transition: transform 260ms cubic-bezier(0.34, 1.45, 0.5, 1); font-family: var(--sans, system-ui); color: var(--ink); }
      .kit-recipe-backdrop.in .kit-recipe { transform: scale(1); }
      html[data-theme="dark"] .kit-recipe { background: var(--paper-soft); }
      .kit-recipe-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 20px 22px 16px; border-bottom: 1px solid var(--n-200); }
      .kit-recipe-eyebrow { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--atlas); font-family: var(--mono); font-weight: 700; margin-bottom: 5px; }
      .kit-recipe-title { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.025em; color: var(--ink); line-height: 1.2; }
      .kit-recipe-close { width: 34px; height: 34px; flex-shrink: 0; padding: 0; border: 1px solid var(--n-200); background: var(--paper); border-radius: 10px; cursor: pointer; color: var(--n-500); display: flex; align-items: center; justify-content: center; transition: color 120ms, border-color 120ms; }
      .kit-recipe-close:hover { color: var(--ink); border-color: var(--n-400); }
      .kit-recipe-close svg { width: 16px; height: 16px; }
      .kit-recipe-body { padding: 16px 22px 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
      .kit-recipe-meta { display: flex; flex-wrap: wrap; gap: 8px; }
      .kit-recipe-yield { font-size: 11.5px; font-weight: 600; padding: 4px 10px; background: rgba(11,110,79,0.10); color: var(--atlas); border-radius: 99px; }
      .kit-recipe-cat { font-size: 11px; font-family: var(--mono); letter-spacing: 0.06em; text-transform: uppercase; padding: 4px 9px; background: var(--paper-soft); color: var(--n-500); border-radius: 99px; }
      .kit-recipe-section-t { font-size: 11px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--n-500); font-family: var(--mono); font-weight: 700; margin-bottom: 10px; }
      .kit-recipe-ings { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
      .kit-recipe-ing { display: flex; align-items: baseline; gap: 14px; font-size: 14.5px; line-height: 1.4; padding-bottom: 9px; border-bottom: 1px dashed var(--n-200); }
      .kit-recipe-ing:last-child { border-bottom: 0; padding-bottom: 0; }
      .kit-recipe-ing-q { font-family: var(--mono); font-feature-settings: "tnum" 1; font-weight: 700; color: var(--atlas); min-width: 84px; font-size: 14px; }
      .kit-recipe-ing-n { color: var(--ink); font-weight: 500; }
      .kit-recipe-prep { font-size: 14px; line-height: 1.55; color: var(--n-700); padding: 12px 14px; background: var(--paper); border-radius: 10px; border-left: 3px solid var(--atlas); }
      html[data-theme="dark"] .kit-recipe-prep { background: var(--paper-muted); }
      .kit-recipe-foot { font-size: 11px; color: var(--n-500); padding-top: 8px; border-top: 1px solid var(--n-100); margin-top: 4px; }
      .kit-recipe-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 28px 12px; text-align: center; color: var(--n-500); }
      .kit-recipe-empty svg { width: 36px; height: 36px; opacity: 0.5; }
      .kit-recipe-empty-t { font-size: 15px; font-weight: 600; color: var(--ink); }
      .kit-recipe-empty-b { font-size: 13px; line-height: 1.5; max-width: 280px; }
      html[data-theme="dark"] .kit-station, html[data-theme="dark"] .kit-history-toggle, html[data-theme="dark"] .kit-order, html[data-theme="dark"] .kit-hrow, html[data-theme="dark"] .kit-zoom, html[data-theme="dark"] .kit-history-head .kit-history-x { background: var(--paper-soft); }
      html[data-theme="dark"] .kit-station.on, html[data-theme="dark"] .kit-history-toggle.on { background: var(--inverse-surface); border-color: var(--inverse-line); color: var(--inverse-ink); }
      html[data-theme="dark"] .kit-station.on .kit-station-ct, html[data-theme="dark"] .kit-history-toggle.on .kit-htg-ct { background: var(--paper-muted); color: var(--ink); }
      html[data-theme="dark"] .kit-station-ct, html[data-theme="dark"] .kit-htg-ct, html[data-theme="dark"] .kit-q, html[data-theme="dark"] .kit-eye, html[data-theme="dark"] .kit-zoom .kit-q { background: var(--paper-muted); }
      html[data-theme="dark"] .kit-act-accept { background: var(--paper-muted); color: var(--ink); }
      html[data-theme="dark"] .kit-act-accept:hover { background: var(--n-200); }
      html[data-theme="dark"] .kit-empty { background: var(--paper-soft); }
    `;
    document.head.appendChild(kdsCss);
  }

  handlers['nav-kds'] = () => {
    const lang = (window.KiwiI18n && KiwiI18n.getLang && KiwiI18n.getLang()) || 'fr';
    const T = KDS_T[lang] || KDS_T.fr;

    /* Fresh order queue each open — a demo always shows a busy kitchen.
     * status: new (not accepted) · cooking (in prep) · ready (served, history). */
    const orders = [
      { num: 38, type: 'dineIn', table: '3', status: 'ready', elapsed: 1880, readyAt: '13:46', items: [
        { q: 2, n: 'Couscous royal',         stations: ['cuisson'] },
        { q: 2, n: 'Thé à la menthe',        stations: ['boissons'] } ] },
      { num: 39, type: 'glovo', code: '2904', status: 'ready', elapsed: 1645, readyAt: '13:58', items: [
        { q: 1, n: 'Tajine poulet citron',   stations: ['cuisson'] },
        { q: 1, n: 'Salade marocaine',       stations: ['salade'] } ] },
      { num: 40, type: 'dineIn', table: '8', status: 'ready', elapsed: 1390, readyAt: '14:10', items: [
        { q: 3, n: 'Briouates viande',       stations: ['cuisson'] },
        { q: 2, n: 'Msemen beurre & miel',   stations: ['pastry'] } ] },
      { num: 41, type: 'takeaway', status: 'ready', elapsed: 1155, readyAt: '14:22', items: [
        { q: 2, n: 'Méchoui',                stations: ['bbq'] },
        { q: 2, n: 'Orange pressée',         stations: ['boissons'] } ] },
      { num: 42, type: 'dineIn', table: '4', status: 'cooking', elapsed: 1010, items: [
        { q: 2, n: 'Tajine kefta œuf',       stations: ['cuisson'] },
        { q: 1, n: 'Salade marocaine',       stations: ['salade'] },
        { q: 3, n: 'Thé à la menthe',        stations: ['boissons'] } ] },
      { num: 43, type: 'glovo', code: '3412', status: 'cooking', elapsed: 742, items: [
        { q: 2, n: 'Tajine poulet citron',   stations: ['cuisson'] },
        { q: 1, n: 'Cornes de gazelle',      stations: ['pastry'] } ] },
      { num: 44, type: 'dineIn', table: '7', status: 'cooking', elapsed: 620, items: [
        { q: 1, n: 'Couscous royal',         stations: ['cuisson'] },
        { q: 1, n: 'Pastilla poulet',        stations: ['cuisson', 'pastry'] } ] },
      { num: 45, type: 'yassir', code: '8821', status: 'cooking', elapsed: 388, items: [
        { q: 3, n: 'Tajine kefta œuf',       stations: ['cuisson'] },
        { q: 2, n: 'Cocktail mocktail',      stations: ['bar'] } ] },
      { num: 46, type: 'dineIn', table: '2', status: 'cooking', elapsed: 256, items: [
        { q: 2, n: 'Crêpe complète',         stations: ['crepes'] },
        { q: 4, n: 'Café noir double',       stations: ['boissons'] } ] },
      { num: 47, type: 'dineIn', table: '9', status: 'new', elapsed: 184, items: [
        { q: 4, n: 'Briouates viande',       stations: ['cuisson'] },
        { q: 2, n: "Caviar d'aubergine",     stations: ['salade'] } ] },
      { num: 48, type: 'glovo', code: '3590', status: 'new', elapsed: 92, items: [
        { q: 1, n: 'Méchoui',                stations: ['bbq'] },
        { q: 1, n: 'Limonade traditionnelle', stations: ['boissons'] } ] },
      { num: 49, type: 'dineIn', table: '1', status: 'new', elapsed: 38, items: [
        { q: 1, n: 'Tajine agneau pruneaux', stations: ['cuisson'] } ] },
    ];

    const t0 = Date.now();
    let activeStation = 'all';
    let historyOpen = false;

    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    /* Recipe lookup helpers — hoisted up here so orderInner (which calls
     * kdsHasRecipe at render time) finds them in scope. */
    const findRecipe = (dishName) => {
      const eng = window.KiwiRecipes;
      if (!eng) return null;
      const venues = (window.KiwiVenue && window.KiwiVenue.REAL_VENUES) || ['cafeAtlas', 'maisonMansour', 'spaBahia'];
      for (const v of venues) {
        const list = eng.listRecipes(v);
        const hit = list.find((r) => r.menuItem.name === dishName);
        if (hit) return hit;
      }
      return null;
    };
    const kdsHasRecipe = (dishName) => {
      const hit = findRecipe(dishName);
      return !!(hit && hit.recipe && hit.recipe.status === 'complete' && (hit.recipe.ingredients || []).length);
    };
    const liveElapsed = (o) => o.elapsed + Math.floor((Date.now() - t0) / 1000);
    const urgency = (s) => (s < 480 ? 'ok' : s < 900 ? 'warn' : 'over');
    const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    const matchesStation = (o, sid) => sid === 'all' || o.items.some((i) => i.stations.includes(sid));
    const byOldest = (a, b) => liveElapsed(b) - liveElapsed(a);
    const groupOrders = (status) => orders.filter((o) => o.status === status && matchesStation(o, activeStation)).slice().sort(byOldest);

    const typeChip = (o) => {
      if (o.type === 'glovo')    return `<span class="kit-type glovo">Glovo · ${esc(o.code)}</span>`;
      if (o.type === 'yassir')   return `<span class="kit-type yassir">Yassir · ${esc(o.code)}</span>`;
      if (o.type === 'takeaway') return `<span class="kit-type takeaway">${T.takeaway}</span>`;
      return `<span class="kit-type dineIn">${T.table(esc(o.table))}</span>`;
    };

    /* ─── Per-ticket fire scheduler ──────────────────────────────────────
     *  For each ticket, compute when each item should be FIRED so plates
     *  finish together. Reads station prep + sync flag from
     *  KiwiVenue.getStationState (configured in Menu › Stations cuisine).
     *
     *  Algorithm:
     *    1. For each item, look up its station's avgPrepMin + sync.
     *    2. targetReady = max prepMin across items where sync === true.
     *    3. For each item:
     *         · sync === false  →  fireDelay = 0 (start immediately)
     *         · sync === true   →  fireDelay = targetReady − thisPrep
     *
     *  Returns an array of { fireDelay, prep, sync, station } for each
     *  item in the same order as o.items.
     * ────────────────────────────────────────────────────────────────── */
    const scheduleTicket = (o) => {
      const lookup = (sid) => {
        try { return window.KiwiVenue?.getStationState?.(sid) || { avgPrepMin: 10, sync: true }; }
        catch (_) { return { avgPrepMin: 10, sync: true }; }
      };
      const perItem = o.items.map((i) => {
        const sid = i.stations && i.stations[0];
        const st = lookup(sid);
        return { prep: st.avgPrepMin, sync: st.sync, station: sid };
      });
      const syncPreps = perItem.filter((s) => s.sync).map((s) => s.prep);
      const targetReady = syncPreps.length ? Math.max(...syncPreps) : 0;
      return perItem.map((s) => ({
        ...s,
        fireDelay: s.sync ? Math.max(0, targetReady - s.prep) : 0,
      }));
    };

    /* Inner content of an order — shared by the board card and the zoom panel. */
    const orderInner = (o, withEye) => {
      const el = liveElapsed(o);
      const u = urgency(el);
      const isNew = o.status === 'new';
      const isReady = o.status === 'ready';
      const schedule = scheduleTicket(o);
      const items = o.items.map((i, idx) => {
        const off = activeStation !== 'all' && !i.stations.includes(activeStation);
        const hasRecipe = kdsHasRecipe(i.n);
        const sched = schedule[idx];
        /* Fire badge — visible on every non-ready ticket so the demo
         * surfaces the scheduler clearly.
         *   sync OFF                    → "→ servi en premier" (drinks-first)
         *   sync ON  + fireDelay > 0    → "⏱ démarrer dans X min" (delayed)
         *   sync ON  + fireDelay > 0 + elapsed past it → "⏱ en cours"
         *   sync ON  + fireDelay = 0    → no badge (slowest, fires now) */
        let fireBadge = '';
        if (!isReady && sched) {
          if (!sched.sync) {
            fireBadge = `<span class="kit-fire kit-fire-fast">→ servi en premier</span>`;
          } else if (sched.fireDelay > 0) {
            const elapsedMin = Math.floor(el / 60);
            const startsIn = Math.max(0, sched.fireDelay - elapsedMin);
            fireBadge = startsIn > 0
              ? `<span class="kit-fire kit-fire-wait">⏱ démarrer dans ${startsIn} min</span>`
              : `<span class="kit-fire kit-fire-now">⏱ en cours</span>`;
          }
        }
        return `<li class="kit-item${off ? ' kit-item-off' : ''}${hasRecipe ? ' has-recipe' : ''}"${hasRecipe ? ` data-kit-recipe="${esc(i.n)}"` : ''}><span class="kit-q">${i.q}</span><span class="kit-nm">${esc(i.n)}${fireBadge}</span>${hasRecipe ? `<i class="kit-recipe-ico" data-lucide="book-open" aria-hidden="true"></i>` : ''}</li>`;
      }).join('');
      const act = isReady
        ? ''
        : isNew
          ? `<button class="kit-act kit-act-accept" data-kit-accept="${o.num}">${T.accept}</button>`
          : `<button class="kit-act kit-act-ready" data-kit-ready="${o.num}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg>${T.ready}</button>`;
      const eye = withEye
        ? `<button class="kit-eye" data-kit-eye="${o.num}" aria-label="${esc(T.view)} #${o.num}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg></button>`
        : '';
      const topRight = isReady
        ? `<span class="kit-served-at"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg>${esc(o.readyAt || '')}</span>`
        : `<span class="kit-timer ${u}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span class="kit-timer-v">${fmtTime(el)}</span></span>`;
      return `
        <div class="kit-order-top">
          <span class="kit-order-num">#${o.num}</span>
          <div class="kit-order-tr">
            ${topRight}
            ${eye}
          </div>
        </div>
        <div class="kit-order-meta">
          ${typeChip(o)}
          <span class="kit-status">${isReady ? T.served : isNew ? T.statusNew : T.statusCooking}</span>
        </div>
        <ul class="kit-items">${items}</ul>
        ${act}`;
    };

    const orderCard = (o) => {
      const u = urgency(liveElapsed(o));
      return `<div class="kit-order ${o.status === 'new' ? 'is-new' : 'is-cooking'}${u === 'over' ? ' is-late' : ''}" data-kit-num="${o.num}" data-base="${o.elapsed}">${orderInner(o, true)}</div>`;
    };

    const historyRow = (o) => `
      <button class="kit-hrow" data-kit-eye="${o.num}" aria-label="${esc(T.view)} #${o.num}">
        <span class="kit-hrow-num">#${o.num}</span>
        ${typeChip(o)}
        <span class="kit-hrow-time"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M5 12l5 5L20 7"/></svg>${T.served} ${esc(o.readyAt || '')}</span>
        <svg class="kit-hrow-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
      </button>`;

    const emptyHtml = (msg) => `<div class="kit-empty"><i data-lucide="check-circle-2" aria-hidden="true"></i><span>${esc(msg)}</span></div>`;

    const stationBar = () => {
      const btn = (id, dot, label) => {
        const count = orders.filter((o) => o.status !== 'ready' && matchesStation(o, id)).length;
        return `<button data-activation=write class="kit-station ${activeStation === id ? 'on' : ''}" data-kit-st="${id}"><i style="background:${dot};"></i><span>${esc(label)}</span><span class="kit-station-ct">${count}</span></button>`;
      };
      return btn('all', 'var(--ink)', T.allStations) + STATIONS.map((s) => btn(s.id, s.raw, s.name)).join('');
    };

    const historyToggleHtml = () => `<i data-lucide="history" aria-hidden="true"></i><span>${esc(T.history)}</span><span class="kit-htg-ct">${groupOrders('ready').length}</span>`;

    const colHeadHtml = (label, count) => `<div class="kit-col-head"><span>${esc(label)}</span><span class="kit-col-ct">${count}</span></div>`;

    const colNewHtml = () => {
      const list = groupOrders('new');
      return colHeadHtml(T.colNew, list.length)
        + `<div class="kit-col-stack">${list.length ? list.map(orderCard).join('') : emptyHtml(T.emptyNew)}</div>`;
    };
    const colCookHtml = () => {
      const list = groupOrders('cooking');
      return colHeadHtml(T.colCooking, list.length)
        + `<div class="kit-grid3">${list.length ? list.map(orderCard).join('') : emptyHtml(T.emptyCooking)}</div>`;
    };
    const historyHtml = () => {
      const list = groupOrders('ready');
      return `<div class="kit-col-head kit-history-head"><span>${esc(T.historyTitle)}</span><span class="kit-col-ct">${list.length}</span><button class="kit-history-x" data-kit-history-toggle aria-label="${esc(T.close)}"><i data-lucide="x" aria-hidden="true"></i></button></div>`
        + `<div class="kit-history-rows">${list.length ? list.map(historyRow).join('') : emptyHtml(T.emptyHistory)}</div>`;
    };

    const r = fullpage({
      title: T.title,
      subtitle: T.subtitle,
      body: `
        <div class="kit-screen">
          <div class="kit-topbar">
            <div class="kit-stationbar" data-kit-bar></div>
            <button class="kit-history-toggle" data-kit-history-toggle></button>
          </div>
          <div class="kit-cols">
            <section class="kit-col kit-col-new" data-kit-new></section>
            <section class="kit-col kit-col-cooking" data-kit-cook></section>
            <aside class="kit-history" data-kit-history>
              <div class="kit-history-inner" data-kit-history-inner></div>
            </aside>
          </div>
        </div>`,
      foot: `<button class="kb ghost" data-dismiss>${T.close}</button>`,
    });
    wireDismiss(r);

    const barEl = r.el.querySelector('[data-kit-bar]');
    const toggleEl = r.el.querySelector('[data-kit-history-toggle]');
    const newEl = r.el.querySelector('[data-kit-new]');
    const cookEl = r.el.querySelector('[data-kit-cook]');
    const histEl = r.el.querySelector('[data-kit-history]');
    const histInnerEl = r.el.querySelector('[data-kit-history-inner]');

    const paint = () => {
      barEl.innerHTML = stationBar();
      toggleEl.innerHTML = historyToggleHtml();
      newEl.innerHTML = colNewHtml();
      cookEl.innerHTML = colCookHtml();
      histInnerEl.innerHTML = historyHtml();
    };
    paint();

    /* — accept (new -> cooking) / ready (cooking -> served, notify) — */
    const acceptOrder = (num) => {
      const o = orders.find((x) => x.num === num);
      if (o && o.status === 'new') { o.status = 'cooking'; paint(); }
    };
    const readyOrder = (num) => {
      const o = orders.find((x) => x.num === num);
      if (!o || o.status === 'ready') return;
      o.status = 'ready';
      o.readyAt = nowHM();
      paint();
      const delivery = o.type === 'glovo' || o.type === 'yassir' || o.type === 'takeaway';
      // force:true — the ready notification must show even though the KDS is an overlay.
      toast(T.readyToast(num), { type: 'success', duration: 2600, force: true, desc: delivery ? T.notifyCounter : T.notifyServer });
    };

    /* — zoom · one order centered, screen behind blurred, tap-out to close — */
    const openZoom = (o) => {
      document.querySelectorAll('.kit-zoom-backdrop').forEach((b) => b.remove());
      const bd = document.createElement('div');
      bd.className = 'kit-zoom-backdrop';
      bd.innerHTML = `<div class="kit-zoom" data-base="${o.elapsed}">${orderInner(o, false)}</div>`;
      document.body.appendChild(bd);
      requestAnimationFrame(() => bd.classList.add('in'));
      let closing = false;
      const closeZoom = () => {
        if (closing) return;
        closing = true;
        bd.classList.remove('in');
        setTimeout(() => bd.remove(), 300);
      };
      bd.addEventListener('click', (e) => {
        const acc = e.target.closest('[data-kit-accept]');
        if (acc) { acceptOrder(Number(acc.getAttribute('data-kit-accept'))); closeZoom(); return; }
        const rdy = e.target.closest('[data-kit-ready]');
        if (rdy) { readyOrder(Number(rdy.getAttribute('data-kit-ready'))); closeZoom(); return; }
        const recipe = e.target.closest('[data-kit-recipe]');
        if (recipe) { openRecipe(recipe.getAttribute('data-kit-recipe')); return; }
        if (!e.target.closest('.kit-zoom')) closeZoom();
      });
    };

    /* — recipe popup · ingredients + prep notes for a single dish.
     *   Resolves the dish name against KiwiRecipes across all real venues
     *   (cafeAtlas/maisonMansour/spaBahia) via findRecipe/kdsHasRecipe
     *   defined earlier. Falls back to a friendly "no recipe yet" card
     *   when the dish has none. Used to train new cuisiniers — they tap
     *   the dish on a ticket, see the recipe. — */
    const openRecipe = (dishName) => {
      document.querySelectorAll('.kit-recipe-backdrop').forEach((b) => b.remove());
      const hit = findRecipe(dishName);
      const recipe = hit && hit.recipe;
      const eng = window.KiwiRecipes;
      const bd = document.createElement('div');
      bd.className = 'kit-recipe-backdrop';
      let body;
      if (!recipe || recipe.status !== 'complete' || !(recipe.ingredients || []).length) {
        body = `
          <div class="kit-recipe-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <div class="kit-recipe-empty-t">${T.recipeEmptyT}</div>
            <div class="kit-recipe-empty-b">${T.recipeEmptyB}</div>
          </div>`;
      } else {
        const yld = recipe.yield || 1;
        const ingRows = (recipe.ingredients || []).map((ing) => {
          const ref = eng.resolveIngredient(ing.invId);
          const name = (ref && ref.name) || ing.name || '·';
          const unit = ing.unit || (ref && ref.unit) || '';
          const qty  = Number(ing.qty || 0);
          const qDisp = qty < 0.01 ? qty.toFixed(4) : qty < 1 ? qty.toFixed(3) : qty.toString();
          return `<li class="kit-recipe-ing"><span class="kit-recipe-ing-q">${esc(qDisp)} ${esc(unit)}</span><span class="kit-recipe-ing-n">${esc(name)}</span></li>`;
        }).join('');
        const prep = (recipe.notes || '').trim();
        body = `
          <div class="kit-recipe-meta">
            <span class="kit-recipe-yield">${T.recipeYield(yld)}</span>
            ${hit && hit.menuItem.category ? `<span class="kit-recipe-cat">${esc(hit.menuItem.category)}</span>` : ''}
          </div>
          <div class="kit-recipe-section">
            <div class="kit-recipe-section-t">${T.recipeIngredients}</div>
            <ul class="kit-recipe-ings">${ingRows}</ul>
          </div>
          ${prep ? `
            <div class="kit-recipe-section">
              <div class="kit-recipe-section-t">${T.recipePrep}</div>
              <div class="kit-recipe-prep">${esc(prep)}</div>
            </div>
          ` : ''}
          <div class="kit-recipe-foot">${T.recipeFoot}</div>`;
      }
      bd.innerHTML = `
        <div class="kit-recipe" role="dialog" aria-labelledby="kit-recipe-title">
          <div class="kit-recipe-head">
            <div>
              <div class="kit-recipe-eyebrow">${T.recipeEyebrow}</div>
              <h3 id="kit-recipe-title" class="kit-recipe-title">${esc(dishName)}</h3>
            </div>
            <button class="kit-recipe-close" data-kit-recipe-close aria-label="${esc(T.close)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          </div>
          <div class="kit-recipe-body">${body}</div>
        </div>`;
      document.body.appendChild(bd);
      requestAnimationFrame(() => bd.classList.add('in'));
      let closing = false;
      const closeRecipe = () => {
        if (closing) return;
        closing = true;
        bd.classList.remove('in');
        setTimeout(() => bd.remove(), 260);
      };
      bd.addEventListener('click', (e) => {
        if (e.target.closest('[data-kit-recipe-close]') || !e.target.closest('.kit-recipe')) closeRecipe();
      });
    };

    /* Live timers — interval clears itself once the screen is closed. */
    const tick = setInterval(() => {
      if (!document.body.contains(r.el)) {
        clearInterval(tick);
        document.querySelectorAll('.kit-zoom-backdrop').forEach((b) => b.remove());
        return;
      }
      document.querySelectorAll('.kit-order, .kit-zoom').forEach((card) => {
        const base = Number(card.getAttribute('data-base')) || 0;
        const el = base + Math.floor((Date.now() - t0) / 1000);
        const u = urgency(el);
        const v = card.querySelector('.kit-timer-v');
        const tEl = card.querySelector('.kit-timer');
        if (v) v.textContent = fmtTime(el);
        if (tEl) tEl.className = `kit-timer ${u}`;
        if (card.classList.contains('kit-order')) card.classList.toggle('is-late', u === 'over');
      });
    }, 1000);

    /* All interactions are local — the kitchen screen is fully self-contained. */
    r.el.addEventListener('click', (e) => {
      const st = e.target.closest('[data-kit-st]');
      if (st) { activeStation = st.getAttribute('data-kit-st'); paint(); return; }

      const ht = e.target.closest('[data-kit-history-toggle]');
      if (ht) {
        historyOpen = !historyOpen;
        histEl.classList.toggle('open', historyOpen);
        toggleEl.classList.toggle('on', historyOpen);
        return;
      }

      const eye = e.target.closest('[data-kit-eye]');
      if (eye) {
        const o = orders.find((x) => x.num === Number(eye.getAttribute('data-kit-eye')));
        if (o) openZoom(o);
        return;
      }

      const recipe = e.target.closest('[data-kit-recipe]');
      if (recipe) { openRecipe(recipe.getAttribute('data-kit-recipe')); return; }

      const acc = e.target.closest('[data-kit-accept]');
      if (acc) { acceptOrder(Number(acc.getAttribute('data-kit-accept'))); return; }

      const rdy = e.target.closest('[data-kit-ready]');
      if (rdy) { readyOrder(Number(rdy.getAttribute('data-kit-ready'))); return; }
    });
  };

  /* ═══════════════════════════════════════════════════════════════════════
   *   KDS auxiliary handlers
   * ═════════════════════════════════════════════════════════════════════════ */
  handlers['kds-bump'] = (el) => {
    const id = el?.dataset.id || 'ticket';
    const tk = el?.closest('.kds-tk');
    const m = modal({
      tag: 'CUISINE',
      title: `Bump ticket ${id} ?`,
      desc: 'Le ticket disparaît de l\'écran cuisine. La salle reçoit la notification « plat prêt ».',
      width: 460,
      body: `<div style="display:flex; gap:12px; padding:12px 14px; background:var(--paper-soft); border-radius:10px; font-size:13px; color:var(--n-600); line-height:1.5;">
        <span style="color:var(--atlas);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L20 7"/></svg></span>
        <div>Sofia (salle) sera notifiée pour récupérer les plats au pass. Action irréversible, utilisez « Rappeler » si besoin.</div>
      </div>`,
      foot: `<button class="kb ghost" data-dismiss>Annuler</button><button class="kb atlas" data-confirm-bump>Bump ${id}</button>`,
    });
    wireDismiss(m);
    setTimeout(() => {
      m.el.querySelector('[data-confirm-bump]').addEventListener('click', () => {
        m.close();
        if (tk) { tk.style.transition = 'all 280ms'; tk.style.opacity = '0'; tk.style.transform = 'translateX(20px)'; setTimeout(() => tk.remove(), 280); }
        toast(`Ticket ${id} bumpé`, { type: 'success', desc: 'Notification salle envoyée à Sofia · pass · ouvert depuis 4 s.' });
      });
    }, 0);
  };

  handlers['kds-recall'] = (el) => {
    const id = el?.dataset.id || 'ticket';
    toast(`Ticket ${id} rappelé en cuisine`, { type: 'warn', desc: 'Le ticket revient en haut de la file · cuisinier averti.' });
  };

  handlers['kds-86'] = (el) => {
    const item = el?.dataset.item || 'plat';
    const m = modal({
      tag: 'STOCK',
      title: `Mettre « ${item} » en 86 ?`,
      desc: 'Le plat devient indisponible sur la caisse et le QR table.',
      width: 480,
      body: `<div style="font-size:13px; color:var(--n-600); line-height:1.5;">Le client en train de commander voit le plat barré. Vous pouvez le réactiver dès que le stock revient.</div>`,
      foot: `<button class="kb ghost" data-dismiss>Annuler</button><button class="kb danger" data-confirm-86>Confirmer le 86</button>`,
    });
    wireDismiss(m);
    setTimeout(() => {
      m.el.querySelector('[data-confirm-86]').addEventListener('click', () => {
        m.close();
        toast(`${item} en 86`, { type: 'success', desc: 'Désactivé sur la caisse et le QR table.' });
      });
    }, 0);
  };

  handlers['kds-fullscreen'] = () => {
    toast('Plein écran station active', { type: 'info', desc: 'iPad mural connecté · police × 1,4 · auto-refresh 3 s · interface tactile gants compatible.' });
  };
  handlers['kds-reassign'] = () => {
    toast('Réaffecter ticket', { type: 'info', desc: 'Glissez le ticket vers Mehdi M. ou Ayoub Y. pour transférer.' });
  };
  handlers['kds-print-summary'] = () => {
    toast('Récap service midi imprimé', { type: 'success', desc: '47 plats servis · prép. moy. 8 min 14 s · 3 retours cuisine.' });
  };
})();
