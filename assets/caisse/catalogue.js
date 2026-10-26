/* Owner: caisse catalogue, formulas and cart.
 * Exposes the classic global function declarations and lexical helpers below.
 * Requires caisse-app.js shared lexical state and the accounting/floor/kitchen
 * declarations. No startup effects; load before caisse-app.js initializers.
 */
    /* =========================================================
       Kiwi Caisse · demo logic
       Single-file. No build, no framework. Pure browser JS.
       ========================================================= */

    /* ---------- Helpers ---------- */
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    /* Money crosses carts, discounts, split tenders, refunds and the persisted
       ledger. Keep every boundary at two decimal places: binary floats may live
       between keystrokes, never in a completed accounting value. */
    const money = n => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
    const minor = n => Math.round(((Number(n) || 0) + Number.EPSILON) * 100);
    const major = n => n / 100;
    const fmtMAD = n => new Intl.NumberFormat('fr-FR', {
      useGrouping: true,
      minimumFractionDigits: minor(n) % 100 ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(money(n)) + ' MAD';
    const fmtMADcents = n => money(n).toFixed(2).replace('.', ',') + ' MAD';

    

    /* ---------- Live clock ---------- */
    function tickClock() {
      const now = new Date();
      /* The register shows the time of the device it runs on, wherever it is.
         Never cache a numeric UTC offset: the IANA zone follows winter/summer
         and Ramadan changes. KiwiDayReport resolves the device zone on a paired
         till, so the clock and the Z boundary agree. */
      const zone = window.KiwiDayReport?.timezone?.(currentMerchantSlug())
        || (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { return ''; } })()
        || 'Africa/Casablanca';
      const t = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('fr-FR', {
        timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).format(now);
      /* The date follows the till language: the native app's locale, or the
         picker in the rail on the web (assets/caisse-lang.js). */
      const nativeLang = document.documentElement.classList.contains('kiwi-native') ? document.documentElement.lang
        : ((window.KiwiCaisseLang && window.KiwiCaisseLang.get()) || 'fr');
      const dateLocale = nativeLang === 'ar' ? 'ar-MA' : nativeLang === 'en' ? 'en-GB' : 'fr-FR';
      const dateStr = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(dateLocale, {
        timeZone: zone, weekday: 'long', day: 'numeric', month: 'long'
      }).format(now);
      $('#clock-time').textContent = t;
      $('#topbar-clock').textContent = t;
      $('#clock-date').textContent = dateStr;
      const ciT = $('#ci-time'); if (ciT) ciT.textContent = t;
      const ciD = $('#ci-date'); if (ciD) ciD.textContent = dateStr;
    }
    
    function serverInitials(s) { return String(s.name || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase(); }
    /* Staff colours are merchant-configurable. White initials disappear on
       amber, mint and other light badges, so derive ink from the actual fill
       instead of assuming every avatar is dark. */
    function serverBadgeInk(color) {
      const h = String(color || '').trim().replace('#', '');
      if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(h)) return '#F7F5F0';
      const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
      const rgb = [0, 2, 4].map(i => {
        const s = parseInt(n.slice(i, i + 2), 16) / 255;
        return s <= .04045 ? s / 12.92 : Math.pow((s + .055) / 1.055, 2.4);
      });
      return (.2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]) > .34 ? '#0A0F0D' : '#F7F5F0';
    }

    /* Escape merchant-entered strings (staff names, zone labels) before they go
       into innerHTML · a real store's roster comes from the owner's dashboard. */
    function escTeam(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    /* The floor team for a REAL store IS its dashboard roster · published by the
       Équipe page (team.js publishPins → /api/config → window.KiwiConfig.pins).
       Never the demo servers (Yassir A., Karim B.…). Empty roster → empty drawer
       and no server badges, exactly like an untouched dashboard. The local demo
       (unpaired localhost) keeps its seeded five servers, verbatim.
       Des NOMS et des rôles, jamais des codes : /api/config ne les envoie plus. */
    function currentRoster() {
      try {
        const p = window.KiwiConfig && window.KiwiConfig.pins;
        if (Array.isArray(p)) return p.filter(m => m && m.name);
      } catch (_) {}
      return [];
    }
    
    function pairedTeamMerchant() {
      try { return String((storePaired() || {}).merchant || ''); } catch (_) { return ''; }
    }
    function applyLiveTeam(data) {
      if (!data || !data.ok || !Array.isArray(data.members)) return;
      const merchant = pairedTeamMerchant();
      if (!merchant || data.merchant !== merchant) return;
      liveTeamMerchant = merchant;
      renderAttendanceHistory(data.recentAttendance || []);
      Object.keys(servers).forEach((id) => { delete servers[id]; });
      data.members.forEach((member, index) => {
        const id = String(member.id || '');
        if (!id) return;
        const status = member.status === 'on-duty' ? 'on' : (member.status === 'on-pause' ? 'pause' : 'off');
        const since = Number(member.since) ? new Date(Number(member.since)).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null;
        servers[id] = {
          id, name: String(member.name || 'Employé'), role: String(member.role || member.department || ''),
          color: ROSTER_PALETTE[index % ROSTER_PALETTE.length], status,
          breakStart: Number(member.pauseTs) || null, since,
        };
      });
      try { renderTeamDrawer(); } catch (_) {}
      try { renderSalle(); } catch (_) {}
      try { updateTeamCount(); } catch (_) {}
    }
    function pollLiveTeam() {
      if (liveTeamBusy || !storeIsReal()) return;
      const merchant = pairedTeamMerchant();
      if (!merchant) return;
      liveTeamBusy = true;
      fetch('/api/team/live?merchant=' + encodeURIComponent(merchant), {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
      }).then((response) => response.ok ? response.json() : null)
        .then(applyLiveTeam).catch(() => {}).finally(() => { liveTeamBusy = false; });
    }
    
    function scheduleLiveTeam() {
      if (liveTeamTimer) clearTimeout(liveTeamTimer);
      liveTeamTimer = setTimeout(() => { pollLiveTeam(); scheduleLiveTeam(); },
        document.hidden ? LIVE_TEAM_HIDDEN_MS : LIVE_TEAM_VISIBLE_MS);
    }
    function startLiveTeam() {
      if (!storeIsReal()) return;
      pollLiveTeam();
      if (liveTeamTimer) return;
      scheduleLiveTeam();
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) pollLiveTeam();
        scheduleLiveTeam();
      });
    }
    function rebuildRealRoster() {
      if (!storeIsReal()) return;                      // demo keeps its seeded five
      if (liveTeamMerchant && liveTeamMerchant === pairedTeamMerchant()) return;
      const roster = currentRoster();
      Object.keys(servers).forEach(k => { delete servers[k]; });
      roster.forEach((m, i) => {
        const id = 'S' + (i + 1);
        servers[id] = {
          id,
          name: (m.name && String(m.name).trim()) || ('Membre ' + (i + 1)),
          role: (m.role && String(m.role).trim()) || '',
          color: ROSTER_PALETTE[i % ROSTER_PALETTE.length],
          status: 'off',       // attendance decides presence; never invent a live shift
          breakStart: null,
          since: null,         // no fabricated shift-start time
        };
      });
      try { const d = document.getElementById('team-drawer'); if (d && d.classList.contains('is-open')) renderTeamDrawer(); } catch (_) {}
      try { updateTeamCount(); } catch (_) {}
      try { if (typeof setupRealSalle === 'function') setupRealSalle(); } catch (_) {}
    }

    
    function generateOrder(tableId, t) {
      /* A cashier-built order is newer than the demo's generated bill cache.
         The old predicate returned any non-empty `orders[tableId]` first, so a
         stale Café Atlas demo bill could mask the real sent lines (including
         their uid/sent flags). The amount looked right in the editor, but the
         bill had no cancellation controls. Live lines win; the generated cache
         is only a fallback when there is no cashier-built bill. */
      const liveLines = tableOrders[tableId];
      if (Array.isArray(liveLines) && liveLines.length) {
        return liveLines.map(l => ({ id: l.id, uid: l.uid, qty: l.qty, name: lineLabel(l), baseName: l.baseName || l.name,
          price: l.price, total: l.price * l.qty, note: l.note || '', sent: !!l.sent,
          held: lineHeld(l, liveLines),
          orderProPending: !!l.orderProPending, voidPending: !!l.voidPending,
          kind: l.kind, formulaUid: l.formulaUid,
          formulaName: l.formulaName, slotLabel: l.slotLabel, promo: l.promo || null }));
      }
      // A legacy transfer can still leave an intact generated bill beside an
      // empty live cache; preserve it only in that exact demo-only case.
      if (IS_DEMO && Array.isArray(orders[tableId]) && orders[tableId].length) return orders[tableId];
      if (tableId in tableOrders) return [];
      /* Chez un vrai commerçant on s'arrête ici. Ce qui suit FABRIQUE des lignes
         · un couscous royal par couvert · et c'est appelé sans condition par
         l'addition, le partage de note et la remise : une table réelle sans
         commande saisie sortait une addition inventée. Une table vide est vide. */
      if (!IS_DEMO) return [];
      const seed = parseInt(tableId.replace('T',''), 10);
      const lines = [];
      // Mains: one per cover (slight variation)
      const mainIdx = (seed * 3) % 6 + 2; // index in menu (mains are 2..6)
      const main = menu[mainIdx];
      lines.push({ qty: t.covers, name: main.name, total: main.unit * t.covers });
      // Drinks
      const drinkIdx = 7 + (seed % 4); // 7..10
      const drink = menu[drinkIdx];
      lines.push({ qty: t.covers, name: drink.name, total: drink.unit * t.covers });
      // Starter or dessert sometimes
      if (seed % 2 === 0) {
        const starter = menu[seed % 2 === 0 ? 0 : 1];
        lines.push({ qty: 1, name: starter.name, total: starter.unit });
      } else {
        const dessert = menu[11];
        lines.push({ qty: t.covers, name: dessert.name, total: dessert.unit * t.covers });
      }
      orders[tableId] = lines;
      return lines;
    }

    
    /* Un article « réservé aux formules » n'est pas dans menuItems (la grille ne
       vend que l'individuel) mais une ligne de formule le porte quand même : son
       poste cuisine, sa catégorie et sa réouverture se cherchent dans la carte
       entière (carteState.formulaItems = tout sauf archivé), menuItems en repli. */
    function menuLineFind(pred) {
      const all = carteState.formulaItems && carteState.formulaItems.length ? carteState.formulaItems : null;
      return (all && all.find(pred)) || menuItems.find(pred) || null;
    }

    function carteSlug() {
      try { const p = storePaired(); return (p && p.merchant) || ''; } catch (_) { return ''; }
    }
    function caisseCarte() {
      if (IS_DEMO) return null;
      const slug = carteSlug();
      if (!slug) return null;
      try {
        const raw = localStorage.getItem(CARTE_MIRROR + slug);
        const d = raw ? JSON.parse(raw) : null;
        if (d && Array.isArray(d.items)) return d;
      } catch (_) {}
      return null;
    }

    /* Projection : la carte du serveur ({cats:[{id,name,sub}], items:[{id,name,
       price,catId,…}]}) devient le format que les six écrans de la caisse lisent
       déjà (menuItems[].cat / catLabels / catColor). Personne d'autre ne change. */
    function rebuildCarte() {
      const d = caisseCarte();
      if (!d) return false;
      const cats = Array.isArray(d.cats) ? d.cats.filter(c => c && c.id) : [];
      const labels = { all: 'Tout' };
      const colors = {};
      const order = ['all'];
      /* Le routage voyage sur la CATÉGORIE, pas sur le plat. La caisse continue
         de porter un `station` par ligne de menu · c'est ce que lit
         kdsStationFor · mais c'est celui de sa catégorie, résolu ici une fois
         pour toutes. Un plat ajouté demain dans « Boissons » part au bar sans
         que personne n'ait à y penser. */
      const catStation = {};
      const catI18n = {};
      cats.forEach((c, i) => {
        labels[c.id] = c.name || 'Sans nom';
        catI18n[c.id] = c.i18n || null;
        colors[c.id] = CAT_PALETTE[i % CAT_PALETTE.length];
        catStation[c.id] = String(c.station || '');
        order.push(c.id);
      });
      /* Un plat sans catégorie ne doit pas disparaître de la caisse : le patron
         l'a créé, il se vend. On lui ouvre une rubrique « Autres ». */
      let loose = false;
      const allRawItems = (d.items || []).concat(Array.isArray(d.formulaItems) ? d.formulaItems : []);
      const allItems = allRawItems.filter(it => it && it.id && it.name && !it.archived).map((it) => {
        const cat = (it.catId && labels[it.catId]) ? it.catId : (loose = true, '_autres');
        const parent = cats.find(c => c.id === cat);
        const sub = parent && it.subId ? (parent.sub || []).find(s => s.id === it.subId) : null;
        return { id: it.id, cat, subId: sub ? sub.id : null, subLabel: sub ? sub.name : '', subI18n: sub ? (sub.i18n || null) : null, name: it.name, price: +it.price || 0, station: catStation[cat] || '',
          /* Les traductions du patron (assets/menu-i18n.js) : lues à l'AFFICHAGE
             par menuName()/lineName() ; la ligne de la note et le ticket cuisine
             gardent `name`, le libellé canonique. */
          i18n: it.i18n || null,
          /* Les groupes d'options que ce produit demande. Des identifiants : le
             libellé vit une seule fois, dans carteState.opts. */
          opts: Array.isArray(it.opts) ? it.opts.slice() : [], formula: it.formula || null,
          avail: it.avail !== false, formulaOnly: it.formulaOnly === true, archived: it.archived === true };
      });
      const items = allItems.filter((it) => it.avail !== false && !it.formulaOnly && !it.archived);
      carteState.formulaItems = allItems;
      /* Un plat épuisé (« 86 ») reste sur la carte, grisé et non vendable : le
         faire disparaître laissait le serveur chercher un plat qu'il croyait
         encore au menu, et le client en commander un qui n'existe plus. */
      carteState.soldOut = allItems.filter((it) => it.avail === false && !it.formulaOnly && !it.archived);
      try { carteState.promos = window.KiwiMenuPromos ? window.KiwiMenuPromos.sanitize(d.promos, d) : []; } catch (_) { carteState.promos = []; }
      carteState.catI18n = catI18n;
      try { if (window.KiwiMenuI18n) window.KiwiMenuI18n.index({ cats: cats, items: allItems, opts: Array.isArray(d.opts) ? d.opts : [] }); } catch (_) {}
      if (loose) {
        labels._autres = 'Autres';
        colors._autres = CAT_PALETTE[cats.length % CAT_PALETTE.length];
        order.push('_autres');
      }
      /* Les postes, dans l'ordre du patron · c'est l'ordre des onglets de
         l'écran cuisine, rien de plus. Une couleur qui n'est pas un #RRGGBB
         retombe sur la palette : cette valeur part directement dans un
         attribut style. */
      carteState.cats = cats;
      carteState.stations = (Array.isArray(d.stations) ? d.stations : [])
        .filter(s => s && s.id && s.name)
        .map((s, i) => ({
          id: String(s.id),
          name: String(s.name),
          raw: /^#[0-9a-fA-F]{6}$/.test(String(s.color || '')) ? String(s.color) : STATION_PALETTE[i % STATION_PALETTE.length],
        }));
      /* Le repli, NOMMÉ. Sans lui on retomberait sur « le premier de la liste »,
         et l'ordre des onglets redeviendrait à son insu un réglage de routage :
         monter le bar d'un cran enverrait toute la carte non routée au bar. Le
         secours reste le premier poste · une carte écrite avant ce changement
         doit continuer de router exactement comme hier. */
      /* La bibliothèque des groupes d'options, telle que le patron l'a écrite.
         Un groupe sans choix est écarté ici : le comptoir ouvrirait une fenêtre
         vide, et le vendeur ne pourrait ni répondre ni passer. */
      carteState.opts = (Array.isArray(d.opts) ? d.opts : [])
        .filter(g => g && g.id && g.name && Array.isArray(g.choices) && g.choices.length)
        .map(g => ({
          id: String(g.id), name: String(g.name),
          kind: g.kind === 'many' ? 'many' : 'one',
          required: !!g.required,
          choices: g.choices.filter(c => c && c.id && c.name)
            .map(c => ({ id: String(c.id), name: String(c.name), emoji: String(c.emoji || ''), price: Math.max(0, +c.price || 0) })),
        }));
      const stIds = carteState.stations.map(s => s.id);
      carteState.kitchenId = (d.kitchenId && stIds.indexOf(String(d.kitchenId)) >= 0)
        ? String(d.kitchenId) : (stIds[0] || '');
      catLabels = labels;
      catColor = colors;
      catOrder = order;
      menuItems = items;
      if (!catLabels[activeCat]) activeCat = 'all';
      try { renderCatPills(); renderMenu(); } catch (_) {}
      // L'écran cuisine n'existe pas encore au premier appel (amorçage) · il se
      // montera juste après avec la bonne liste. Ensuite, un poste supprimé au
      // bureau doit disparaître de la barre sans recharger la caisse.
      if (carteState.kdsReady) { try { kdsRepaintStations(); } catch (_) {} }
      return true;
    }

    
    function rebuildCarteWhenIdle() {
      if (!_carteFingerDown) return rebuildCarte();
      return new Promise((resolve) => {
        const wait = () => { if (_carteFingerDown) setTimeout(wait, 120); else resolve(rebuildCarte()); };
        setTimeout(wait, 120);
      });
    }
    function fetchCarte(force) {
      if (IS_DEMO) return Promise.resolve(false);
      const slug = carteSlug();
      if (!slug) return Promise.resolve(false);
      const now = Date.now();
      if (!force && now - _carteAt < 5000) return Promise.resolve(false);
      _carteAt = now;
      return fetch('/api/menu?merchant=' + encodeURIComponent(slug), { credentials: 'omit' })
        .then(r => (r.ok ? r.json() : null))
        .then((j) => {
          const m = j && j.menu;
          if (!m || !Array.isArray(m.items) || !m.items.length) return false;
          const raw = JSON.stringify(m);
          let previous = null;
          try { previous = localStorage.getItem(CARTE_MIRROR + slug); } catch (_) {}
          if (previous === raw && menuItems.length) return false;
          try { localStorage.setItem(CARTE_MIRROR + slug, raw); } catch (_) {}
          return rebuildCarteWhenIdle();
        })
        .catch(() => false);
    }
    
    const newLineUid = () => 'ln' + (++lineSeq);
    

    function persistDismissedExpired() {
      try {
        const arr = Array.from(dismissedExpiredIds).slice(-200);
        localStorage.setItem('kiwi_dismissed_expired', JSON.stringify(arr));
      } catch (_) {}
    }

    function dismissExpired(id) {
      if (!id) return;
      const strId = String(id);
      dismissedExpiredIds.add(strId);
      persistDismissedExpired();
      if (Array.isArray(expiredOrders)) {
        expiredOrders = expiredOrders.filter(x => x && String(x.id) !== strId);
      }
      try {
        const m = (typeof opMerchant === 'function' ? opMerchant() : '') ||
                  (typeof currentMerchantSlug === 'function' ? currentMerchantSlug() : '') ||
                  (typeof slug !== 'undefined' ? slug : '') || '';
        if (m && !window.KiwiTillTenant?.mismatch()) {
          fetch('/api/order/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchant: m, id: strId, action: 'dismiss_expired', dismiss: true })
          }).catch(() => {});
        }
      } catch (_) {}
    }

    
    function syncSharedStock(repaint){
      if (!storeIsReal() || !window.KiwiCaisseStock) return;
      const snap = window.KiwiCaisseStock.snapshot();
      stockItems.splice(0, stockItems.length, ...(snap.items || []));
      suppliers.splice(0, suppliers.length, ...(snap.suppliers || []));
      updateStockBadge();
      if (repaint && $('#stock-screen')?.classList.contains('is-open')) renderStock();
    }
    function bindSharedStock(){
      if (!storeIsReal() || !window.KiwiCaisseStock) return;
      if (!skSharedStockUnsub) skSharedStockUnsub = window.KiwiCaisseStock.subscribe(() => syncSharedStock(true));
      syncSharedStock(false);
      window.KiwiCaisseStock.bind().then(() => syncSharedStock(true));
    }
    

    /* Réduction amount for the À emporter cart, clamped to the gross. */
    function vrapDiscountAmount(gross) {
      const d = vrapDiscount;
      if (!d) return 0;
      const amt = d.kind === 'pct'
        ? Math.round(minor(gross) * (d.value || 0) / 100 + 1e-9) / 100 /* centimes entiers : 5 % de 43 871,10 vaut 2 193,555 */
        : money(d.value || 0);
      return money(Math.max(0, Math.min(amt, money(gross))));
    }

    function renderCatPills() {
      const counts = { all: menuItems.length };
      menuItems.forEach(m => { counts[m.cat] = (counts[m.cat] || 0) + 1; });
      const cats = catOrder;
      $('#cat-pills').innerHTML = cats.map(c => `
        <button type="button" role="tab" aria-selected="${c === activeCat}" class="cat-pill ${c === activeCat ? 'is-active' : ''}" data-cat="${c}">
          ${escTeam(catLabelL(c))}<span class="count mono">${counts[c] || 0}</span>
        </button>
      `).join('');
      let subPills = $('#subcat-pills');
      if (!subPills) {
        subPills = document.createElement('div');
        subPills.id = 'subcat-pills';
        subPills.className = 'cat-pills';
        subPills.setAttribute('role', 'tablist');
        subPills.setAttribute('aria-label', 'Sous-catégories du menu');
        subPills.addEventListener('click', (e) => {
          const b = e.target.closest('[data-subcat]'); if (!b) return;
          activeSub = b.dataset.subcat || null; renderCatPills(); renderMenu();
        });
        $('#cat-pills').insertAdjacentElement('afterend', subPills);
      }
      const parent = carteState.cats.find(c => c.id === activeCat);
      const subs = parent ? (parent.sub || []).filter(s => s && s.id) : [];
      subPills.hidden = activeCat === 'all' || !subs.length;
      subPills.innerHTML = subPills.hidden ? '' : [
        `<button type="button" role="tab" aria-selected="${!activeSub}" class="cat-pill ${!activeSub ? 'is-active' : ''}" data-subcat="">Tout</button>`,
        ...subs.map(s => `<button type="button" role="tab" aria-selected="${activeSub === s.id}" class="cat-pill ${activeSub === s.id ? 'is-active' : ''}" data-subcat="${escTeam(s.id)}">${escTeam(window.KiwiMenuI18n ? window.KiwiMenuI18n.name(s, carteLang()) : s.name)}<span class="count mono">${menuItems.filter(m => m.cat === activeCat && m.subId === s.id).length}</span></button>`)
      ].join('');
      window.CaisseFx && window.CaisseFx.lens();

      // French: 0 and 1 take the singular.
      $('#vrap-item-count').textContent = `${menuItems.length} ${menuItems.length > 1 ? 'articles' : 'article'}`;
      $('#vrap-cat-count').textContent = `${cats.length - 1} ${cats.length - 1 > 1 ? 'catégories' : 'catégorie'}`;
    }

    const normalizeMenuArtName = (value) => String(value || '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, ' ').trim();

    /* Les mots qui choisissent la photo d'un plat (assets/dishes/<clé>.webp).
       Un mot-clé gagne quand tous ses mots sont dans le nom, dans n'importe
       quel ordre ; « de », « au », les accents et le pluriel ne comptent pas.
       Le plus de mots l'emporte (« tajine poulet » avant « tajine ») ; à
       égalité, le mot qui vient le premier, car un menu français nomme le plat
       d'abord (« Glace fraise » est une glace, « Soupe de poisson » une soupe).
       « ~ » marque un mot faible, un ingrédient ou un parfum : il ne compte que
       si rien d'autre ne parle (« Pizza poulet » reste une pizza). « ^ » marque
       une base, une forme de pâtes, un sandwich, une salade, une soupe : elle
       bat un ingrédient mais cède à tout vrai plat, où qu'il soit dans le nom
       (« Spaghetti carbonara » est une carbonara). Les mots de tête (DISH_HEADS)
       nomment la forme de l'article, et un menu anglais les met en dernier :
       un mot-clé qui en contient un passe devant un parfum (« Tiramisu latte »
       est un latte, « Kunafa crêpe » une crêpe). Un plat
       nouveau : une ligne ici et sa photo (tools/dish-photos). */
    const DISH_WORDS = {
      'agnolotti': 'agnolotti|agnolotti del plin|agnollotti|agnolotti del pin',
      'ravioli': 'ravioli|tortellini|tortelloni',
      'lasagna': 'lasagne|lasagna|lasagnes',
      'pasta': '^pates|^pasta|^pappardelle|^tagliatelle|^spaghetti|^linguine|^penne|^rigatoni|^fusilli|^fettuccine|^farfalle|^macaroni|^معكرونة|~salsa|pomodoro|rosa pomodoro|aglio olio|aglio|tartufata|tartufo|~truffe|crema di formaggi|crema di fromaggi|~formaggi|prepare ton plat|choose pasta',
      'parmigiana': 'parmigiana|melanzane|aubergine parmesan|~aubergine',
      'cheese': '~fromage|~cheese|mozzarella|caprese|plateau de fromages|~jben',
      'tiramisu': 'tiramisu',
      'flan': 'flan|bonet|creme caramel|panna cotta|panacotta|pana cotta',
      'pizza': 'pizza|margherita|margarita|بيتزا',
      'water': 'eau|water|eau minerale|sidi ali|ain saiss|sidi harazem|ماء',
      'soda': 'coca|coca cola|cola|fanta|sprite|soda|pepsi|schweppes|hawaii|hawai|poms|7up|orangina|canette|boisson gazeuse',
      'juice': 'jus|juice|limonade|citronnade|~citron|jus de citron|عصير|lemonade|home lemonade|~lemon|~ginger|ginger lemon|jus maison|jus tropical|tropical|juice',
      'orange-juice': 'jus d orange|jus orange|orange pressee|~orange|jus d agrumes|orange juice',
      'avocado-juice': 'jus d avocat|~avocat|~avocado|jus avocat',
      'mint-tea': '~the|the a la menthe|the menthe|atay|attay|tea|mint tea|شاي|اتاي',
      'espresso': 'cafe|espresso|expresso|cafe noir|ristretto|قهوة|coffee|double espresso|ristretto|lungo',
      'cafe-au-lait': 'cafe au lait|cafe creme|latte|~creme|cafe latte|lait chaud|flat white|spanish latte|latte au lait concentre',
      'cappuccino': 'cappuccino|capuccino',
      'salade-marocaine': 'salade marocaine|salade mechouia',
      'briouates': 'briouate|briouat|briwat|bstila mini',
      'harira': 'harira|حريرة',
      'zaalouk': 'zaalouk|zaalouk d aubergine',
      'taktouka': 'taktouka|tektouka',
      'soup': '^soupe|^soup|^potage|soupe du jour|chorba|شوربة',
      'msemen': 'msemen|msemmen|rghaif|meloui|mlawi|مسمن',
      'brochettes': 'brochette|brochettes|grillade|grillades|skewer|قطبان',
      'salad': '^salade|^salad|salade verte|^سلطة',
      'tajine-kefta': 'tajine kefta|tajine de kefta|kefta aux oeufs|tajine oeuf|طاجين كفتة',
      'tajine-poulet': 'tajine poulet|tajine de poulet|tajine poulet citron|poulet citron olives|poulet aux olives|طاجين دجاج',
      'tajine-agneau': 'tajine agneau|tajine viande|tajine boeuf|tajine pruneaux|lham lahlou|tajine d agneau|tajine de viande|طاجين لحم',
      'tajine-legumes': 'tajine|tagine|tajine legumes|tajine aux legumes|طاجين',
      'tajine-poisson': 'tajine poisson|tajine de poisson|tajine sardines|tajine kefta de poisson|طاجين حوت|طاجين سمك',
      'couscous-royal': 'couscous|couscous royal|couscous viande|couscous poulet|كسكس',
      'couscous-tfaya': 'couscous tfaya|tfaya',
      'couscous-legumes': 'couscous legumes|couscous aux legumes|couscous vegetarien|couscous 7 legumes|couscous sept legumes|كسكس خضر',
      'plate': 'plat du jour|~plat|~assiette|cloche',
      'pastilla-poulet': 'pastilla|bastilla|pastilla poulet|pastilla au poulet|بسطيلة',
      'pastilla-seafood': 'pastilla fruits de mer|pastilla poisson|pastilla seafood|pastilla aux fruits de mer',
      'pastilla-pigeon': 'pastilla pigeon|pastilla au pigeon',
      'sandwich-kefta': '^sandwich|sandwich kefta|sandwich viande hachee|^كاسكروط',
      'sandwich-poulet': 'sandwich poulet|sandwich au poulet|sandwich chicken',
      'sandwich-thon': 'sandwich thon|sandwich au thon|sandwich tuna',
      'bocadillo': 'bocadillo|merguez|sandwich merguez|charcuterie sandwich|sandwich charcuterie|sandwich jambon|jambon beurre',
      'wrap': 'wrap|wraps|roule',
      'burger': 'burger|hamburger|برغر|smash burger|smash bacon|king burger|bacon burger',
      'creme-brulee': 'creme brulee|creme brule',
      'cornes-gazelle': 'cornes de gazelle|corne de gazelle|kaab el ghazal|kaab ghzal',
      'patisserie': 'patisserie|patisseries|patisserie marocaine|gateaux marocains|halwa|حلويات',
      'fruit': '~fruit|~fruits|fruit de saison|corbeille de fruits|فواكه',
      'glace': 'glace|glaces|creme glacee|ice cream|sorbet|gelato|boule de glace|بوظة',
      'gateau': 'gateau|cake|fondant|fondant chocolat|forêt noire|foret noire|layer cake|banana bread|cake au citron|carrot cake|honey cake|marble cake',
      'crepe': 'crepe|crepes|crepe sucree|galette|french crepes|crepe nutella',
      'baghrir': 'baghrir|beghrir|bghrir|crepe mille trous|بغرير',
      'chebakia': 'chebakia|chbakia|griouech|شباكية',
      'petit-dejeuner': 'petit dejeuner|petit dej|ftour|breakfast|petit dejeuner marocain|فطور|brunch|formule brunch|continental|marocain|petit dejeuner continental|petit dejeuner healthy',
      'omelette': 'omelette|omelet|omelette fromage',
      'oeufs': 'oeufs|oeuf|oeuf au plat|oeufs au plat|eggs|بيض|oeufs benedicte|benedicte|benedict|eggs benedict|oeufs brouilles|scrambled eggs|oeuf mollet',
      'khlii': 'khlii|khlia|oeufs khlii|oeufs au khlii',
      'harcha': 'harcha|حرشة',
      'batbout': 'batbout|matlou|matlouh|بطبوط',
      'croissant': 'croissant|croissants',
      'pain-chocolat': 'pain au chocolat|chocolatine|pains au chocolat',
      'tartine': 'tartine|tartines|pain beurre|pain confiture|toast|toasts|pain perdu|french toast|stracciatella',
      'avocado-toast': 'avocado toast|toast avocat|toast a l avocat|tartine avocat',
      'pancakes': 'pancake|pancakes|mini pancakes|mini pancake|pancake',
      'gaufre': 'gaufre|gaufres|waffle|waffles',
      'granola': 'granola|bowl granola|yaourt granola|muesli',
      'acai': 'acai|acai bowl',
      'amlou': 'amlou|amlo|أملو',
      'sfenj': 'sfenj|beignet|beignets|سفنج',
      'bissara': 'bissara|bessara|bsara|بيصارة',
      'loubia': 'loubia|haricots blancs|lobia|لوبيا',
      'adass': 'adass|lentilles|3dess|عدس',
      'rfissa': 'rfissa|trid|tride|رفيسة',
      'tanjia': 'tanjia|tangia|طنجية',
      'mechoui': 'mechoui|mechwi|agneau roti|مشوي',
      'seffa': 'seffa|seffa medfouna|سفة',
      'kefta': 'kefta|kofta|viande hachee|كفتة|boulettes|boulette|meatballs|polpette|boulettes de viande',
      'mrouzia': 'mrouzia|مروزية',
      'maakouda': 'maakouda|makouda|maaqouda|معقودة',
      'chakchouka': 'chakchouka|shakshuka|chakchouka aux oeufs',
      'babbouche': 'babbouche|ghlala|escargots|escargot|ببوش',
      'mais-grille': 'mais grille|mais|corn|epi de mais|ذرة',
      'sellou': 'sellou|slilou|zmita|سلو',
      'ghriba': 'ghriba|ghoriba|ghribas|غريبة',
      'fekkas': 'fekkas|feqqas|fakkas|فقاص',
      'briouates-miel': 'briouates au miel|briouate au miel|briouates amandes|briouat aux amandes',
      'baklava': 'baklava|baklawa|بقلاوة',
      'kunafa': 'kunafa|knafeh|kunefe|konafa|كنافة',
      'basboussa': 'basboussa|basbousa|harissa sucree|بسبوسة',
      'sardines': 'sardine|sardines|sardines grillees|سردين',
      'friture': 'friture|poisson frit|fritto misto|friture de poisson',
      'calamars': 'calamar|calamars|calamari|calmar|كلمار',
      'crevettes': 'crevette|crevettes|gambas|shrimp|prawns|crevettes pil pil|pil pil|قمرون',
      'paella': 'paella|paella fruits de mer|بايلا',
      'fruits-de-mer': 'plateau fruits de mer|plateau de fruits de mer|~fruits de mer|~seafood|moules|moules frites|huitres',
      'saumon': '~saumon|~salmon|pave de saumon|saumon grille|filet de saumon',
      'poisson-grille': 'poisson grille|dorade|loup|daurade|~bar|~poisson|~fish|سمك|saint pierre|espadon|merlan|sole|rouget|pageot|lotte|~thon|~tuna|swordfish|pave de poisson',
      'steak': 'steak|entrecote|~boeuf|bavette|filet de boeuf|tournedos|faux filet|ستيك',
      'poulet-roti': '~poulet|poulet roti|poulet braise|poulet entier|demi poulet|poulet mhammer|mhammer|~chicken|~دجاج',
      'poulet-frit': 'poulet frit|fried chicken|tenders|crispy|chicken crispy|poulet pane|escalope panee',
      'nuggets': 'nuggets|nugget|chicken nuggets',
      'wings': 'wings|ailes|ailes de poulet|chicken wings|ailerons',
      'frites': 'frites|fries|french fries|frite|بطاطس مقلية|frittes|portion frites|portion de frites|portion frittes',
      'potatoes': 'potatoes|wedges|pommes de terre|pomme de terre|patates|potatoes wedges',
      'riz': 'riz|rice|riz blanc|رز',
      'puree': 'puree|puree de pommes de terre|mashed potatoes',
      'legumes': 'legumes|legumes sautes|legumes grilles|vegetables|خضر',
      'cheeseburger': 'cheeseburger|cheese burger|burger cheese|burger fromage',
      'chicken-burger': 'chicken burger|burger poulet|burger au poulet|crispy burger|zinger|crispy chicken burger|fried chicken burger',
      'double-burger': 'double burger|double cheese|big burger|burger double|maxi burger|smash double|triple cheese|triples cheese|double smash|smash',
      'hot-dog': 'hot dog|hotdog|hot dogs',
      'tacos': 'tacos|french tacos|tacos poulet|tacos viande|تاكوس',
      'panini': 'panini|paninis|sandwich grille',
      'club-sandwich': 'club sandwich|club|sandwich club',
      'croque': 'croque|croque monsieur|croque madame',
      'shawarma': 'shawarma|chawarma|shwarma|شاورما',
      'doner': 'kebab|doner|durum|doner kebab|assiette kebab',
      'falafel': 'falafel|falafels|فلافل',
      'houmous': 'houmous|hummus|humus|حمص',
      'taboule': 'taboule|tabbouleh|tabouleh',
      'fattoush': 'fattoush|fattouch',
      'quesadilla': 'quesadilla|quesadillas',
      'burrito': 'burrito|burritos',
      'nachos': 'nachos|guacamole|tortilla chips',
      'poke': 'poke|poke bowl|bowl|buddha bowl',
      'sushi': 'sushi|sushis|maki|makis|sashimi|nigiri|سوشي',
      'california': 'california|california roll|rolls|uramaki',
      'ramen': 'ramen|ramens',
      'nouilles': 'nouilles|noodles|wok|pad thai|nouilles sautees|yakisoba',
      'riz-cantonais': 'riz cantonais|fried rice|riz saute|riz frit',
      'nems': 'nems|nem|spring roll|spring rolls|rouleaux de printemps|rouleau de printemps',
      'curry': 'curry|tikka|tikka masala|butter chicken|poulet curry|كاري',
      'pepperoni': 'pepperoni|pizza pepperoni|diavola|pizza diavola',
      'pizza-4-fromages': '4 fromages|quatre fromages|pizza 4 fromages|quattro formaggi',
      'calzone': 'calzone|pizza calzone',
      'bolognaise': 'bolognaise|bolognese|spaghetti bolognaise|ragu',
      'carbonara': 'carbonara|pates carbonara',
      'arrabbiata': 'arrabbiata|arrabiata|pesto rosso',
      'pesto': 'pesto|pates au pesto|basilico',
      'alfredo': 'alfredo|fettuccine alfredo|pates saumon|tagliatelle saumon|penne saumon|creme champignons|pates creme|~champignons',
      'gnocchi': 'gnocchi|gnocchis|gnudi',
      'risotto': 'risotto|risotto champignons',
      'mac-cheese': 'mac and cheese|mac n cheese|macaroni cheese|gratin de pates',
      'bruschetta': 'bruschetta|bruschette',
      'garlic-bread': 'pain a l ail|garlic bread|pain ail',
      'focaccia': 'focaccia',
      'burrata': 'burrata',
      'carpaccio': 'carpaccio',
      'antipasti': 'antipasti|antipasto|planche|planche mixte|charcuterie|planche charcuterie',
      'cesar': 'cesar|caesar|salade cesar|caesar salad',
      'nicoise': 'nicoise|salade nicoise|tuna salad|salade thon|salade de thon',
      'chevre-chaud': 'chevre|chevre chaud|salade de chevre|chevre miel',
      'quinoa': 'quinoa|salade quinoa',
      'grecque': 'grecque|greek|salade grecque|feta',
      'soupe-oignon': 'soupe a l oignon|soupe oignon|gratinee',
      'veloute': 'veloute|creme de legumes|soupe potiron|potiron',
      'pain': 'pain|baguette|bread|corbeille de pain|خبز',
      'khobz': 'khobz|pain marocain|pain rond',
      'pain-raisins': 'pain aux raisins',
      'chausson': 'chausson|chausson aux pommes|apple turnover',
      'brioche': 'brioche|brioches',
      'cookie': 'cookie|cookies',
      'muffin': 'muffin|muffins',
      'brownie': 'brownie|brownies|brookie|brookies',
      'donut': 'donut|donuts|doughnut',
      'cheesecake': 'cheesecake|cheese cake|san sebastian|san sebastien|basque|cheesecake basque',
      'tarte': 'tarte|tartelette|tarte aux fruits|tarte aux pommes|tartelettes',
      'eclair': 'eclair|eclairs|eclair chocolat',
      'mille-feuille': 'mille feuille|mille feuilles|millefeuille',
      'macarons': 'macaron|macarons',
      'cupcake': 'cupcake|cupcakes',
      'cinnamon-roll': 'cinnamon roll|roule cannelle|roule a la cannelle|cinnamon',
      'mousse-chocolat': 'mousse|mousse au chocolat|mousse chocolat',
      'profiteroles': 'profiterole|profiteroles',
      'yaourt': 'yaourt|yogurt|yoghurt|raib|rayeb|رايب',
      'riz-au-lait': 'riz au lait|rice pudding|roz bel hlib',
      'coupe-glacee': 'coupe glacee|sundae|coupe|banana split|dame blanche',
      'lait': '~lait|milk|verre de lait|حليب',
      'lben': 'lben|leben|lait fermente|لبن',
      'jus-fraise': 'jus de fraise|jus fraise|~fraise|~strawberry',
      'jus-pomme': 'jus de pomme|jus pomme|apple juice|apple juice',
      'jus-mangue': 'jus de mangue|jus mangue|~mangue|~mango|mango juice|mango tango',
      'panache': 'panache|jus panache|cocktail de fruits|cocktail|jus mixte|jus de fruits|pina colada|pinacolada',
      'smoothie': 'smoothie|smoothies|~zest|green zest|~bliss',
      'milkshake': 'milkshake|milk shake|shake|~frappe|~oreo|~vanille|~vanilla|~vanila|frappe|b frappe|~caramel|~bueno',
      'ice-tea': 'ice tea|iced tea|the glace|thé glace|ice tea mangue|ice tea peche',
      'mojito': 'mojito|virgin mojito|mojito fraise',
      'eau-gazeuse': 'eau gazeuse|sparkling|oulmes|perrier|san pellegrino|pellegrino',
      'energy': 'red bull|energy|energy drink|monster|boisson energisante',
      'jus-carotte': 'jus de carotte|jus carotte|~carotte|carrot juice',
      'chocolat-chaud': 'chocolat chaud|hot chocolate|~chocolat|~cacao|mocha|mocca|moka|cacao latte',
      'americano': 'americano|cafe allonge|allonge|cafe long',
      'macchiato': 'macchiato|latte macchiato|caramel macchiato|cortado|machiato|latte machiato',
      'nous-nous': 'nous nous|nousnous|noss noss|nos nos|نص نص',
      'cafe-glace': 'cafe glace|iced coffee|ice coffee|frappuccino|iced latte|cold brew|cafe frappe|latte glace|iced cappuccino|iced capuccino|cappuccino glace|spanish latte glace',
      'matcha': 'matcha|matcha latte',
      'infusion': 'infusion|verveine|camomille|tisane|louiza|herbal tea|the vert|green tea',
      'the-noir': 'the noir|black tea|earl grey|the anglais|chai|masala chai|massala chai|chai latte|my lady|english breakfast|earl grey',
      'menu-enfant': 'menu enfant|menu kids|kids menu|menu junior|enfant',
      'combo': '~formule|~menu|combo|~formule midi|meal',
      'sauce': '~sauce|~sauces|supplement sauce|mayonnaise|ketchup|harissa',
      'olives': 'olive|olives|زيتون',
      'frites-fromage': 'frites fromage|cheese fries|frites cheddar|poutine',
      'brochettes-poulet': 'brochettes poulet|brochette poulet|brochettes de poulet|chich taouk|shish taouk|taouk',
      'brochettes-viande': 'brochettes viande|brochette viande|brochettes kefta|brochettes de viande|brochettes boeuf',
      'cote-agneau': 'cotelettes|cotes d agneau|cote d agneau|lamb chops|cotelette',
      'escalope': 'escalope|escalope de poulet|cordon bleu|schnitzel',
      'gratin': 'gratin|gratin dauphinois|gratin de legumes|moussaka',
      'tortilla': 'tortilla|tortilla espagnole',
      'empanadas': 'empanada|empanadas',
      'samosa': 'samosa|samoussa|samosas|samoussas',
      'feuilletes': 'feuillete|feuilletes|mini pizza|bouchees|bouchee|amuse bouche',
      'quiche': 'quiche|quiche lorraine',
      'bagel': 'bagel|bagels|salmon bagel|bagel saumon',
      'jus-detox': 'detox|jus detox|jus vert|green juice',
      'granite': 'granite|granita|slush|slushie',
      'cafe-turc': 'cafe turc|turkish coffee|cafe arabe',
      'chocolat-viennois': 'chocolat viennois|cafe viennois|viennois',
      'affogato': 'affogato',
      'panna-cotta-fruits': 'panna cotta fruits rouges|panna cotta coulis',
      'fraisier': 'fraisier|gateau fraise|tarte aux fraises',
      'opera': 'opera|gateau opera',
      'tarte-citron': 'tarte citron meringuee|tarte au citron|lemon tart',
      'crumble': 'crumble|apple crumble',
      'fondant-coulant': 'coulant|moelleux|fondant coulant|lava cake|moelleux chocolat',
      'salade-fruits': 'salade de fruits|fruit salad|macedoine',
      'dattes': 'dattes|datte|dates|tmar|تمر',
      'amandes': 'amandes|fruits secs|nuts|noix|cacahuetes',
      'lait-amandes': 'lait d amande|jus d amande|amandes lait|milkshake amande',
      'jus-banane': 'jus de banane|jus banane|~banane|~banana',
    };
    const DISH_STOP = new Set('de du des la le les au aux a l d et en with and of e di del della alla avec sur'.split(' '));
    const dishTokens = (value) => normalizeMenuArtName(value).replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ').trim()
      .split(' ').filter(w => w && !DISH_STOP.has(w)).map(w => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w));
    const DISH_HEADS = new Set(['latte', 'crepe', 'pancake', 'burger', 'taco', 'pizza', 'cake', 'milkshake', 'smoothie']);
    /* Les photos de boissons : une sous-catégorie qui nomme une boisson passe
       devant un nom qui nomme un plat (« Brownie & Chocolate » rangé sous
       « Milkshake » est un milkshake, « Mocca Cake » sous « Black tea » un thé). */
    const DISH_DRINKS = new Set([
      'affogato', 'americano', 'avocado-juice', 'cafe-au-lait', 'cafe-glace', 'cafe-turc',
      'cappuccino', 'chocolat-chaud', 'chocolat-viennois', 'eau-gazeuse', 'energy', 'espresso',
      'granite', 'ice-tea', 'infusion', 'juice', 'jus-banane', 'jus-carotte', 'jus-detox',
      'jus-fraise', 'jus-mangue', 'jus-pomme', 'lait', 'lait-amandes', 'lben', 'macchiato',
      'matcha', 'milkshake', 'mint-tea', 'mojito', 'nous-nous', 'orange-juice', 'panache',
      'smoothie', 'soda', 'the-noir', 'water'
    ]);
    let dishIndex = null;
    /* A dish word before a base before an ingredient, then a head word, more
       words, earlier in the name, longer keyword. */
    const dishRankAbove = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };
    const dishEntries = () => dishIndex || (dishIndex = Object.entries(DISH_WORDS).flatMap(([key, list]) => list.split('|').map((word) => {
      const tier = word[0] === '~' ? 0 : word[0] === '^' ? 1 : 2;
      const text = tier < 2 ? word.slice(1) : word;
      const arabic = /[\u0600-\u06ff]/.test(text);
      const toks = arabic ? [] : dishTokens(text);
      return { key, tier, arabic, head: toks.some(t => DISH_HEADS.has(t)) ? 1 : 0, text: normalizeMenuArtName(text), toks };
    })).filter(e => e.arabic || e.toks.length));
    /* Le meilleur mot-clé d'un nom, { key, tier }, ou null si aucun ne parle. */
    const dishMatch = (name) => {
      const raw = normalizeMenuArtName(name);
      if (!raw) return null;
      const toks = dishTokens(raw);
      let best = null;
      for (const e of dishEntries()) {
        let pos;
        if (e.arabic) { if (!raw.includes(e.text)) continue; pos = 0; }
        else {
          pos = Infinity;
          if (!e.toks.every(t => { const i = toks.indexOf(t); if (i < 0) return false; pos = Math.min(pos, i); return true; })) continue;
        }
        const rank = [e.tier, e.head, e.toks.length || 1, -pos, e.text.length];
        if (!best || dishRankAbove(rank, best.rank)) best = { key: e.key, tier: e.tier, rank };
      }
      return best;
    };
    const dishKeyFor = (name) => { const m = dishMatch(name); return m ? m.key : null; };
    /* Une canette prend la couleur de sa marque (owner, 25 octobre 2026) :
       Fanta en orange, Sprite en vert… sans logo ni texte, le nom est sous
       la photo. Lu une fois le soda trouvé, donc « Pommes » au rayon
       Soda+Eau est la canette de Poms, et ailleurs reste une pomme. Dans
       l'ordre : zéro et light d'abord, puis la marque, puis le parfum. */
    const SODA_CANS = [
      ['soda-zero', 'zero|max'], ['soda-light', 'light|diet'],
      ['soda-orange', 'fanta|orangina|mirinda'], ['soda-citron', 'sprite|7up|seven up|schweppes citron'],
      ['soda-pomme', 'poms|pom s'], ['soda-bleu', 'pepsi'], ['soda-tonic', 'schweppes|tonic'],
      ['soda-tropical', 'hawai|hawaii|tropical|ananas|mangue|passion'],
      ['soda-orange', 'orange'], ['soda-citron', 'citron|lemon|limon|lime'], ['soda-pomme', 'pomme|apple'],
      ['soda-cola', 'coca|cola|coke'],
    ].map(([key, words]) => [key, words.split('|').map(dishTokens)]);
    const sodaCan = (name) => {
      const toks = dishTokens(normalizeMenuArtName(name));
      const hit = SODA_CANS.find(([, words]) => words.some(w => w.length && w.every(t => toks.includes(t))));
      return hit ? hit[0] : 'soda';
    };

    /* La clé d'une photo de plat : le nom publié d'abord, puis la
       sous-catégorie (« Smoothies », « Smash Burgers »), puis l'id de la démo,
       puis la catégorie (ses mots, puis ses règles), puis la cloche. Un nom qui
       ne nomme qu'un ingrédient (« Chocolat banane »), ou qui nomme un plat
       sous une sous-catégorie de boissons, cède à sa sous-catégorie. */
    const menuArtKey = (id, cat, name, sub) => {
      const key = dishPhotoKey(id, cat, name, sub);
      return key === 'soda' ? sodaCan(name) : key;
    };
    const dishPhotoKey = (id, cat, name, sub) => {
      const named = dishMatch(name);
      const fromSub = dishMatch(sub);
      if (named && fromSub && fromSub.tier > 0 && DISH_DRINKS.has(fromSub.key) && !DISH_DRINKS.has(named.key)) return fromSub.key;
      if (named && named.tier > 0) return named.key;
      if (fromSub && (fromSub.tier > 0 || !named)) return fromSub.key;
      if (named) return named.key;
      if (MENU_ART[id]) return MENU_ART[id];
      const label = catLabels[cat] || cat;
      const fromLabel = dishKeyFor(label);
      if (fromLabel) return fromLabel;
      const fallback = CAT_GLYPH_RULES.find(rule => rule[0].test(normalizeMenuArtName(label)));
      return fallback ? fallback[1] : 'plate';
    };
    /* Bumped when a photo is redrawn (tools/caisse-product-art-test.mjs checks
       every key has its file): the photos sit outside the stamped shell. */
    const DISH_PHOTOS_V = 2;
    const menuArt = (id, cat, name, sub) =>
      `<img class="menu-photo" src="assets/dishes/${menuArtKey(id, cat, name, sub)}.webp?v=${DISH_PHOTOS_V}" alt="" width="64" height="64" loading="lazy" decoding="async" draggable="false">`;

    /* Une carte vide n'est pas une panne : c'est un patron qui n'a pas encore
       composé la sienne. On le dit, et on dit où la composer · même geste que
       le plan de salle (emptyPlanHTML). */
    /* …but a menu whose every dish is marked 86 IS composed. Saying
       « pas encore composée » there sent the cashier to rebuild a menu that
       exists, while the dishes were only out of stock. */
    function unavailableMenuCount() {
      return (carteState.formulaItems || []).filter(m => m && m.avail === false && !m.formulaOnly && !m.archived).length;
    }
    function emptyMenuHTML() {
      const off = unavailableMenuCount();
      if (off) return '' +
        '<div class="plan-empty" style="grid-column:1 / -1;"><div class="plan-empty-card">' +
          '<div class="plan-empty-ico"><i data-lucide="utensils-crossed"></i></div>' +
          '<div class="plan-empty-title">' + (off === 1 ? 'Le seul article de la carte est indisponible' : 'Les ' + off + ' articles de la carte sont indisponibles') + '</div>' +
          '<div class="plan-empty-sub">Marqués 86 depuis le tableau de bord · <b>Menu</b>. Ils reviendront ici dès qu’ils seront remis en vente.</div>' +
        '</div></div>';
      return '' +
        /* Rendered inside the product grid: span every column, or the card is
           squeezed into one tile and wraps word by word. */
        '<div class="plan-empty" style="grid-column:1 / -1;"><div class="plan-empty-card">' +
          '<div class="plan-empty-ico"><i data-lucide="utensils-crossed"></i></div>' +
          '<div class="plan-empty-title">Carte pas encore composée</div>' +
          '<div class="plan-empty-sub">Ajoutez vos catégories et vos plats depuis votre tableau de bord · <b>Menu</b>. Ils apparaîtront ici automatiquement.</div>' +
        '</div></div>';
    }

    /* ─── La carte dans la langue de la caisse (assets/menu-i18n.js) ───
       Le libellé du patron reste `name` ; on ne localise qu'à l'affichage :
       tuiles, pastilles de catégorie, lignes de la note. Les tickets et le
       bon de cuisine continuent d'écrire le libellé canonique. */
    /* caisse-lang.js is deferred: the first renders run before it exists. Read the
       saved choice so the pills and the tiles start in the same language. */
    function carteLang() {
      try {
        if (window.KiwiCaisseLang) return window.KiwiCaisseLang.get();
        const saved = localStorage.getItem('kiwiCaisseLang');
        return saved === 'en' || saved === 'ar' ? saved : 'fr';
      } catch (_) { return 'fr'; }
    }
    function menuName(m) { const M = window.KiwiMenuI18n; return (M && m) ? M.name(m, carteLang()) : ((m && m.name) || ''); }
    function catLabelL(id) {
      const raw = catLabels[id] || id, M = window.KiwiMenuI18n;
      if (!M) return raw;
      const e = carteState.catI18n && carteState.catI18n[id];
      return e ? M.name({ name: raw, i18n: e }, carteLang()) : M.t(raw, carteLang());
    }
    function subLabelL(m) { const M = window.KiwiMenuI18n; if (!m || !m.subLabel) return ''; return M ? M.name({ name: m.subLabel, i18n: m.subI18n || null }, carteLang()) : m.subLabel; }
    function lineName(l) { const M = window.KiwiMenuI18n; return (M && l) ? M.t(String(l.name || ''), carteLang()) : ((l && l.name) || ''); }
    

    function renderMenu() {
      const soldOutAll = Array.isArray(carteState.soldOut) ? carteState.soldOut : [];
      if (!menuItems.length && !soldOutAll.length) {
        $('#menu-grid').innerHTML = emptyMenuHTML();
        if (window.lucide) try { window.lucide.createIcons(); } catch (_) {}
        return;
      }
      const inView = (m) => activeCat === 'all' || (m.cat === activeCat && (!activeSub || m.subId === activeSub));
      const items = activeCat === 'all' ? menuItems : menuItems.filter(inView);
      const soldOutTiles = soldOutAll.filter(inView).map(m => `
          <div class="menu-item is-86" data-86="${escTeam(String(m.id))}" data-cat="${m.cat}" style="--cat:${catColor[m.cat] || 'var(--forest)'}" role="button" tabindex="-1" aria-disabled="true">
            <span class="menu-item-86">Épuisé</span>
            <span class="menu-item-art">${menuArt(m.id, m.cat, m.name, m.subLabel)}</span>
            <span class="menu-item-cat">${escTeam(subLabelL(m) || catLabelL(m.cat) || '')}</span>
            <span class="menu-item-name">${escTeam(menuName(m))}</span>
            <span class="menu-item-foot"><span class="menu-item-price mono">${fmtMAD(m.price)}</span></span>
          </div>`).join('');
      // In order mode, qty comes from the table's live order; otherwise from cart
      const activeSource = (mode !== 'vrap' && selectedId)
        ? (tableOrders[selectedId] || []) : cart;
      $('#menu-grid').innerHTML = items.map(m => {
        // qty badge = total across every line of this dish (noted + plain)
        const qty = activeSource.filter(c => c.id === m.id).reduce((s, c) => s + c.qty, 0);
        const control = qty > 0
          ? `
            <span class="menu-item-stepper">
              <button class="step-btn step-minus" data-step="dec" aria-label="Retirer un">−</button>
              <span class="step-num mono">${qty}</span>
              <button class="step-btn step-plus"  data-step="inc" aria-label="Ajouter un">+</button>
            </span>
          `
          : `<span class="menu-item-add" aria-hidden="true">+</span>`;
        return `
          <div class="menu-item ${qty > 0 ? 'is-in-cart' : ''}" data-menu-id="${m.id}" data-cat="${m.cat}" style="--cat:${catColor[m.cat] || 'var(--forest)'}" role="button" tabindex="0">
            ${qty > 0 ? `<span class="menu-item-badge mono">${qty}</span>` : ''}
            <span class="menu-item-art">${menuArt(m.id, m.cat, m.name, m.subLabel)}</span>
            <span class="menu-item-cat">${m.formula ? '<span class="menu-item-optflag">Formule</span> · ' : ''}${escTeam(subLabelL(m) || catLabelL(m.cat) || '')}</span>
            <span class="menu-item-name">${escTeam(menuName(m))}</span>
            <span class="menu-item-foot">
              <span class="menu-item-price mono">${fmtMAD(m.price)}</span>
              ${control}
            </span>
          </div>
        `;
      }).join('') + soldOutTiles;
    }

    /* ─── Les options d'un produit ─────────────────────────────────────────
       Un café se commande avec trois laits et deux sucres, une entrecôte avec
       quatre cuissons. Le patron décrit ces choix UNE fois au tableau de bord ;
       le comptoir, lui, doit les POSER. D'où la règle : un produit qui porte des
       options n'entre pas dans la note d'un seul geste · la fenêtre s'ouvre, on
       répond, on ajoute. Sans ce temps d'arrêt la question ne serait jamais
       posée et la cuisine devinerait, ce qui veut dire qu'elle se tromperait.

       Un groupe « obligatoire » bloque l'ajout tant qu'il n'a pas de réponse :
       une entrecôte sans cuisson n'est pas une commande, c'est une question
       posée au cuisinier au moment où il n'a plus le temps d'y répondre. */
    function itemOptGroups(item) {
      const ids = (item && Array.isArray(item.opts)) ? item.opts : [];
      if (!ids.length) return [];
      const lib = carteState.opts || [];
      /* Un identifiant orphelin · groupe supprimé au bureau pendant que la
         caisse tournait · est écarté ici. Demander un choix qui n'existe plus
         ouvrirait une fenêtre sans réponse possible, et bloquerait la vente. */
      return ids.map(id => lib.find(g => g && g.id === id)).filter(Boolean);
    }
    const optSig  = (opts) => (opts || []).map(o => o.c).join('|');
    const optText = (opts) => (opts || []).map(o => o.cn).join(' · ');
    const optVisuals = (opts) => (opts || []).filter(o => o && (o.cn || o.name || o.label)).map(o => ({ emoji: o.e || o.emoji || '', name: o.cn || o.name || o.label }));

    /* Le papier garde une phrase lisible avec tous les choix. Le KDS reçoit en
       plus les repères visuels structurés (`optVisuals`) afin de pouvoir rendre
       l'emoji en grand sans confondre une option avec la note libre du serveur. */
    function kitchenNote(l) {
      const o = optText(l && l.opts), n = ((l && l.note) || '').trim();
      return (o && n) ? (o + ' · ' + n) : (o || n);
    }
    /* Le nom tel qu'il doit apparaître au client, sur le ticket :
       « Café (Lait végétal) ». Le rapport Z regroupe par baseName. Sans les options, deux lignes au même
       nom mais pas au même prix seraient indistinguables sur le reçu. */
    function lineLabel(l) {
      const o = optText(l && l.opts);
      return o ? (l.name + ' (' + o + ')') : l.name;
    }

    function nativeHapticLight() {
      try { window.dispatchEvent(new CustomEvent('kiwi:native-haptic', { detail: { kind: 'light' } })); } catch (_) {}
    }

    /* Paid, on the local record: the caller reaches this only after the sale (or
       the share) is journaled, so the runtime plays it as trigger 'local-record'
       with its own gesture id (design 2027, §15.3, §20.3). */
    function nativeHapticSuccess() {
      try { window.dispatchEvent(new CustomEvent('kiwi:native-haptic', { detail: { kind: 'success', gestureId: 'paid:' + Date.now() + ':' + Math.random().toString(36).slice(2, 8), trigger: 'local-record' } })); } catch (_) {}
    }

    /* The failed haptic: a refusal the cashier must feel without looking. */
    function nativeHapticDanger() {
      try { window.dispatchEvent(new CustomEvent('kiwi:native-haptic', { detail: { kind: 'danger' } })); } catch (_) {}
    }

    /* Promotions de la carte · le prix est FIGÉ quand l'article entre dans la
       note, comme sur un ticket papier : un thé commandé à 18 h 55 garde son
       prix d'happy hour même payé à 19 h 10. Le serveur refait le même calcul
       à l'envoi en cuisine (priceOrder) ; c'est lui qui fait foi. */
    function promoPrice(item, unit) {
      const P = window.KiwiMenuPromos;
      const hit = (P && carteState.promos && carteState.promos.length)
        ? P.resolve(carteState.promos, { itemId: item.id, catId: item.cat }, unit, Date.now()) : null;
      return hit ? { price: hit.price, promo: hit.promo } : { price: unit, promo: null };
    }
    /* Deux unités à deux prix différents ne s'empilent jamais sur une ligne. */
    function promoKey(stamp) {
      return (stamp && window.KiwiMenuPromos) ? window.KiwiMenuPromos.stackKey(stamp) : '';
    }
    function promoTag(l) {
      const p = l && l.promo;
      if (!p) return '';
      return `<span class="rp-item-promo">${kdsEsc(p.badge || '')} · ${kdsEsc(p.name || '')}<s class="mono">${fmtMAD(p.before * l.qty)}</s></span>`;
    }

    function pushCartLine(item, opts) {
      nativeHapticLight();
      try { window.KiwiHardware && window.KiwiHardware.warmPrinter && window.KiwiHardware.warmPrinter(); } catch (_) {}
      const sig = optSig(opts);
      const extra = (opts || []).reduce((s, x) => s + (+x.p || 0), 0);
      /* Une ligne à options ne se confond qu'avec une ligne AUX MÊMES options :
         deux cafés, l'un au lait végétal et l'autre nature, sont deux lignes.
         Les empiler enverrait un seul café en cuisine, et le second client
         attendrait une boisson que personne n'a commencée. */
      const priced = promoPrice(item, item.price + extra);
      const line = cart.find(c => c.id === item.id && !(c.note || '').trim() && (c.optSig || '') === sig
        && promoKey(c.promo) === promoKey(priced.promo));
      if (line) currentOrder().patchLine(line, { qty: +line.qty + 1 });
      else currentOrder().append(cart, Object.assign({ uid: newLineUid(), id: item.id, name: item.name, price: priced.price,
                       qty: 1, note: '', opts: (opts || []).slice(), optSig: sig },
                       priced.promo ? { promo: priced.promo } : null));

      // Brief pop animation on the card
      const card = document.querySelector(`.menu-item[data-menu-id="${item.id}"]`);
      if (card) {
        card.classList.remove('pop');
        void card.offsetWidth;
        card.classList.add('pop');
      }
      renderMenu();
      renderCart();
    }

    
    function closeOptSheet() { if (optVeil) { optVeil.classList.remove('is-open'); optVeil.onclick = null; } }
    function openOptSheet(item, groups, onChosen) {
      if (!optVeil) {
        optVeil = document.createElement('div');
        optVeil.className = 'cloture-veil opt-veil';
        optVeil.setAttribute('role', 'dialog');
        optVeil.setAttribute('aria-modal', 'true');
        document.body.appendChild(optVeil);
      }
      const picked = Object.create(null);
      groups.forEach(g => { picked[g.id] = []; });

      function paint() {
        const missing = groups.filter(g => g.required && !picked[g.id].length);
        let extra = 0;
        groups.forEach(g => picked[g.id].forEach(cid => {
          const c = g.choices.find(x => x.id === cid); if (c) extra += (+c.price || 0);
        }));
        optVeil.innerHTML = `
          <div class="cloture-card opt-card">
            <div class="clo-eyebrow">${kdsEsc(item.name)}</div>
            <div class="clo-title">Options</div>
            <div class="opt-groups">${groups.map(g => `
              <div class="opt-g">
                <div class="opt-g-h">${kdsEsc(g.name)}${g.required ? '<i class="req">obligatoire</i>' : ''}</div>
                <div class="opt-g-c">${g.choices.map(c => `
                  <button type="button" class="opt-c${picked[g.id].indexOf(c.id) >= 0 ? ' on' : ''}"
                          data-og="${kdsEsc(g.id)}" data-oc="${kdsEsc(c.id)}">
                    <span>${c.emoji ? `${kdsEsc(c.emoji)} ` : ''}${kdsEsc(c.name)}</span>${c.price ? `<b class="mono">+${fmtMAD(c.price)}</b>` : ''}
                  </button>`).join('')}</div>
              </div>`).join('')}</div>
            ${missing.length ? `<div class="opt-miss">À choisir : ${missing.map(g => kdsEsc(g.name)).join(', ')}</div>` : ''}
            <div class="clo-actions">
              <button class="clo-btn primary" data-opt-ok ${missing.length ? 'disabled' : ''}>
                <span>Ajouter · ${fmtMAD(item.price + extra)}</span>
              </button>
            </div>
            <div class="clo-foot"><button data-opt-cancel>Annuler</button></div>
          </div>`;
      }
      optVeil.onclick = (e) => {
        const btn = e.target.closest('[data-oc]');
        if (btn) {
          const gid = btn.getAttribute('data-og'), cid = btn.getAttribute('data-oc');
          const g = groups.find(x => x.id === gid); if (!g) return;
          const cur = picked[gid], at = cur.indexOf(cid);
          /* « Plusieurs choix » cumule ; « un seul » remplace. Et re-toucher le
             choix déjà pris le retire · sans quoi un groupe facultatif
             deviendrait impossible à laisser vide une fois effleuré. */
          if (g.kind === 'many') { if (at >= 0) cur.splice(at, 1); else cur.push(cid); }
          else picked[gid] = (at >= 0) ? [] : [cid];
          paint(); return;
        }
        if (e.target === optVeil || e.target.closest('[data-opt-cancel]')) { closeOptSheet(); return; }
        if (e.target.closest('[data-opt-ok]')) {
          /* Les choix partent dans l'ordre des groupes du patron, pas dans
             l'ordre où le vendeur a tapé : le ticket de cuisine se lit toujours
             de la même façon, quel que soit le doigt qui l'a composé. */
          const chosen = [];
          groups.forEach(g => picked[g.id].forEach(cid => {
            const c = g.choices.find(x => x.id === cid);
            if (c) chosen.push({ g: g.id, gn: g.name, c: c.id, cn: c.name, e: c.emoji || '', p: +c.price || 0 });
          }));
          closeOptSheet();
          /* La feuille sert aux deux prises de commande : à emporter ET table.
             L'appelant choisit seulement où ranger la ligne une fois les
             réponses obtenues ; la question, les prix et les repères KDS sont
             rigoureusement les mêmes dans les deux modes. */
          (onChosen || pushCartLine)(item, chosen);
        }
      };
      paint();
      optVeil.classList.add('is-open');
    }

    function standaloneMenuItem(itemId) {
      const source = (carteState.formulaItems || []).find(m => String(m.id) === String(itemId)) || menuItems.find(m => String(m.id) === String(itemId));
      if (source && (source.archived || source.formulaOnly || source.avail === false)) { toast('Article non vendable individuellement'); return null; }
      return menuItems.find(m => m.id === itemId) || null;
    }

    function addToCart(itemId) {
      const item = standaloneMenuItem(itemId);
      if (!item) return;
      if (item.formula && Array.isArray(item.formula.slots) && item.formula.slots.length) {
        openCaisseFormula(item, (parent, parts) => { currentOrder().append(cart, parent, ...parts); nativeHapticLight(); renderMenu(); renderCart(); });
        return;
      }
      const groups = itemOptGroups(item);
      if (groups.length) { openOptSheet(item, groups); return; }
      pushCartLine(item, []);
    }

    function formulaInitialSelections(slots, groups, initial) {
      const parent = initial && initial.parent;
      const parts = initial && Array.isArray(initial.parts) ? initial.parts : [];
      const picked = Object.fromEntries(slots.map(slot => {
        const indexes = parts
          .filter(part => String(part.formulaSlotId || '') === String(slot.id || ''))
          .map(part => slot.choices.findIndex(choice => String(choice.itemId || '') === String(part.id || '')))
          .filter(index => index >= 0);
        return [slot.id, [...new Set(indexes)]];
      }));
      const parentOpts = parent && Array.isArray(parent.opts) ? parent.opts : [];
      const optPicked = Object.fromEntries(groups.map(group => [group.id, parentOpts
        .filter(option => String(option.g || option.group || '') === String(group.id || ''))
        .map(option => group.choices.find(choice => String(choice.id) === String(option.c || option.choice || '')))
        .filter(Boolean)
        .map(choice => choice.id)]));
      return { picked, optPicked };
    }

    function buildCaisseFormulaGroup(item, slots, groups, picked, optPicked, choiceItem, initial) {
      const previousParent = initial && initial.parent;
      const previousParts = initial && Array.isArray(initial.parts) ? initial.parts : [];
      const formulaUid = String((previousParent && previousParent.formulaUid) || newLineUid());
      const qty = Math.max(1, +(previousParent && previousParent.qty) || 1);
      const usedPrevious = new Set();
      const parts = [];
      const opts = [];
      let formulaExtra = 0;
      let optExtra = 0;

      slots.forEach(slot => (picked[slot.id] || []).forEach(choiceIndex => {
        const choice = slot.choices[choiceIndex];
        const target = choice && choiceItem(choice);
        if (!target) return;
        formulaExtra += +choice.extra || 0;
        const previousIndex = previousParts.findIndex((part, index) => !usedPrevious.has(index)
          && String(part.formulaSlotId || '') === String(slot.id || '')
          && String(part.id || '') === String(target.id || ''));
        const previous = previousIndex >= 0 ? previousParts[previousIndex] : null;
        if (previousIndex >= 0) usedPrevious.add(previousIndex);
        parts.push(Object.assign({}, previous || {}, {
          uid: (previous && previous.uid) || newLineUid(),
          id: target.id, name: target.name, price: 0, qty,
          /* Chargé une seule fois sur le parent, mais conservé sur le choix
             pour que le reçu client puisse expliquer le prix de la formule. */
          formulaExtra: Math.max(0, +choice.extra || 0),
          note: (previous && previous.note) || '', kind: 'formula-part',
          formulaUid, formulaName: item.name, slotLabel: slot.label || '',
          formulaSlotId: slot.id,
          lineId: (previous && previous.lineId) || `${formulaUid}-${slot.id}-${choiceIndex}`,
        }));
      }));
      groups.forEach(group => (optPicked[group.id] || []).forEach(id => {
        const choice = group.choices.find(candidate => String(candidate.id) === String(id));
        if (!choice) return;
        optExtra += +choice.price || 0;
        opts.push({ g: group.id, gn: group.name, c: choice.id, cn: choice.name, e: choice.emoji || '', p: +choice.price || 0 });
      }));
      const parent = Object.assign({}, previousParent || {}, {
        uid: (previousParent && previousParent.uid) || formulaUid,
        id: item.id, name: item.name,
        price: item.price + formulaExtra + optExtra, basePrice: item.price,
        qty, note: (previousParent && previousParent.note) || '',
        kind: 'formula', formulaUid, formulaName: item.name,
        opts, optSig: optSig(opts),
      });
      return { parent, parts };
    }

    function openCaisseFormula(item, onChosen, initial) {
      const slots = item.formula.slots.filter(s => s && Array.isArray(s.choices) && s.choices.length);
      if (!slots.length) return;
      const groups = itemOptGroups(item);
      if (!optVeil) { optVeil = document.createElement('div'); optVeil.className = 'cloture-veil opt-veil'; document.body.appendChild(optVeil); }
      const initialSelections = formulaInitialSelections(slots, groups, initial);
      const picked = initialSelections.picked;
      const optPicked = initialSelections.optPicked;
      const editing = !!(initial && initial.parent);
      const choiceItem = c => (carteState.formulaItems || menuItems).find(m => String(m.id) === String(c.itemId) && !m.archived && m.avail !== false);
      function paint() {
        const missingSlots = slots.filter(s => picked[s.id].length < Math.max(0, +s.min || 0));
        const missingGroups = groups.filter(g => g.required && !optPicked[g.id].length);
        const extra = slots.reduce((n, s) => n + picked[s.id].reduce((x, i) => x + (+s.choices[i].extra || 0), 0), 0)
          + groups.reduce((n, g) => n + optPicked[g.id].reduce((x, id) => { const c=g.choices.find(v=>v.id===id); return x+(c ? +c.price||0 : 0); }, 0), 0);
        const regularHTML = groups.map(g => `<div class="opt-g"><div class="opt-g-h">${kdsEsc(g.name)}${g.required?'<i class="req">obligatoire</i>':''}</div><div class="opt-g-c">${g.choices.map(c=>`<button type="button" class="opt-c${optPicked[g.id].includes(c.id)?' on':''}" data-og="${kdsEsc(g.id)}" data-oc="${kdsEsc(c.id)}"><span>${c.emoji?`${kdsEsc(c.emoji)} `:''}${kdsEsc(c.name)}</span>${c.price?`<b class="mono">+${fmtMAD(c.price)}</b>`:''}</button>`).join('')}</div></div>`).join('');
        const missing = missingSlots.map(s=>s.label||'Choix').concat(missingGroups.map(g=>g.name));
        optVeil.innerHTML = `<div class="cloture-card opt-card"><div class="clo-eyebrow">${kdsEsc(item.name)}</div><div class="clo-title">Formule & options</div><div class="opt-groups">${slots.map(s => `<div class="opt-g"><div class="opt-g-h">${kdsEsc(s.label || 'Choix')}<i class="req">${+s.min || 0}–${Math.max(+s.min || 0, +s.max || 1)}</i></div><div class="opt-g-c">${s.choices.map((c,i) => { const target=choiceItem(c); return target ? `<button type="button" class="opt-c${picked[s.id].includes(i)?' on':''}" data-fslot="${kdsEsc(s.id)}" data-fchoice="${i}"><span>${kdsEsc(target.name)}</span>${+c.extra?`<b class="mono">+${fmtMAD(+c.extra)}</b>`:''}</button>`:''; }).join('')}</div></div>`).join('')}${regularHTML}</div>${missing.length?`<div class="opt-miss">À choisir : ${missing.map(kdsEsc).join(', ')}</div>`:''}<div class="clo-actions"><button class="clo-btn primary" data-formula-ok ${missing.length?'disabled':''}>${editing ? 'Enregistrer' : 'Ajouter'} · ${fmtMAD(item.price+extra)}</button></div><div class="clo-foot"><button data-opt-cancel>Annuler</button></div></div>`;
      }
      optVeil.onclick = e => {
        const b=e.target.closest('[data-fchoice]');
        if (b) { const s=slots.find(x=>String(x.id)===b.dataset.fslot), a=picked[s.id], i=+b.dataset.fchoice, at=a.indexOf(i), max=Math.max(+s.min||0,+s.max||1); if(at>=0)a.splice(at,1); else if(max===1){a.splice(0,a.length,i);} else if(a.length<max)a.push(i); paint(); return; }
        const ob=e.target.closest('[data-oc]');
        if(ob){const g=groups.find(x=>String(x.id)===ob.dataset.og);if(!g)return;const a=optPicked[g.id],id=ob.dataset.oc,at=a.indexOf(id);if(g.kind==='many'){if(at>=0)a.splice(at,1);else a.push(id);}else optPicked[g.id]=at>=0?[]:[id];paint();return;}
        if(e.target===optVeil||e.target.closest('[data-opt-cancel]')){closeOptSheet();return;}
        if(e.target.closest('[data-formula-ok]')) { const group=buildCaisseFormulaGroup(item,slots,groups,picked,optPicked,choiceItem,initial); closeOptSheet(); onChosen(group.parent,group.parts); }
      };
      paint(); optVeil.classList.add('is-open');
    }

    /* Slice B · « Montant libre » : une ligne à prix ouvert ringée dans
       l'addition (vente rapide) ou sur la table en cours (prise de commande). */
    function addOpenLine(amount) {
      const amt = money(amount);
      if (!(amt > 0)) return;
      nativeHapticLight();
      if (mode === 'order' && selectedId) {
        currentOrder().append((currentOrder().replaceTable(selectedId, tableOrders[selectedId] || [])), {
          uid: newLineUid(), id: 'libre', name: 'Article libre', price: amt, qty: 1, note: ''
        });
        startTableTimer(selectedId);
        renderOrderPanel(selectedId);
      } else {
        currentOrder().append(cart, { uid: newLineUid(), id: 'libre', name: 'Article libre', price: amt,
                    qty: 1, note: '', opts: [], optSig: '' });
        renderCart();
      }
      toast('Article libre · ' + fmtMAD(amt));
    }
    


    /* Une formule et ses composants gratuits forment une seule ligne métier.
       Les laisser diverger fabrique des boissons à 0 MAD dès que le parent est
       retiré. formulaUid est le lien strict : un article ajouté séparément,
       même avec le même id qu'une boisson de formule, reste indépendant. */
    function formulaGroup(lines, line) {
      if (!line) return [];
      if (!line.formulaUid) return [line];
      return (lines || []).filter(candidate => candidate.formulaUid === line.formulaUid);
    }

    function applyGroupedLineQtyDelta(lines, line, delta) {
      if (!line || line.kind === 'formula-part') return lines || [];
      formulaGroup(lines, line).forEach(member => {
        currentOrder().patchLine(member, { qty: Math.max(0, (+member.qty || 0) + delta) });
      });
      return (lines || []).filter(member => (+member.qty || 0) > 0);
    }

    function removeGroupedLine(lines, uid) {
      const line = (lines || []).find(candidate => candidate.uid === uid);
      if (!line) return lines || [];
      if (line.formulaUid) return lines.filter(candidate => candidate.formulaUid !== line.formulaUid);
      return lines.filter(candidate => candidate.uid !== uid);
    }

    function replaceFormulaGroup(lines, formulaUid, replacement) {
      const source = lines || [];
      const firstIndex = source.findIndex(line => line.formulaUid === formulaUid);
      if (firstIndex < 0) return source;
      const next = [];
      source.forEach((line, index) => {
        if (index === firstIndex) next.push(replacement.parent, ...replacement.parts);
        if (line.formulaUid !== formulaUid) next.push(line);
      });
      return next;
    }

    function editFormulaLine(uid) {
      const isVrap = mode === 'vrap';
      const lines = isVrap ? cart : ((selectedId && tableOrders[selectedId]) || []);
      const parent = lines.find(line => line.uid === uid);
      if (!parent || parent.kind !== 'formula' || parent.sent) return;
      const item = (carteState.formulaItems || []).find(candidate => String(candidate.id) === String(parent.id))
        || menuItems.find(candidate => String(candidate.id) === String(parent.id));
      if (!item || !item.formula || !Array.isArray(item.formula.slots)) {
        toast('Cette formule n’est plus disponible sur la carte');
        return;
      }
      const initial = {
        parent,
        parts: lines.filter(line => line.kind === 'formula-part' && line.formulaUid === parent.formulaUid),
      };
      openCaisseFormula(item, (nextParent, nextParts) => {
        const replacement = { parent: nextParent, parts: nextParts };
        if (isVrap) {
          currentOrder().replaceCart(replaceFormulaGroup(cart, parent.formulaUid, replacement));
          renderCart();
        } else if (selectedId && tableOrders[selectedId]) {
          currentOrder().replaceTable(selectedId, replaceFormulaGroup(tableOrders[selectedId], parent.formulaUid, replacement));
          renderOrderPanel(selectedId);
        }
        nativeHapticLight();
        renderMenu();
        renderOrderReviewContent();
      }, initial);
    }

    /* Cart panel +/- · targets one specific line by its uid. */
    function changeCartLineQty(uid, delta) {
      const line = cart.find(c => c.uid === uid);
      if (!line) return;
      /* ── Le plat est DÉJÀ en cuisine ──────────────────────────────────────
       * Retirer une ligne d'une commande à emporter déjà transmise se faisait
       * EN SILENCE : la ligne quittait l'addition, et la brigade continuait de
       * préparer un plat que plus personne n'attend ni ne paie. Aucun motif,
       * aucune alerte, aucune trace dans `kitchen_voids` — donc rien à
       * expliquer au stock en fin de journée.
       *
       * La salle avait déjà la bonne réponse (changeTableOrderLineQty prévient
       * la cuisine) ; elle n'avait simplement jamais été branchée au comptoir.
       * Le client change d'avis ou n'est pas satisfait : on annule
       * l'article, on prévient la cuisine, et ça ne passe PAS par un
       * remboursement — tant que la commande n'est pas encaissée, il n'y a
       * aucun argent à rendre.
       *
       * `held` = pas encore payée, donc pas encore partie en cuisine : rien à
       * annuler, la ligne se retire comme dans un panier neuf. */
      const editing = vrapEditingNum != null
        ? kdsOrders.find(x => x && x.num === vrapEditingNum) : null;
      if (delta < 0 && editing && editing.opId && editing.status !== 'held') {
        cancelCaisseLineImmediately(null, line, { orderId: editing.opId, cart: true });
        return;
      }
      currentOrder().replaceCart(applyGroupedLineQtyDelta(cart, line, delta));
      renderMenu();
      renderCart();
    }

    /* Menu-card − · removes one unit of a dish (the plain line, else the last). */
    function cartMinusMenu(itemId) {
      const lines = cart.filter(c => c.id === itemId);
      const line = lines.find(c => !(c.note || '').trim()) || lines[lines.length - 1];
      if (line) changeCartLineQty(line.uid, -1);
    }

    function clearCart() {
      if (vrapResumedExpiredId) {
        dismissExpired(vrapResumedExpiredId);
        vrapResumedExpiredId = null;
      }
      currentOrder().replaceCart([]);
      currentOrder().setDiscount(null);
      renderMenu();
      renderCart();
      if (typeof renderVrapBoard === 'function') renderVrapBoard();
    }

    /* « Souvent avec… » : une ligne en bas de la commande qui propose l'article
       que les tickets de ce commerce associent le plus souvent au dernier
       ajouté (assets/caisse-pairs.js, calcul serveur sur 28 jours). Seulement
       sur une vraie caisse, seulement un article vendable seul en ce moment, et
       jamais un article déjà dans la commande. Le toucher passe par le chemin
       d'ajout normal : options, formule et plat épuisé y sont traités. */
    function pairSellable(id) {
      const m = menuItems.find(x => String(x.id) === String(id));
      if (!m || m.archived || m.formulaOnly || m.avail === false) return false;
      return !(carteState.soldOut || []).some(x => String(x.id) === String(id));
    }
    function pairSuggestHtml(order, scope) {
      if (IS_DEMO || !window.KiwiPairs || !KiwiPairs.suggest) return '';
      const ids = [];
      (order || []).forEach(l => { if (l && l.kind !== 'formula-part' && !l.sent && l.id != null) ids.push(String(l.id)); });
      let s = null;
      try { s = KiwiPairs.suggest(ids, pairSellable, scope); } catch (_) { s = null; }
      if (!s) return '';
      const m = menuItems.find(x => String(x.id) === s.id);
      const lead = menuItems.find(x => String(x.id) === s.lead);
      if (!m || !lead) return '';
      const pct = Math.round((Number(s.share) || 0) * 100);
      /* Dans la langue de la caisse, noms de plats compris (menuName), comme
         les tuiles : le balayage de caisse-lang.js ne reconnaît pas une
         phrase qui porte des noms. */
      const t = KiwiPairs.say ? KiwiPairs.say(carteLang()) : null;
      if (!t) return '';
      const lName = kdsEsc(menuName(lead)), mName = kdsEsc(menuName(m));
      return `
        <div class="rp-pair" data-pair-scope="${kdsEsc(scope)}">
          <span class="rp-pair-txt">${t.lead(lName, mName)}</span>
          <span class="rp-pair-why">${t.why(pct, lName)}</span>
          <button type="button" class="rp-pair-add" data-pair-add="${kdsEsc(m.id)}" aria-label="${t.add(mName)}">+ ${fmtMAD(m.price)}</button>
          <button type="button" class="rp-pair-x" data-pair-dismiss="${kdsEsc(m.id)}" aria-label="${t.dismiss(mName, scope.indexOf('table:') === 0 ? 'table' : 'order')}">×</button>
        </div>`;
    }

    function renderCart() {
      // The five-second shift snapshot is too late when iOS kills a backgrounded app.
      // Record every draft change before painting the receipt.
      if (document.documentElement.classList.contains('kiwi-native')) { try { persistShift(); } catch (_) {} }
      const gross = cart.reduce((s, l) => s + l.price * l.qty, 0);
      const itemCount = cart.reduce((s, l) => s + l.qty, 0);

      if (cart.length === 0) {
        try { window.KiwiPairs && KiwiPairs.reset('cart'); } catch (_) {}
        showEmpty();
        return;
      }

      const discAmt = vrapDiscountAmount(gross);
      const net = Math.max(0, gross - discAmt);
      const editing = vrapEditingNum != null;

      // Show active panel with cart contents
      $('#rp-empty').hidden = true;
      $('#rp-empty').style.display = 'none';
      const active = $('#rp-active');
      active.hidden = false;
      active.style.display = 'flex';

      // Hide server row, split card, and table tools in vrap mode
      const sr = $('#rp-server-row'); if (sr) sr.hidden = true;
      const sc = $('#rp-split-card'); if (sc) sc.hidden = true;
      const tt = $('#rp-table-tools'); if (tt) tt.hidden = true;

      // Header
      $('#rp-table').textContent = editing ? `À emporter · #${vrapEditingNum}` : 'À emporter';
      const sub = $('#rp-substatus');
      sub.dataset.flag = 'ka-yaklo';
      sub.textContent = editing
        ? `Commande #${vrapEditingNum} · ${itemCount} article${itemCount > 1 ? 's' : ''}`
        : `${itemCount} article${itemCount > 1 ? 's' : ''} · ${fmtMAD(net)}`;

      // Items with +/- controls
      let itemsHTML = cart.map(l => `
        <div class="rp-item rp-item--cart" data-cart-uid="${l.uid}">
          ${l.kind === 'formula-part' ? `<span class="rp-sent-qty">${l.qty}×</span>` : `<div class="qty-control">
            <button class="qty-btn" data-cart-action="dec" aria-label="Moins">−</button>
            <span class="qty-num mono">${l.qty}</span>
            <button class="qty-btn" data-cart-action="inc" aria-label="Plus">+</button>
          </div>`}
          <span class="rp-item-name">${lineName(l)}${(l.opts && l.opts.length) ? `<i class="rp-item-opts">${kdsEsc(optText(l.opts))}</i>` : ''}${promoTag(l)}</span>
          <span class="rp-item-price mono">${fmtMAD(l.price * l.qty)}</span>
          <input class="rp-item-note${(l.note || '').trim() ? ' has-note' : ''}" data-note-uid="${l.uid}"
            value="${kdsEsc(l.note || '')}" placeholder="Note cuisine, ex. bien chaud, sans oignon"
            aria-label="Note cuisine, ${kdsEsc(l.name)}" />
        </div>
      `).join('');
      if (discAmt > 0) {
        const tag = vrapDiscount.kind === 'pct' ? `Remise ${vrapDiscount.value} %` : 'Remise';
        itemsHTML += `
        <div class="rp-item rp-item--discount">
          <span class="rp-item-qty" style="cursor:pointer;" data-action="edit-discount" title="Modifier la remise"><i data-lucide="badge-percent"></i></span>
          <span class="rp-item-name" style="cursor:pointer;" data-action="edit-discount" title="Modifier la remise">${tag}${vrapDiscount.reason ? ' · ' + vrapDiscount.reason : ''}</span>
          <span class="rp-item-price mono" style="cursor:pointer;" data-action="edit-discount" title="Modifier la remise">−${fmtMAD(discAmt)}</span>
          <button type="button" class="rp-item-del-btn" data-action="remove-vrap-discount" title="Supprimer la remise" aria-label="Supprimer la remise">
            <i data-lucide="trash-2"></i>
          </button>
        </div>`;
      }
      itemsHTML += editing ? '' : pairSuggestHtml(cart, 'cart');
      $('#rp-items').innerHTML = itemsHTML;

      $('#rp-total').textContent = fmtMAD(net);
      window.CaisseFx && window.CaisseFx.countTotal();

      // Sync modal labels
      payMeta({ prefix: false, table: 'À emporter', covers: editing ? `#${vrapEditingNum}` : itemCount,
        unit: editing ? '' : (itemCount > 1 ? 'articles' : 'article') });
      $('#card-amount').textContent = fmtMADcents(net);
      $('#cash-amount').textContent = fmtMADcents(net);
      $('#cash-received').value = net;
      updateRendu();
      showPayButtons(false);
      /* Une commande OrderPro à emporter s'ouvre dans le builder pour pouvoir
         être encaissée, mais elle reste `held` tant que personne ne l'a envoyée.
         Les deux gestes doivent donc rester visibles et indépendants. */
      const editingOrder = editing ? kdsOrders.find(x => x && x.num === vrapEditingNum) : null;
      $('#rp-send-kitchen').hidden = editing && !(editingOrder && editingOrder.status === 'held');
      if (discAmt > 0 && window.lucide) lucide.createIcons();
    }

    

    function skStatusOf(it){ if (it.stock <= 0) return 'out'; if (it.stock <= it.reorder) return 'low'; return 'ok'; }
    function skAlertCount(){ return stockItems.filter(i => skStatusOf(i) !== 'ok').length; }
    function skTotalValue(){ return Math.round(stockItems.reduce((s,i) => s + i.stock * i.cost, 0)); }
    function updateStockBadge(){ const el = $('#stock-alert-count'); if (el){ const n = skAlertCount(); el.textContent = n; el.classList.toggle('warn', n > 0); } }

    
/* Propriétaire du panier courant et des lignes de table. Les projections sont
 * protégées récursivement, les entrées sont copiées, aucune dépendance DOM. */
function createCurrentOrder(initial = {}, publish = () => {}) {
  const rawOf = new WeakMap(), views = new WeakMap();
  const copy = value => {
    if (!value || typeof value !== 'object') return value;
    if (rawOf.has(value)) return rawOf.get(value);
    if (value instanceof Date) return new Date(value);
    return Array.isArray(value) ? value.map(copy) : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)]));
  };
  const view = raw => {
    if (!raw || typeof raw !== 'object') return raw;
    if (!views.has(raw)) {
      const proxy = new Proxy(raw, {
        get: (target, key) => view(Reflect.get(target, key)),
        set() { throw new TypeError('Panier en lecture seule'); },
        deleteProperty() { throw new TypeError('Panier en lecture seule'); },
        defineProperty() { throw new TypeError('Panier en lecture seule'); },
        setPrototypeOf() { throw new TypeError('Panier en lecture seule'); },
        preventExtensions() { throw new TypeError('Panier en lecture seule'); },
        getOwnPropertyDescriptor(target, key) {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
          return descriptor && 'value' in descriptor ? { ...descriptor, value: view(descriptor.value) } : descriptor;
        },
      });
      views.set(raw, proxy); rawOf.set(proxy, raw);
    }
    return views.get(raw);
  };
  const orderTables = initial.tables || {};
  Object.keys(orderTables).forEach(id => { orderTables[id] = copy(orderTables[id]); });
  let cart = copy(initial.cart || []), discount = copy(initial.discount || null), editing = initial.editing ?? null;
  const changed = () => { publish(api); };
  const replaceTable = (id, lines) => { orderTables[id] = copy(lines); changed(); return view(orderTables[id]); };
  const replaceCart = lines => { cart = copy(lines); changed(); return view(cart); };
  const patchLine = (line, patch, removed = []) => {
    const raw = rawOf.get(line) || line;
    Object.entries(patch).forEach(([key, value]) => { raw[key] = copy(value); });
    removed.forEach(key => { delete raw[key]; }); changed(); return view(raw);
  };
  const api = Object.freeze({
    get tables() { return view(orderTables); }, get cart() { return view(cart); },
    get discount() { return view(discount); }, get editing() { return editing; },
    replaceTable, replaceCart, patchLine,
    removeTable(id) { delete orderTables[id]; changed(); },
    restoreTables(input) { Object.keys(orderTables).forEach(id => { delete orderTables[id]; }); Object.entries(input).forEach(([id, lines]) => { orderTables[id] = copy(lines); }); changed(); },
    append(lines, ...added) { (rawOf.get(lines) || lines).push(...added.map(copy)); changed(); },
    setDiscount(value) { discount = copy(value); changed(); },
    setEditing(value) { editing = value; changed(); },
  });
  return api;
}

/* L'adaptateur conserve les noms des projections classiques. Les bacs à sable
 * historiques peuvent aussi fournir leurs lignes avant la première opération. */
function currentOrder() {
  if (!currentOrder.owner) {
    let initial = {};
    try { initial.tables = tableOrders; } catch (_) {}
    try { initial.cart = cart; initial.discount = vrapDiscount; initial.editing = vrapEditingNum; } catch (_) {}
    currentOrder.owner = createCurrentOrder(initial, owner => {
      if (typeof cart !== 'undefined') cart = owner.cart;
      if (typeof vrapDiscount !== 'undefined') vrapDiscount = owner.discount;
      if (typeof vrapEditingNum !== 'undefined') vrapEditingNum = owner.editing;
    });
  }
  return currentOrder.owner;
}
