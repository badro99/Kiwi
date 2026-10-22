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

    /* ---------- DAfr days ---------- */
    const dafrDays = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const monthsEn = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

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
    tickClock();
    setInterval(tickClock, 1000);

    /* ---------- Server / staff data ---------- */
    /* status: 'on' (3la khidma) | 'pause' (en pause) | 'off' (clocked out) */
    const servers = {
      YA: { id: 'YA', name: 'Yassir A.',  color: '#3FB67A', status: 'on',    breakStart: null, since: '08:12' },
      ME: { id: 'ME', name: 'Mehdi K.',   color: '#1F5D3C', status: 'pause', breakStart: Date.now() - 8 * 60 * 1000, since: '08:00' },
      KA: { id: 'KA', name: 'Karim B.',   color: '#D49F2E', status: 'on',    breakStart: null, since: '08:30' },
      SO: { id: 'SO', name: 'Sofia L.',   color: '#7A5BC9', status: 'on',    breakStart: null, since: '11:00' },
      HA: { id: 'HA', name: 'Hamza T.',   color: '#B85245', status: 'off',   breakStart: null, since: '·' },
    };
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
    const ROSTER_PALETTE = ['#3FB67A', '#1F5D3C', '#D49F2E', '#2B5C68', '#7A5BC9', '#B26B0F', '#4F7560', '#B85245'];
    let liveTeamMerchant = '';
    let liveTeamBusy = false;
    let liveTeamTimer = null;
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
    /* This poll ran every second, all day, on every till: the largest single
       share of the server bill. Clock-ins made on this till update it
       directly, so the poll only catches other devices: 5 s on screen,
       30 s in the background, and at once when the till comes back. */
    const LIVE_TEAM_VISIBLE_MS = 5000, LIVE_TEAM_HIDDEN_MS = 30000;
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

    /* ---------- Table data ---------- */
    /* status:  khawya | a-commander | ka-yaklo | bgha-ykhlass | khlass           */
    /* server:  server id assigned (only meaningful when table is occupied)      */
    /* floor:   0 = rez-de-chaussée, 1 = 1er étage                               */
    /* shape:   'rect' | 'round' | 'square'                                      */
    /* anchor:  'banquette-south' (banquette to the south, chairs north only)   */
    /*          'banquette-ronde' (3/4 leather bench wraps north, chairs south) */
    /*          undefined = chairs all around                                    */
    /* x,y:     top-left position, in % of containing room                       */
    /* w,h:     tabletop size, in % of room (round tables ignore h · square)    */
    const tables = {
      /* ─── Rez-de-chaussée ─────────────────────────────────────────────────
         Intérieur (4) + Terrasse extérieure (5) = 9 tables                     */

      // Inside, by the front window · Mehdi & Karim's tables
      T7:  { floor: 0, zone: 'interieur', shape: 'round',  covers: 2, size: 2, x: 22, y: 12, w: 7,  h: 13, status: 'khlass',       elapsed: 0,  server: 'ME' },
      T8:  { floor: 0, zone: 'interieur', shape: 'round',  covers: 2, size: 2, x: 33, y: 12, w: 7,  h: 13, status: 'khawya',       elapsed: 0,  server: 'ME' },
      T22: { floor: 0, zone: 'interieur', shape: 'round',  covers: 4, size: 4, x: 47, y: 11, w: 11, h: 20, status: 'ka-yaklo',     elapsed: 28, server: 'ME' },
      T9:  { floor: 0, zone: 'interieur', shape: 'round',  covers: 2, size: 2, x: 14, y: 78, w: 7,  h: 13, status: 'ka-yaklo',     elapsed: 14, server: 'KA' },

      // Terrasse · Karim + Sofia
      T12: { floor: 0, zone: 'terrasse',  shape: 'square', covers: 4, size: 4, x: 6,  y: 24, w: 11, h: 52, status: 'khawya',       elapsed: 0,  server: 'KA' },
      T13: { floor: 0, zone: 'terrasse',  shape: 'round',  covers: 4, size: 4, x: 21, y: 24, w: 13, h: 52, status: 'ka-yaklo',     elapsed: 19, server: 'KA' },
      T14: { floor: 0, zone: 'terrasse',  shape: 'square', covers: 4, size: 4, x: 38, y: 24, w: 11, h: 52, status: 'khawya',       elapsed: 0,  server: 'SO' },
      T15: { floor: 0, zone: 'terrasse',  shape: 'square', covers: 4, size: 4, x: 53, y: 24, w: 11, h: 52, status: 'ka-yaklo',     elapsed: 55, server: 'SO' },
      T16: { floor: 0, zone: 'terrasse',  shape: 'round',  covers: 6, size: 6, x: 72, y: 16, w: 18, h: 68, status: 'ka-yaklo',     elapsed: 38, server: 'SO' },

      /* ─── 1er étage ────────────────────────────────────────────────────────
         14 tables : 6 fenêtres, banquette ronde centre + flanc, banquette
         longue sud (4), banquette d'angle ronde groupe                          */

      // Window-side row (north wall) · Yassir's section
      T1:  { floor: 1, zone: 'etage', shape: 'rect',  covers: 4, size: 4, x: 12, y: 8,  w: 11, h: 11, status: 'ka-yaklo',     elapsed: 45, server: 'YA' },
      T2:  { floor: 1, zone: 'etage', shape: 'round', covers: 2, size: 2, x: 26, y: 7,  w: 8,  h: 14, status: 'bgha-ykhlass', elapsed: 12, server: 'YA' },
      T3:  { floor: 1, zone: 'etage', shape: 'rect',  covers: 4, size: 4, x: 38, y: 8,  w: 11, h: 11, status: 'khawya',       elapsed: 0,  server: 'YA' },
      T4:  { floor: 1, zone: 'etage', shape: 'rect',  covers: 4, size: 4, x: 51, y: 8,  w: 11, h: 11, status: 'ka-yaklo',     elapsed: 22, server: 'YA' },
      T19: { floor: 1, zone: 'etage', shape: 'round', covers: 2, size: 2, x: 65, y: 7,  w: 8,  h: 14, status: 'ka-yaklo',     elapsed: 28, server: 'YA' },
      T10: { floor: 1, zone: 'etage', shape: 'round', covers: 2, size: 2, x: 76, y: 7,  w: 8,  h: 14, status: 'khawya',       elapsed: 0,  server: 'KA' },

      // Banquette ronde · centerpiece (Mehdi's table, anchored to the C-arc)
      T5:  { floor: 1, zone: 'etage', shape: 'round', covers: 6, size: 6, x: 44, y: 41, w: 12, h: 19, anchor: 'banquette-ronde', status: 'ka-yaklo', elapsed: 67, server: 'ME' },

      // Mid-room round tables flanking the banquette ronde
      T17: { floor: 1, zone: 'etage', shape: 'round', covers: 4, size: 4, x: 17, y: 44, w: 11, h: 18, status: 'bgha-ykhlass', elapsed: 5,  server: 'SO' },
      T18: { floor: 1, zone: 'etage', shape: 'round', covers: 4, size: 4, x: 70, y: 44, w: 11, h: 18, status: 'khawya',       elapsed: 0,  server: 'SO' },

      // Long banquette against the south wall · 4 tables share the bench
      T6:  { floor: 1, zone: 'etage', shape: 'rect',  covers: 5, size: 6, x: 12, y: 74, w: 16, h: 9,  anchor: 'banquette-south', status: 'bgha-ykhlass', elapsed: 8,  server: 'ME' },
      T11: { floor: 1, zone: 'etage', shape: 'rect',  covers: 3, size: 4, x: 30, y: 74, w: 11, h: 9,  anchor: 'banquette-south', status: 'ka-yaklo',     elapsed: 31, server: 'KA' },
      T20: { floor: 1, zone: 'etage', shape: 'rect',  covers: 4, size: 4, x: 43, y: 74, w: 11, h: 9,  anchor: 'banquette-south', status: 'khawya',       elapsed: 0,  server: 'YA' },
      T21: { floor: 1, zone: 'etage', shape: 'rect',  covers: 4, size: 4, x: 56, y: 74, w: 11, h: 9,  anchor: 'banquette-south', status: 'khawya',       elapsed: 0,  server: 'YA' },

      // Banquette ronde d'angle · second group table (south-east corner)
      T23: { floor: 1, zone: 'etage', shape: 'round', covers: 6, size: 6, x: 73, y: 71, w: 14, h: 22, anchor: 'banquette-ronde', status: 'khawya', elapsed: 0,  server: 'SO' },
    };

    // A REAL / paired store opens with a BLANK floor · NOT Café Atlas's specific
    // 24-table geometry (its named layout · T7 terrasse, the banquette ronde, the
    // 1er étage rows · is demo data, and rendering one venue's floor inside another
    // is the P7 leak). Delete every seeded table so the plan renders empty
    // ("0 / 0 occupées") until the store builds its own floor; the roster rename in
    // applyStoreIdentity then has no demo tables left to paint a section avatar on.
    // KiwiEnv loads before this script, so isReal() is ready here; the local demo
    // (unpaired localhost, storeIsReal false) keeps its full mid-service floor
    // byte-for-byte. renderSalle() and the occupancy counters tolerate empty tables.
    try { if (storeIsReal()) Object.keys(tables).forEach((k) => delete tables[k]); } catch (_) {}

    /* ── LA FRONTIÈRE DÉMO / RÉEL ────────────────────────────────────────────
     * Café Atlas est une vitrine, pas un client. Tout ce qui est semé plus bas ·
     * la carte, les commandes de table, les recettes cuisine · n'existe que
     * pour lui. Un vrai commerçant appairé qui voit « Tajine kefta 180 MAD »
     * dans sa caisse ne voit pas une démo : il voit un logiciel qui invente des
     * plats qu'il ne vend pas, et il peut les encaisser.
     *
     * Le drapeau est figé au montage (comme assets/pos-boutique.js:457) : un
     * appairage en cours de session ne doit pas réécrire une carte à moitié
     * servie. `storeIsReal()` est une déclaration de fonction, donc hissée ·
     * l'appel est légal ici malgré sa définition plus bas dans l'IIFE. */
    const IS_DEMO = !storeIsReal();
    /* Le drapeau figé a un angle mort : « Ouvrir la caisse sur cet appareil »
       appaire PENDANT l'amorçage (assets/caisse-pairing.js), donc après ce
       calcul. La caisse d'un vrai café s'ouvrait alors sur la carte de démo,
       35 plats à des prix inventés, encaissables. caisse-pairing lit ce
       drapeau et recharge une fois, avant que quoi que ce soit soit servi. */
    window.__kiwiCaisseBootedAsDemo = IS_DEMO;
    if (!IS_DEMO) {
      try {
        const pv = storePaired();
        document.title = 'Kiwi Caisse' + (pv && pv.name ? ' · ' + pv.name : '');
      } catch (_) { document.title = 'Kiwi Caisse'; }
    }

    /* ---------- Mock orders per table ---------- */
    /* T2 hand-spec'd. Others generated from a small menu so the demo doesn't break. */
    const orders = IS_DEMO ? {
      T2: [
        { qty: 2, name: 'Salade marocaine',  total: 90  },
        { qty: 2, name: 'Tajine kefta',      total: 360 },
        { qty: 1, name: 'Thé à la menthe',   total: 30  },
        { qty: 1, name: 'Jus d’avocat', total: 50  },
      ],
    } : {};
    // Live per-table orders built by the cashier (format: {id,name,price,qty}[])
    const tableOrders = {};

    /* For other occupied tables, generate plausible orders (deterministic per table id) */
    const menu = IS_DEMO ? [
      { name: 'Salade marocaine',     unit: 45 },
      { name: 'Briouates',            unit: 60 },
      { name: 'Tajine kefta',         unit: 180 },
      { name: 'Tajine poulet',        unit: 150 },
      { name: 'Couscous royal',       unit: 220 },
      { name: 'Pastilla poulet',      unit: 140 },
      { name: 'Harira',               unit: 35 },
      { name: 'Thé à la menthe',      unit: 30 },
      { name: 'Jus d’orange',    unit: 35 },
      { name: 'Jus d’avocat',    unit: 50 },
      { name: 'Eau Aïn Saïss',        unit: 18 },
      { name: 'Pâtisserie maison',    unit: 45 },
    ] : [];
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

    /* ═══════════════════════════════════════════════════════════════════════
       FLOOR PLAN RENDERING · le dessin au trait noir du dashboard, à
       l'identique. Les fonctions pdsNoir* de pages-pro.js ne sont pas
       exportées par floorplan-core (même raison que caisseNoirC plus bas),
       donc elles sont recopiées ici : coches de chaises, plateau fantôme,
       mobilier au trait, sol charbon quadrillé. Une seule table, un seul
       rendu · la démo Café Atlas et le plan du commerçant passent tous les
       deux par caisseNoirCellHTML().
       ═══════════════════════════════════════════════════════════════════════ */
    /* Anneaux d'état, langue caisse. Mêmes valeurs que PDS_STATUS_RING_NOIR
       du dashboard : khawya = free, ka-yaklo = occupied (mint, halo),
       a-commander garde l'ambre de reserved en trait plein, khlass = cleaning.
       bgha-ykhlass est le seul état propre à la caisse · rose, halo rose. */
    const CAISSE_RING_NOIR = {
      'khawya':       { s: 'rgba(255,255,255,0.30)', w: 1.25, dash: '',        fill: 'rgba(255,255,255,0.02)', chair: 'rgba(255,255,255,0.20)' },
      'a-commander':  { s: '#E8C067',                w: 1.25, dash: '',        fill: 'rgba(232,192,103,0.08)', chair: 'rgba(232,192,103,0.50)' },
      'ka-yaklo':     { s: '#00FFAE',                w: 1.25, dash: '',        fill: 'rgba(0,255,174,0.14)',   chair: 'rgba(0,255,174,0.70)' },
      'bgha-ykhlass': { s: '#FF7DA9',                w: 1.25, dash: '',        fill: 'rgba(255,125,169,0.12)', chair: 'rgba(255,125,169,0.60)' },
      'khlass':       { s: 'rgba(255,255,255,0.40)', w: 1.25, dash: '1.5 3.5', fill: 'rgba(255,255,255,0.02)', chair: 'rgba(255,255,255,0.20)' },
    };
    /* Mêmes états, encre du jour · PDS_STATUS_RING_JOUR du dashboard : le mint
       redevient atlas, l'ambre son ton foncé, le rose son ton foncé. */
    const CAISSE_RING_JOUR = {
      'khawya':       { s: 'rgba(10,15,13,0.30)',    w: 1.25, dash: '',        fill: 'rgba(10,15,13,0.015)',   chair: 'rgba(10,15,13,0.22)' },
      'a-commander':  { s: '#C89235',                w: 1.25, dash: '',        fill: 'rgba(200,146,53,0.10)',  chair: 'rgba(200,146,53,0.55)' },
      'ka-yaklo':     { s: '#0B6E4F',                w: 1.25, dash: '',        fill: 'rgba(11,110,79,0.10)',   chair: 'rgba(11,110,79,0.70)' },
      'bgha-ykhlass': { s: '#C2456F',                w: 1.25, dash: '',        fill: 'rgba(194,69,111,0.10)',  chair: 'rgba(194,69,111,0.60)' },
      'khlass':       { s: 'rgba(10,15,13,0.45)',    w: 1.25, dash: '1.5 3.5', fill: 'rgba(10,15,13,0.02)',    chair: 'rgba(10,15,13,0.24)' },
    };

    /* ── Café Atlas, redessiné au trait ──────────────────────────────────
       Les plans démo deviennent des scènes noir identiques au dashboard :
       un plan en px (échelle 800 ≈ largeur dashboard, tables 64–144px comme
       les types round2..rect8), du mobilier au trait, et les tables en %
       converties en px au rendu. */
    const DEMO_PLANES = {
      interieur: { w: 800, h: 400 },
      terrasse:  { w: 800, h: 250 },
      etage:     { w: 800, h: 500 },
    };
    const DEMO_FIXTURES = {
      interieur: [
        { type: 'fenetre',  x: 90,  y: 0,   w: 240, h: 6 },
        { type: 'fenetre',  x: 370, y: 0,   w: 140, h: 6 },
        { type: 'cuisine',  x: 550, y: 20,  w: 230, h: 145, label: 'CUISINE' },
        { type: 'passe',    x: 549, y: 148, w: 30,  h: 20, label: '' },
        { type: 'comptoir', x: 110, y: 175, w: 400, h: 40, label: 'COMPTOIR' },
        { type: 'escalier', x: 620, y: 195, w: 140, h: 185, label: '' },
        { type: 'plante',   x: 525, y: 330, w: 45,  h: 45 },
        { type: 'porte',    x: 4,   y: 250, w: 55,  h: 8, rot: 90, label: '' },
      ],
      terrasse: [
        { type: 'plante', x: 30,  y: 8, w: 30, h: 30 },
        { type: 'plante', x: 110, y: 8, w: 30, h: 30 },
        { type: 'plante', x: 210, y: 8, w: 30, h: 30 },
        { type: 'plante', x: 310, y: 8, w: 30, h: 30 },
        { type: 'plante', x: 450, y: 8, w: 30, h: 30 },
        { type: 'plante', x: 670, y: 8, w: 30, h: 30 },
      ],
      etage: [
        { type: 'fenetre',  x: 100, y: 0,   w: 200, h: 6 },
        { type: 'fenetre',  x: 450, y: 0,   w: 200, h: 6 },
        { type: 'comptoir', x: 10,  y: 190, w: 30,  h: 140, label: 'BAR' },
        { type: 'banquette', x: 90,  y: 430, w: 490, h: 28, label: '' },
        { type: 'banquette', x: 640, y: 350, w: 28,  h: 110, label: '' },
        { type: 'escalier', x: 670, y: 160, w: 120, h: 180, label: '' },
        { type: 'plante',   x: 630, y: 100, w: 40,  h: 40 },
        { type: 'plante',   x: 70,  y: 360, w: 40,  h: 40 },
      ],
    };
    /* Phone-order state must exist before the first floor render: tableHTML()
       asks phoneBadgeHTML() for each table during this initial paint. */
    /* Les tables qu'une commande nomme sans que le plan de salle les connaisse.
       Mémorisées pour n'avertir qu'une fois par table, pas à chaque sondage. */
    const opUnmatchedTables = new Set();
    const phoneSeats = new Map();     // clé table → { session, since }
    const phoneMovedVisits = new Map(); // session → acknowledged destination and superseded close marker
    const phonePending = new Map();   // clé table → nombre de commandes en attente
    const tableClosedAt = Object.create(null); // clé table → horodatage de fermeture/annulation locale
    const recoveredPaidVisits = new Set();
    if (!storeIsReal()) initDemoPlanes();
    renderSalle();

    /* ═══════════════════════════════════════════════════════════════════════
       REAL-STORE FLOOR PLAN · the caisse mirrors the owner's dashboard design
       (Plan de Salle), never the Café Atlas demo. No design yet → a clean
       "à concevoir" empty state. The dashboard mirrors its layout under the
       merchant slug (kiwiPlanDeSalle:slug:<slug>), which is what we read here;
       a server channel will light the same reader up cross-device. Demo store
       (unpaired localhost) is untouched · it keeps its architectural plan.
       ═══════════════════════════════════════════════════════════════════════ */
    let __realZoneOrder = [];
    /* The owner's plan as designed · kept alongside `tables` (which holds live
       service state) so a repaint can position tables without re-reading
       storage or resetting anybody's status. */
    let __realPlan = null;
    /* Fallback only. The dashboard's plan (v2) stores the cover count on each
       TABLE, because the owner can resize a table and change its seating; this
       map is what a v1 plan gets, and it was already wrong · `rect10` was
       missing, so every 10-top on the till read "4p". Read the table first,
       fall back to the type, and only then to 4. */
    const DESIGN_COVERS = { round2: 2, sq2: 2, high: 2, bar: 1, round4: 4, sq4: 4, rect4: 4, round6: 6, rect6: 6, round8: 8, rect8: 8, rect10: 10 };

    /* ═══════════════════════════════════════════════════════════════════════
       UNE table, DEUX formes dans le DOM · et il a longtemps manqué la moitié.
       ---------------------------------------------------------------------
       La démo dessine des `.tbl-cell` ; un vrai commerçant qui a dessiné sa
       salle obtient des `.cplan-tbl` (renderRealGrid, branche spatiale). Or
       CHAQUE interaction du fichier ne cherchait que `.tbl-cell` : le clic, la
       sélection, le chronomètre, le placement d'une file d'attente, le clavier.
       Résultat, sur le plan qu'un client voit vraiment, taper une table ne
       faisait rien du tout · alors que le nœud porte role="button" et un
       tabindex, donc il a toujours eu l'air cliquable.
       Un seul sélecteur pour les deux, désormais, et il est nommé pour qu'on
       n'en oublie plus un. ══════════════════════════════════════════════════ */
    const TBL_SEL = '.tbl-cell, .cplan-tbl';

    /* Repaint from the CURRENT `tables` (live status from the order flow)
       positioned by the OWNER'S plan. This used to be a flat card grid per
       zone, which threw away every coordinate the owner had placed · the
       waiter saw an alphabetical list, not their room. Same geometry and the
       same drawing primitives as the dashboard designer, via KiwiFloorCore. */
    var __activeRealZoneFilter = 'all';

    /* Le plan cuit ses couleurs (matières aplaties, anneaux d'état, dégradés
       de plateau) dans le SVG au moment du rendu · un changement de thème doit
       donc repeindre, le remap CSS ne suffit pas. Plan réel : la grille se
       redessine seule. Scène démo : le sol, le mobilier et les defs sont
       injectés une seule fois derrière `planeInit`, il faut donc les retirer
       avant de relancer l'injection. */
    document.addEventListener('kiwi:caisse-theme', () => {
      if (storeIsReal()) { renderRealGrid(); return; }
      document.querySelectorAll('.view-salle .cplan-room[data-plan-zone] .cplan-scale').forEach(scale => {
        scale.querySelectorAll(':scope > .pds-floor, :scope > .pds-el, :scope > .pds-defs')
             .forEach(node => node.remove());
        delete scale.dataset.planeInit;
      });
      initDemoPlanes();
      renderSalle();
    });

    try { setupRealSalle(); } catch (_) {}
    // A design saved on the dashboard (same browser) → repaint live.
    window.addEventListener('storage', (e) => {
      if (e && e.key && e.key.indexOf('kiwiPlanDeSalle:slug:') === 0) { try { setupRealSalle(); } catch (_) {} }
    });
    // Pairing redeemed after paint (?pair=1 hand-off) → build the real plan.
    document.addEventListener('kiwi-paired', () => { try { setupRealSalle(); } catch (_) {} });

    /* ── Le plan dessiné sur UN AUTRE appareil ──────────────────────────────
       Les deux relances ci-dessus supposent le même navigateur : l'événement
       `storage` ne traverse pas les appareils, et l'appairage ne transporte pas
       le plan. Une caisse installée après coup · le cas normal, le patron
       dessine chez lui et l'iPad arrive au comptoir ensuite · affichait donc
       « Plan de salle pas encore conçu » sur une salle entièrement dessinée.
       On lit la copie serveur, qui atterrit sur le `window.KiwiFloorPlan` que
       caisseFloorPlan() consulte déjà en premier. La caisse ne dessine pas de
       plan, mais elle en porte un quand l'appairage s'est fait dans ce
       navigateur : si le serveur est encore vide, c'est donc elle qui l'y pose
       · le premier des deux à se connecter sème, peu importe lequel. */
    (function () {
      const slugMirror = (slug) => 'kiwiPlanDeSalle:slug:' + slug;
      let doc = null;

      function build() {
        if (doc) return true;
        if (!window.KiwiCloudDoc) return false;
        doc = window.KiwiCloudDoc.attach({
          feature: 'floorplan',
          slug: () => window.KiwiCloudDoc.currentSlug(),
          /* Le pendant de la ligne posée côté tableau de bord : la caisse range
             sa copie sous le slug, lui sous l'ID d'établissement. Le signet doit
             dire laquelle des deux il décrit, sinon l'un des deux appareils se
             croit à jour pour toujours. */
          localKey: () => { const s = window.KiwiCloudDoc.currentSlug(); return s ? slugMirror(s) : ''; },
          read: () => {
            try {
              const s = window.KiwiCloudDoc.currentSlug();
              const raw = s ? localStorage.getItem(slugMirror(s)) : null;
              const d = raw ? JSON.parse(raw) : null;
              if (d && Array.isArray(d.tables)) return d;
            } catch (_) {}
            return { zones: [], tables: [], staff: [] };
          },
          write: (d) => {
            try {
              const s = window.KiwiCloudDoc.currentSlug();
              if (s) localStorage.setItem(slugMirror(s), JSON.stringify(d));
            } catch (_) {}
            window.KiwiFloorPlan = d;
            try { setupRealSalle(); } catch (_) {}
          },
          /* La même fusion que le tableau de bord (floorplan-core.js ›
             pdsMergePlans : époque + pierres tombales). L'union nue de
             cloud-doc.js ignorait l'époque et ne savait pas supprimer : une
             caisse gardant une vieille copie réinjectait des tables étrangères
             dans un plan pourtant réparé depuis le tableau de bord. */
          merge: (mine, theirs) => {
            const M = window.KiwiCloudDoc.mergeDefault;
            const F = window.KiwiFloorCore;
            return (F && typeof F.mergePlans === 'function') ? F.mergePlans(mine, theirs, M) : M(mine, theirs);
          },
          isEmpty: (d) => !d || !(d.tables && d.tables.length),
        });
        // Un appairage noué APRÈS le chargement doit lancer la lecture.
        document.addEventListener('kiwi-paired', () => { try { doc.bind(); } catch (_) {} });
        return true;
      }

      /* ── POURQUOI ON REPASSE ─────────────────────────────────────────────
         Ce script-ci est EN LIGNE dans la page : il s'exécute pendant l'analyse
         du document. `assets/cloud-doc.js` porte `defer`, donc il ne s'exécute
         qu'une fois tout le document analysé · APRÈS ces lignes. Au premier
         passage `window.KiwiCloudDoc` n'existe pas encore, et la version
         précédente se contentait d'un `return` : la caisse n'attachait jamais le
         lecteur du plan, ne demandait donc JAMAIS /api/store?feature=floorplan,
         et « Rafraîchir » n'avait rien à relire non plus (pullAll ne parcourt
         que les documents attachés). Le patron dessinait sa salle, le comptoir
         répondait « pas encore conçu », indéfiniment.

         Seul le MÊME navigateur s'en sortait, par le miroir localStorage : le
         bogue marchait donc chez celui qui le testait sur son portable, et
         jamais sur la tablette du comptoir · le cas normal, et le seul qui
         compte. (C'est exactement pour ce piège que floorplan-core.js est
         chargé sans `defer`, voir l'en-tête du fichier.)

         Le slug peut lui aussi arriver en retard, le temps que l'appairage se
         résolve. On repasse donc jusqu'à ce que les deux soient là · borné, une
         caisse ne doit pas interroger sans fin. */
      let left = 40;                                   // ~10 s, puis on renonce
      (function attempt() {
        if (build() && doc.enabled()) { try { doc.bind(); } catch (_) {} return; }
        if (--left > 0) setTimeout(attempt, 250);
      })();
    })();
    document.querySelectorAll('.floor-pill').forEach(p =>
      p.addEventListener('click', () => setFloor(p.dataset.floor))
    );

    /* ---------- Mode switching (Salle ↔ Vente rapida ↔ Order) ---------- */
    let mode = 'salle';
    document.body.dataset.mode = mode;

    // New-table modal state
    let newTableId = null;
    let newTableCovers = 2;
    document.addEventListener('kiwi-config', () => { syncActiveMode(); });

    $$('.mode-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.feature && isFeatureOff(btn.dataset.feature)) return;
        if (btn.dataset.mode && isFeatureOff(btn.dataset.mode)) return;
        /* QUITTER LE MODE COMMANDE PAR LES PASTILLES.
           Le garde-fou refusait tout, toujours · y compris sur une mesa vide, où
           il n'y a rien à protéger. Or « j'ai ouvert la table par erreur, ils ne
           commandent pas encore » est le cas courant, et le geste naturel est de
           retaper « Salle ». Le lui interdire est exactement ce qui donnait une
           caisse qui ne répond plus. Rien de saisi ⇒ on sort et la mesa
           redevient libre. Une commande commencée, elle, garde son garde-fou :
           elle se valide ou s'annule, jamais par inadvertance. */
        if (mode === 'order') {
          if (orderInProgressCount() > 0) {
            toast('Valide ou annule la commande d\'abord');
            return;
          }
          cancelNewOrder();
          if (btn.dataset.mode && btn.dataset.mode !== 'salle' && !isFeatureOff(btn.dataset.mode)) setMode(btn.dataset.mode);
          return;
        }
        setMode(btn.dataset.mode);
      });
    });
    window.KiwiCaisseToast = toast;

    /* ---------- Right panel state ---------- */
    let selectedId = null;
    let caisseTableLocks = {};

    /* ===========================================================
       Vente rapida · menu + cart
       =========================================================== */

    /* La carte de la démo. Chez un vrai commerçant elle part vide et c'est
       rebuildCarte() qui la remplit avec SA carte, publiée depuis le tableau de
       bord. `let` et non `const` : la carte se remplace quand le patron change
       un prix au bureau. */
    let catLabels = IS_DEMO ? {
      all:        'Tout',
      entrees:    'Entrées',
      tajines:    'Tajines',
      couscous:   'Couscous',
      pastillas:  'Pastillas',
      sandwiches: 'Sandwiches',
      boissons:   'Boissons',
      desserts:   'Desserts',
    } : { all: 'Tout' };

    /* Category colour-coding · a muted Moroccan-earth palette used for the tile
       art chip, category label, in-cart glow and quantity badge. Functional
       colour-coding (à la Loyverse/Square) that reads fast without going loud. */
    let catColor = IS_DEMO ? {
      entrees:    'var(--forest)',
      tajines:    '#B5532A',
      couscous:   '#C9922E',
      pastillas:  '#A8574E',
      sandwiches: '#6E7B3D',
      boissons:   '#2E7D8C',
      desserts:   '#8A5A9E',
    } : {};

    /* L'ordre des pastilles. Il était écrit en dur dans renderCatPills(), ce qui
       rendait les catégories d'un vrai café impossibles à afficher même une fois
       ses plats chargés. */
    let catOrder = IS_DEMO
      ? ['all', 'entrees', 'tajines', 'couscous', 'pastillas', 'sandwiches', 'boissons', 'desserts']
      : ['all'];

    /* La palette reste celle de la maison : on la parcourt dans l'ordre des
       catégories du commerçant plutôt que d'inventer des teintes par hachage. */
    const CAT_PALETTE = ['var(--forest)', '#B5532A', '#C9922E', '#A8574E', '#6E7B3D', '#2E7D8C', '#8A5A9E'];

    let menuItems = IS_DEMO ? [
      // Entrées
      { id: 'm-001', cat: 'entrees',    name: 'Salade marocaine',     price: 45  },
      { id: 'm-002', cat: 'entrees',    name: 'Briouates au fromage', price: 60  },
      { id: 'm-003', cat: 'entrees',    name: 'Harira',               price: 35  },
      { id: 'm-004', cat: 'entrees',    name: 'Zaalouk',              price: 40  },
      { id: 'm-005', cat: 'entrees',    name: 'Taktouka',             price: 40  },
      { id: 'm-006', cat: 'entrees',    name: 'Soupe du jour',        price: 35  },
      // Tajines
      { id: 'm-007', cat: 'tajines',    name: 'Tajine kefta',         price: 180 },
      { id: 'm-008', cat: 'tajines',    name: 'Tajine poulet citron', price: 150 },
      { id: 'm-009', cat: 'tajines',    name: 'Tajine agneau pruneaux', price: 220 },
      { id: 'm-010', cat: 'tajines',    name: 'Tajine 4 légumes',     price: 120 },
      { id: 'm-011', cat: 'tajines',    name: 'Tajine poisson',       price: 200 },
      // Couscous
      { id: 'm-012', cat: 'couscous',   name: 'Couscous royal',       price: 220 },
      { id: 'm-013', cat: 'couscous',   name: 'Couscous tfaya',       price: 180 },
      { id: 'm-014', cat: 'couscous',   name: 'Couscous légumes',     price: 140 },
      // Pastillas
      { id: 'm-015', cat: 'pastillas',  name: 'Pastilla poulet',      price: 140 },
      { id: 'm-016', cat: 'pastillas',  name: 'Pastilla seafood',     price: 180 },
      { id: 'm-017', cat: 'pastillas',  name: 'Pastilla pigeon',      price: 220 },
      // Sandwiches
      { id: 'm-018', cat: 'sandwiches', name: 'Sandwich kefta',       price: 50  },
      { id: 'm-019', cat: 'sandwiches', name: 'Sandwich poulet',      price: 45  },
      { id: 'm-020', cat: 'sandwiches', name: 'Sandwich thon',        price: 40  },
      { id: 'm-021', cat: 'sandwiches', name: 'Bocadillo merguez',    price: 55  },
      { id: 'm-022', cat: 'sandwiches', name: 'Wrap végé',            price: 42  },
      // Boissons
      { id: 'm-023', cat: 'boissons',   name: 'Thé à la menthe',      price: 30  },
      { id: 'm-024', cat: 'boissons',   name: 'Café noir',            price: 15  },
      { id: 'm-025', cat: 'boissons',   name: 'Café au lait',         price: 18  },
      { id: 'm-026', cat: 'boissons',   name: 'Cappuccino',           price: 22  },
      { id: 'm-027', cat: 'boissons',   name: "Jus d'orange",         price: 35  },
      { id: 'm-028', cat: 'boissons',   name: "Jus d'avocat",         price: 50  },
      { id: 'm-029', cat: 'boissons',   name: 'Eau Aïn Saïss',        price: 18  },
      { id: 'm-030', cat: 'boissons',   name: 'Coca-Cola',            price: 25  },
      // Desserts
      { id: 'm-031', cat: 'desserts',   name: 'Crème brûlée',         price: 50  },
      { id: 'm-032', cat: 'desserts',   name: 'Cornes de gazelle',    price: 35  },
      { id: 'm-033', cat: 'desserts',   name: 'Pâtisserie maison',    price: 45  },
      { id: 'm-034', cat: 'desserts',   name: 'Fruit de saison',      price: 30  },
      { id: 'm-035', cat: 'desserts',   name: 'Glace artisanale',     price: 40  },
    ] : [];

    /* ═══════════════════════════════════════════════════════════════════════
     * LA CARTE VIENT DU BUREAU
     * -----------------------------------------------------------------------
     * Le tableau de bord est le cerveau : le patron compose sa carte là-bas
     * (catégories, sous-catégories, plats, prix) et la caisse la reçoit. Elle
     * ne la compose jamais et ne la renvoie jamais · deux miroirs pour une même
     * carte, ce sont deux vérités qui divergent, et c'est la caisse qui perdrait
     * (elle lirait un cache périmé et écraserait le vrai menu du patron).
     *
     * On lit GET /api/menu?merchant=<slug>, publique et sans cookie : elle
     * existe déjà pour la page client QR, qui n'a ni compte ni session. C'est
     * pour cette raison qu'on n'ouvre PAS de document cloud sur le menu, et que
     * assets/menu-catalog.js · module du tableau de bord, qui publie · ne doit
     * pas être chargé ici.
     *
     * Miroir local rangé par slug, comme le plan de salle : hors ligne, la
     * dernière carte connue reste servie. Un comptoir sans réseau doit encore
     * pouvoir encaisser.
     * ═══════════════════════════════════════════════════════════════════════ */
    const CARTE_MIRROR = 'kiwi:menuMirror:v1:';

    /* ══════════ LES POSTES DE PRÉPARATION VIENNENT AUSSI DU BUREAU ══════════
     * Le patron déclare ses postes dans le Menu du tableau de bord (Cuisson,
     * Bar, Pâtisserie…), affecte chaque plat à l'un d'eux, et l'ordre qu'il leur
     * donne EST un réglage : le premier de sa liste reçoit les plats qu'il n'a
     * affectés à rien.
     *
     * Cet état vit ICI, à côté du lecteur de carte, et PAS dans la section écran
     * cuisine · elle est déclarée huit cents lignes plus bas, alors que
     * rebuildCarte() tourne dès l'amorçage. Y toucher d'ici lèverait une
     * ReferenceError avalée par le try/catch de l'amorçage : la carte ne se
     * chargerait jamais et rien ne le dirait. `kdsReady` dit si l'écran cuisine
     * est monté et peut être repeint.
     *
     * Les teintes sont celles que les pastilles de l'écran cuisine utilisent
     * depuis toujours : un poste doit avoir la même couleur au bureau et au
     * comptoir, sinon la pastille ne sert plus de repère. */
    const STATION_PALETTE = ['#1F5D3C', '#3FB67A', '#D99A2B', '#3677A6', '#164A2F', '#C24A2E', '#C97A4A'];
    const carteState = { stations: [], kitchenId: '', opts: [], cats: [], formulaItems: [], kdsReady: false,
      /* Les promotions de la carte (assets/menu-promos.js), posées au bureau.
         La démo en montre une sur les desserts, que les autres suites ne
         facturent jamais : leurs totaux de démo ne bougent pas. */
      promos: IS_DEMO ? [{ id: 'demo-gouter', name: "L'heure du goûter", kind: 'percent', value: 15,
        all: false, cats: ['desserts'], items: [], from: '', to: '', days: [], start: '', end: '', paused: false, createdAt: 1 }] : [] };
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

    /* Aller chercher la carte. Silencieux par construction : hors ligne ou
       serveur muet, on garde le miroir · on ne vide jamais une caisse qui
       marchait il y a une minute. */
    let _carteAt = 0;
    /* Le sondage de six secondes reconstruisait toute la grille même quand la
       carte n'avait pas bougé : une reconstruction pendant un appui avale le
       clic (et coupait l'animation d'ajout). On ne repeint que si la carte a
       changé, et jamais sous un doigt posé. */
    let _carteFingerDown = false;
    document.addEventListener('pointerdown', () => { _carteFingerDown = true; }, true);
    ['pointerup', 'pointercancel'].forEach((kind) => document.addEventListener(kind, () => {
      setTimeout(() => { _carteFingerDown = false; }, 0);
    }, true));
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
    /* « Rafraîchir » au comptoir doit ramener la carte comme il ramène le reste. */
    window.KiwiCaisseCarte = { fetch: () => fetchCarte(true), rebuild: rebuildCarte, itemCount: () => menuItems.length };

    /* Les relances sont posées au bootstrap du menu, plus bas : rebuildCarte()
       touche `activeCat` et `cart`, déclarés après ce bloc · les appeler ici
       lèverait une ReferenceError que le try/catch avalerait en silence, et la
       carte ne se chargerait jamais sans que rien ne le dise. */

    let activeCat = 'all';
    let activeSub = null;
    let cart = []; // line: { uid, id, name, price, qty, note }
    /* Stable per-line id so the same dish can sit on two lines with
       different kitchen notes (id stays = menu id for menu/station lookups). */
    let lineSeq = 0;
    const newLineUid = () => 'ln' + (++lineSeq);
    /* À emporter · an existing board order can be re-opened in the builder
       for editing. vrapEditingNum holds its number (null = new order).
       vrapDiscount holds a manager-approved réduction on the cart. */
    let vrapEditingNum = null;
    let vrapDiscount   = null;  // { kind, value, amount, reason } | null
    let vrapResumedExpiredId = null; // id d'une commande expirée reprise en cours dans le panier

    const dismissedExpiredIds = new Set((() => {
      try { return JSON.parse(localStorage.getItem('kiwi_dismissed_expired') || '[]'); } catch (_) { return []; }
    })());

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

    /* ---- Waitlist (liste d'attente) · walk-in parties at the door ---- */
    let waitlist = [];          // [{ id, name, size, pref, addedAt }]
    let wlSeq = 0;
    let wlDraft = { name: '', size: 2, pref: 'peu-importe' };
    let wlSeating = null;       // party being seated on the Plan de salle (or null)

    /* ---- Stock & approvisionnement (cashier inventory) · resets on reload ---- */
    let stockTab = 'apercu';
    let skSearch = '', skCat = 'all', skStatus = 'all';
    let skOrderSeq = 2843;
    /* suppliers · read-only picklist (cashier picks, doesn't edit).
       A REAL store starts with an empty book (builds its own stock); only the
       local demo seeds this café's suppliers/inventory/orders. */
    const suppliers = storeIsReal() ? [] : [
      { id: 's1', name: 'Marché Central · Port',     cat: 'Frais'    },
      { id: 's2', name: 'Métro Cash & Carry',        cat: 'Épicerie' },
      { id: 's3', name: 'Boissons Atlas',            cat: 'Boissons' },
      { id: 's4', name: 'Laiterie Doukkala',         cat: 'Laitiers' },
      { id: 's5', name: 'Boucherie Zerktouni',       cat: 'Viandes'  },
      { id: 's6', name: 'Café & Torréfaction Riad',  cat: 'Café'     },
    ];
    const stockItems = storeIsReal() ? [] : [
      { id:'i1',  name:'Tomates fraîches', cat:'legumes',     unit:'kg',      supplier:'Marché Central · Port',    stock:8,  par:20, reorder:8,  cost:9 },
      { id:'i2',  name:'Oignons',          cat:'legumes',     unit:'kg',      supplier:'Marché Central · Port',    stock:22, par:25, reorder:10, cost:6 },
      { id:'i3',  name:'Pommes de terre',  cat:'legumes',     unit:'kg',      supplier:'Marché Central · Port',    stock:35, par:30, reorder:12, cost:5 },
      { id:'i4',  name:'Poulet entier',    cat:'viandes',     unit:'kg',      supplier:'Boucherie Zerktouni',      stock:6,  par:18, reorder:8,  cost:38 },
      { id:'i5',  name:'Viande hachée',    cat:'viandes',     unit:'kg',      supplier:'Boucherie Zerktouni',      stock:0,  par:12, reorder:5,  cost:75 },
      { id:'i6',  name:'Agneau épaule',    cat:'viandes',     unit:'kg',      supplier:'Boucherie Zerktouni',      stock:9,  par:10, reorder:4,  cost:90 },
      { id:'i7',  name:'Sardines',         cat:'poissons',    unit:'kg',      supplier:'Marché Central · Port',    stock:4,  par:10, reorder:4,  cost:22 },
      { id:'i8',  name:'Thé vert Gunpowder', cat:'epicerie',  unit:'kg',      supplier:'Métro Cash & Carry',       stock:7,  par:8,  reorder:3,  cost:48 },
      { id:'i9',  name:'Sucre',            cat:'epicerie',    unit:'kg',      supplier:'Métro Cash & Carry',       stock:40, par:30, reorder:12, cost:7 },
      { id:'i10', name:"Huile d'olive",    cat:'epicerie',    unit:'l',       supplier:'Métro Cash & Carry',       stock:14, par:20, reorder:8,  cost:42 },
      { id:'i11', name:'Farine',           cat:'epicerie',    unit:'kg',      supplier:'Métro Cash & Carry',       stock:26, par:25, reorder:10, cost:6 },
      { id:'i12', name:'Lait',             cat:'laitiers',    unit:'l',       supplier:'Laiterie Doukkala',        stock:11, par:24, reorder:10, cost:8 },
      { id:'i13', name:'Beurre',           cat:'laitiers',    unit:'kg',      supplier:'Laiterie Doukkala',        stock:3,  par:8,  reorder:3,  cost:62 },
      { id:'i14', name:'Œufs',             cat:'laitiers',    unit:'plateau', supplier:'Laiterie Doukkala',        stock:5,  par:14, reorder:6,  cost:34 },
      { id:'i15', name:'Café en grains',   cat:'cafe',        unit:'kg',      supplier:'Café & Torréfaction Riad', stock:9,  par:12, reorder:5,  cost:120 },
      { id:'i16', name:'Coca-Cola 33cl',   cat:'boissons',    unit:'casier',  supplier:'Boissons Atlas',           stock:6,  par:15, reorder:6,  cost:90 },
      { id:'i17', name:'Eau minérale 1L',  cat:'boissons',    unit:'casier',  supplier:'Boissons Atlas',           stock:18, par:20, reorder:8,  cost:48 },
      { id:'i18', name:'Gobelets carton',  cat:'consommables',unit:'paquet',  supplier:'Métro Cash & Carry',       stock:12, par:20, reorder:8,  cost:35 },
    ];
    const supplyOrders = storeIsReal() ? [] : [
      { id:'2841', supplier:'Boucherie Zerktouni',   items:[{name:'Poulet entier',qty:18,unit:'kg'},{name:'Viande hachée',qty:12,unit:'kg'}], total:1584, status:'confirmee',  when:'Demain · 06h' },
      { id:'2842', supplier:'Boissons Atlas',        items:[{name:'Coca-Cola 33cl',qty:10,unit:'casier'},{name:'Eau minérale 1L',qty:8,unit:'casier'}], total:1284, status:'en-attente', when:'Jeu. · 08h' },
      { id:'2838', supplier:'Marché Central · Port', items:[{name:'Tomates fraîches',qty:20,unit:'kg'},{name:'Oignons',qty:15,unit:'kg'}], total:270, status:'recue', when:'Reçue hier' },
    ];
    let skSharedStockUnsub = null;
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
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindSharedStock);
    else bindSharedStock();

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

    /* ---------- Menu line-art · forest strokes, mint-tint fills, 64×64.
       Shared silhouettes (bowl, cône tajine, dôme couscous, pastilla, baguette)
       keep the 35 cohesive; per-plat garnish tells them apart. ---------- */
    const _bowl = (x) => `<ellipse class="fill" cx="32" cy="35" rx="18" ry="5"/><path d="M14 35a18 15 0 0 0 36 0"/><ellipse cx="32" cy="35" rx="18" ry="5"/>${x}`;
    const _dish = (x) => `<ellipse class="fill" cx="32" cy="38" rx="19" ry="5"/><path d="M16 38a16 9 0 0 0 32 0"/><ellipse cx="32" cy="38" rx="19" ry="5"/>${x}`;
    /* Tajine marocain · an original Kiwi silhouette informed by traditional
       ceramic cookware: crown, conical lid, zellige band and serving base.
       Each part stays legible at the 28px optical size used by product cards. */
    const _tajine = (g) => `<path class="fill" d="M29 18c0-3 1.3-5 3-5s3 2 3 5z"/><path d="M29 18c0-3 1.3-5 3-5s3 2 3 5z"/><path class="fill" d="M16 43c8-7 13-16 14-25h4c1 9 6 18 14 25z"/><path d="M16 43c8-7 13-16 14-25h4c1 9 6 18 14 25z"/><path class="thin" d="M21 38h22M22 38l3-3 4 3 3-3 3 3 4-3 3 3"/><path d="M14 44h36"/><path class="fill" d="M13 47h38l-2 5c-1 3-4 5-8 5H23c-4 0-7-2-8-5z"/><path d="M13 47h38l-2 5c-1 3-4 5-8 5H23c-4 0-7-2-8-5z"/><path d="M13 49H9c-2 0-3 1-3 3s1 3 4 3h7M51 49h4c2 0 3 1 3 3s-1 3-4 3h-7"/>${g}`;
    const _dome = (t) => `<ellipse class="fill" cx="32" cy="49" rx="21" ry="4.5"/><path class="fill" d="M14 49a18 17 0 0 1 36 0z"/><ellipse cx="32" cy="49" rx="21" ry="4.5"/><path d="M14 49a18 17 0 0 1 36 0"/><path class="thin" d="M20 45c8-3 16-3 24 0"/>${t}`;
    const _pie = (b) => `<ellipse class="fill" cx="32" cy="50" rx="20" ry="4"/><path class="fill" d="M14 44a18 11 0 0 1 36 0z"/><ellipse cx="32" cy="50" rx="20" ry="4"/><path d="M14 44a18 11 0 0 1 36 0"/><path d="M14 44h36"/><path class="thin" d="M21 41h22M24 36l16 8M40 36L24 44M32 33v11"/>${b}`;
    const _bag = (f) => `<rect class="fill" x="12" y="30" width="40" height="17" rx="8.5"/><rect x="12" y="30" width="40" height="17" rx="8.5"/><path class="thin" d="M20 31c1.5-2.5 5-2.5 6.5 0M32 31c1.5-2.5 5-2.5 6.5 0"/><path class="thin" d="M14 39l4-2.5 4 2.5 4-2.5 4 2.5 4-2.5 4 2.5 4-2.5 4 2.5"/>${f}`;

    const MENU_ART = {
      // Entrées
      'm-001': _bowl(`<path class="thin" d="M25 30l2 2-2 2-2-2zM33 28l2 2-2 2-2-2zM40 30l2 2-2 2-2-2z"/>`),
      'm-002': `<path class="fill" d="M32 13l17 32H15z"/><path d="M32 13l17 32H15z"/><path class="thin" d="M32 14v30M22 39h20"/><circle class="fill" cx="32" cy="28" r="1.6"/>`,
      'm-003': _bowl(`<path class="thin" d="M27 27c0-3 3-3 3-6M35 27c0-3 3-3 3-6"/>`),
      'm-004': _dish(`<path class="thin" d="M24 37c4 2 12 2 16-1"/><path class="fill" d="M30 28c-3 0-5 2-5 5s3 4 6 3 4-5 1-7z"/><path d="M31 27l2-3"/>`),
      'm-005': _dish(`<path class="thin" d="M23 36c4-2 9-2 13 0M27 39c3-1 8-1 11 0"/><circle class="fill" cx="32" cy="33" r="1.6"/>`),
      'm-006': _bowl(`<path class="thin" d="M29 27c0-3 3-3 3-6"/><ellipse class="fill" cx="45" cy="25" rx="3.2" ry="4.6" transform="rotate(28 45 25)"/><ellipse cx="45" cy="25" rx="3.2" ry="4.6" transform="rotate(28 45 25)"/><path d="M47 28l4 7"/>`),
      // Tajines · cône partagé, garniture sur l'assiette
      'm-007': _tajine(`<circle class="fill" cx="26" cy="50" r="2.6"/><circle cx="26" cy="50" r="2.6"/><circle class="fill" cx="32" cy="51" r="2.6"/><circle cx="32" cy="51" r="2.6"/><circle class="fill" cx="38" cy="50" r="2.6"/><circle cx="38" cy="50" r="2.6"/>`),
      'm-008': _tajine(`<circle class="fill" cx="40" cy="49" r="3.4"/><circle cx="40" cy="49" r="3.4"/><path class="thin" d="M40 45.6v6.8M36.6 49h6.8"/><circle class="fill" cx="25" cy="50" r="2"/><circle cx="25" cy="50" r="2"/>`),
      'm-009': _tajine(`<ellipse class="fill" cx="26" cy="50" rx="2.4" ry="3.1"/><ellipse cx="26" cy="50" rx="2.4" ry="3.1"/><ellipse class="fill" cx="32" cy="51" rx="2.4" ry="3.1"/><ellipse cx="32" cy="51" rx="2.4" ry="3.1"/><ellipse class="fill" cx="38" cy="50" rx="2.4" ry="3.1"/><ellipse cx="38" cy="50" rx="2.4" ry="3.1"/>`),
      'm-010': _tajine(`<path class="thin" d="M24 51l3-5M29 52l1.5-5.5M35 52l-1.5-5.5M40 51l-3-5"/><circle class="fill" cx="24" cy="51" r="1.3"/><circle class="fill" cx="40" cy="51" r="1.3"/>`),
      'm-011': _tajine(`<path class="fill" d="M23 50c3-3 8-3 11 0-3 3-8 3-11 0z"/><path d="M23 50c3-3 8-3 11 0-3 3-8 3-11 0z"/><path d="M23 50l-3-2v4z"/><circle cx="31" cy="49.4" r="0.8"/>`),
      // Couscous · dôme partagé, garniture sur le dessus
      'm-012': _dome(`<rect class="fill" x="28" y="30" width="8" height="6" rx="3"/><rect x="28" y="30" width="8" height="6" rx="3"/><path class="thin" d="M24 35l-2-5M40 35l2-5"/><circle class="fill" cx="26" cy="41" r="1.4"/><circle class="fill" cx="38" cy="41" r="1.4"/>`),
      'm-013': _dome(`<path class="thin" d="M22 42c6 3 14 3 20 0"/><circle class="fill" cx="27" cy="38" r="1.5"/><circle class="fill" cx="32" cy="36" r="1.5"/><circle class="fill" cx="37" cy="38" r="1.5"/>`),
      'm-014': _dome(`<path class="thin" d="M32 31v9M26 34l3 6M38 34l-3 6"/><circle class="fill" cx="32" cy="31" r="1.4"/><circle class="fill" cx="26" cy="34" r="1.4"/><circle class="fill" cx="38" cy="34" r="1.4"/>`),
      // Pastillas · sucre/cannelle partagé, badge discret
      'm-015': _pie(`<ellipse class="fill" cx="32" cy="34" rx="1.7" ry="2.6"/><ellipse cx="32" cy="34" rx="1.7" ry="2.6"/>`),
      'm-016': _pie(`<path class="thin" d="M27 32c2-2 4 0 5-1M37 31c-2 2-4 0-5 1"/>`),
      'm-017': _pie(`<circle class="fill" cx="28" cy="33" r="1.3"/><circle class="fill" cx="36" cy="33" r="1.3"/><circle class="fill" cx="32" cy="30" r="1.3"/>`),
      // Sandwiches · baguette partagée, garniture; wrap roulé distinct
      'm-018': _bag(`<circle class="fill" cx="24" cy="39" r="1.8"/><circle class="fill" cx="34" cy="39" r="1.8"/>`),
      'm-019': _bag(``),
      'm-020': _bag(`<path class="thin" d="M21 42.5h3M28 42.5h3M35 42.5h3"/>`),
      'm-021': _bag(`<ellipse class="fill" cx="26" cy="39" rx="2.6" ry="1.7"/><ellipse cx="26" cy="39" rx="2.6" ry="1.7"/><ellipse class="fill" cx="35" cy="39" rx="2.6" ry="1.7"/><ellipse cx="35" cy="39" rx="2.6" ry="1.7"/>`),
      'm-022': `<path class="fill" d="M22 25h20l-3 27a7 7 0 0 1-14 0z"/><path d="M22 25h20l-3 27a7 7 0 0 1-14 0z"/><ellipse class="fill" cx="32" cy="25" rx="10" ry="3.5"/><ellipse cx="32" cy="25" rx="10" ry="3.5"/><path class="thin" d="M27 24.5c1.5-2 6-2 8 0"/><path class="thin" d="M25 35h12M26 43h10"/>`,
      // Boissons
      'm-023': `<path class="fill" d="M21 35c0-7 5-11 11-11s11 4 11 11c0 6-5 10-11 10s-11-4-11-10z"/><path d="M21 35c0-7 5-11 11-11s11 4 11 11c0 6-5 10-11 10s-11-4-11-10z"/><path d="M25 28a8 4 0 0 1 14 0z"/><circle cx="32" cy="21.5" r="2.4"/><path d="M21 37c-5 1-8 4-10 9M22 41c-3 1-5 2-7 5"/><path d="M43 33c5 0 6 9 0 10"/><path class="thin" d="M39 19c0-3 3-3 3-6"/>`,
      'm-024': `<path class="fill" d="M23 31h16v6a8 8 0 0 1-16 0z"/><path d="M23 31h16v6a8 8 0 0 1-16 0z"/><path d="M39 33c5 0 5 7 0 7"/><ellipse cx="31" cy="46" rx="14" ry="3"/><path class="thin" d="M28 26c0-3 3-3 3-5M34 26c0-3 3-3 3-5"/>`,
      'm-025': `<path class="fill" d="M23 26h17v18a4 4 0 0 1-4 4H27a4 4 0 0 1-4-4z"/><path d="M23 26h17v18a4 4 0 0 1-4 4H27a4 4 0 0 1-4-4z"/><path d="M40 30c6 0 6 9 0 9"/><path class="thin" d="M24 33h15"/><path class="thin" d="M29 22c0-3 3-3 3-5M35 22c0-3 3-3 3-5"/>`,
      'm-026': `<path class="fill" d="M22 30h18v7a9 9 0 0 1-18 0z"/><path d="M22 30h18v7a9 9 0 0 1-18 0z"/><path d="M40 32c5.5 0 5.5 8 0 8"/><ellipse cx="31" cy="47" rx="15" ry="3"/><path d="M31 28c-1.5-2-4.5-.5-3 1.5l3 3 3-3c1.5-2-1.5-3.5-3-1.5z"/>`,
      'm-027': `<path class="fill" d="M23 23h17l-2.5 29h-12z"/><path d="M23 23h17l-2.5 29h-12z"/><path class="thin" d="M24 30h15"/><circle class="fill" cx="40" cy="20" r="5"/><circle cx="40" cy="20" r="5"/><path class="thin" d="M40 15v10M35 20h10"/><path d="M35 23l5-9"/>`,
      'm-028': `<path class="fill" d="M24 30h16v20a3 3 0 0 1-3 3H27a3 3 0 0 1-3-3z"/><path d="M24 20h16v30a3 3 0 0 1-3 3H27a3 3 0 0 1-3-3z"/><ellipse class="fill" cx="38" cy="18" rx="4.5" ry="3.6"/><ellipse cx="38" cy="18" rx="4.5" ry="3.6"/><circle class="fill" cx="38" cy="18" r="1.6"/><path d="M30 20v-7"/>`,
      'm-029': `<path d="M28 17h8v3l2 4v26a3 3 0 0 1-3 3H29a3 3 0 0 1-3-3V24l2-4z"/><rect class="fill" x="28" y="12" width="8" height="5" rx="1"/><rect x="28" y="12" width="8" height="5" rx="1"/><rect class="fill" x="26" y="33" width="12" height="9" rx="1.5"/><rect x="26" y="33" width="12" height="9" rx="1.5"/><path class="thin" d="M29 36.5h6M29 39h6"/><path class="thin" d="M28 28c3-2 5 2 8 0"/>`,
      'm-030': `<path class="fill" d="M23 23h17l-2.5 29h-12z"/><path d="M23 23h17l-2.5 29h-12z"/><path class="thin" d="M24 30h15"/><rect x="27" y="32" width="5" height="5" rx="1"/><rect x="32" y="35" width="5" height="5" rx="1"/><circle class="fill" cx="29" cy="44" r="1.3"/><circle class="fill" cx="34" cy="46" r="1.1"/><path d="M37 22l4-8"/>`,
      // Desserts
      'm-031': `<path class="fill" d="M17 36h30v5a5 5 0 0 1-5 5H22a5 5 0 0 1-5-5z"/><path d="M17 36h30v5a5 5 0 0 1-5 5H22a5 5 0 0 1-5-5z"/><ellipse class="fill" cx="32" cy="36" rx="15" ry="3.5"/><ellipse cx="32" cy="36" rx="15" ry="3.5"/><path class="thin" d="M23 35.5h18"/><circle class="fill" cx="32" cy="31" r="2.4"/><circle cx="32" cy="31" r="2.4"/><path class="thin" d="M35 30c2-1 3-3 2-4"/>`,
      'm-032': `<path class="fill" d="M18 46c-4-13 5-25 18-25 3 0 6 .6 9 2-9 0-17 7-19 16-1 3-1 6 0 9-3-1-6-1-8-2z"/><path d="M18 46c-4-13 5-25 18-25 3 0 6 .6 9 2-9 0-17 7-19 16-1 3-1 6 0 9-3-1-6-1-8-2z"/><path class="thin" d="M22 42c-2-9 4-17 13-19"/><circle class="fill" cx="24" cy="34" r="1"/><circle class="fill" cx="28" cy="30" r="1"/>`,
      'm-033': `<path class="fill" d="M23 36h18l-2 12a3 3 0 0 1-3 2H28a3 3 0 0 1-3-2z"/><path d="M23 36h18l-2 12a3 3 0 0 1-3 2H28a3 3 0 0 1-3-2z"/><path class="thin" d="M28 37l-.6 12M32 37v13M36 37l.6 12"/><path class="fill" d="M22 36c0-7 5-11 10-11s10 4 10 11z"/><path d="M22 36c0-7 5-11 10-11s10 4 10 11"/><path class="thin" d="M25 34c4-3 10-3 14 0"/><circle class="fill" cx="32" cy="22" r="2.4"/><circle cx="32" cy="22" r="2.4"/>`,
      'm-034': `<path class="fill" d="M32 25c-3-3-9-3-11 2-2 4-1 11 3 16 2 3 4 4 8 4s6-1 8-4c4-5 5-12 3-16-2-5-8-5-11-2z"/><path d="M32 25c-3-3-9-3-11 2-2 4-1 11 3 16 2 3 4 4 8 4s6-1 8-4c4-5 5-12 3-16-2-5-8-5-11-2z"/><path d="M32 25v-5"/><path class="fill" d="M32 21c2-4 6-5 9-4-1 4-5 6-9 4z"/><path d="M32 21c2-4 6-5 9-4-1 4-5 6-9 4"/><path class="thin" d="M25 31c-1 3-1 6 1 9"/>`,
      'm-035': `<circle class="fill" cx="28" cy="26" r="6"/><circle class="fill" cx="37" cy="26" r="6"/><path class="fill" d="M24 31h16l-8 22z"/><path d="M24 31h16l-8 22z"/><path class="thin" d="M27 36h10M29 41h6M28 33l3 6M34 33l-3 6"/><circle cx="28" cy="26" r="6"/><circle cx="37" cy="26" r="6"/><circle class="fill" cx="32.5" cy="18" r="2"/><circle cx="32.5" cy="18" r="2"/>`,
    };
    /* Les identifiants de la carte publiée (it_1, it_2…) ne sont pas ceux de la
       démo (m-001…). Un dessin résolu uniquement par id transformait donc toute
       une rubrique en neuf bols identiques. Les règles ci-dessous partent du
       NOM réellement publié : elles restent valables après import CSV, copie
       d'une carte ou recréation d'un article. */
    const _keftaEgg = _tajine(`<circle class="fill" cx="25" cy="50" r="2.5"/><circle cx="25" cy="50" r="2.5"/><circle class="fill" cx="39" cy="50" r="2.5"/><circle cx="39" cy="50" r="2.5"/><circle class="fill" cx="32" cy="49" r="4"/><circle cx="32" cy="49" r="4"/><circle cx="32" cy="49" r="1.4"/>`);
    /* Kiwi originals based on the real objects, not generic category marks.
       The chunky food shapes and garnished glass survive the caisse's 28px
       product-card size while remaining monochrome and theme-safe. */
    const _brochettes = `<path d="M12 56L47 9M27 58L57 18"/><path class="fill" d="M17 43l6-7 7 5-6 7zM26 31l6-7 7 5-6 7zM35 19l6-7 7 5-6 7zM33 45l6-7 7 5-6 7zM41 34l6-7 7 5-6 7zM48 24l5-6 6 4-5 7z"/><path d="M17 43l6-7 7 5-6 7zM26 31l6-7 7 5-6 7zM35 19l6-7 7 5-6 7zM33 45l6-7 7 5-6 7zM41 34l6-7 7 5-6 7zM48 24l5-6 6 4-5 7z"/><path class="thin" d="M14 53c-5 0-5 7 1 7M29 55c-5 0-5 7 1 7"/>`;
    const _orangeJuice = `<path class="fill" d="M17 24h27l-3 32H21z"/><path d="M17 24h27l-3 32H21z"/><path class="thin" d="M20 33h22M26 37v15M32 37v15M38 37v15"/><path d="M34 28l7-17h9"/><circle class="fill" cx="46" cy="24" r="9"/><circle cx="46" cy="24" r="9"/><path class="thin" d="M46 15v9l6.4 6.4M46 24l-6.4 6.4M37 24h9"/>`;
    const _msemen = `<path class="fill" d="M17 23h31v25H17z"/><path d="M17 23h31v25H17z"/><path class="thin" d="M20 27l25 17M44 27L20 44M23 20h27v22M20 17h27v4"/><path d="M32 31l6 5-6 5-6-5z"/>`;
    /* Published restaurant menus have their own item IDs. These are deliberately
       different silhouettes at card size, not four category bowls repeated down
       a merchant's real menu. Keep product names as the source of truth. */
    const MENU_LIVE_ART = {
      agnolotti: `<path class="fill" d="M11 30c3-11 17-16 27-10 3 2 5 5 6 8-7 11-20 17-33 2z"/><path d="M11 30c3-11 17-16 27-10 3 2 5 5 6 8-7 11-20 17-33 2zM16 28c6-7 16-10 22-5"/><path class="thin" d="M13 33l-3 4M18 37l-2 5M25 39l-1 5M33 37l2 5M40 33l4 3"/><path class="fill" d="M34 45c3-7 11-10 18-6 2 1 4 3 5 5-5 7-13 10-23 1z"/><path d="M34 45c3-7 11-10 18-6 2 1 4 3 5 5-5 7-13 10-23 1zM39 44c4-4 9-5 13-3"/>`,
      ravioli: `<path class="fill" d="M14 19l19-7 8 21-19 7z"/><path d="M14 19l19-7 8 21-19 7zM19 20l12-4 6 15-12 4z"/><path class="thin" d="M16 15l-3 2M22 13l-2 3M29 10l-2 3M39 15l3-1M42 22l3-1M45 29l3-1M37 36l2 3M30 39l2 3M23 42l2 3M16 36l-3 2M13 29l-3 2"/><path class="fill" d="M36 40l14-5 5 14-14 5z"/><path d="M36 40l14-5 5 14-14 5zM39 42l9-3 4 8-9 3z"/>`,
      pasta: `<path d="M17 12v16a9 9 0 0 0 9 9h4M23 12v13M29 12v13M17 25h12M28 37c5-11 21-9 21 2 0 7-9 11-16 7-5-3-3-10 3-11 4-1 8 2 7 6"/><path class="thin" d="M26 46c-2 4-5 6-9 7M34 47c-1 4-3 7-7 9M44 46c2 3 5 5 8 6"/>`,
      lasagna: `<path class="fill" d="M12 38l31-17 9 7-30 18z"/><path d="M12 38l31-17 9 7-30 18zM12 38v9l10 7 30-18v-8M22 46v8M12 43l10 7 30-18M15 40l8 5 27-16"/><path class="thin" d="M27 33l5-3M35 29l5-3M24 47l26-15M25 52l25-15"/>`,
      eggplant: `<path class="fill" d="M24 26c-7 3-10 13-7 21 3 8 13 11 23 5 8-4 12-13 8-20-4-8-13-10-24-6z"/><path d="M24 26c-7 3-10 13-7 21 3 8 13 11 23 5 8-4 12-13 8-20-4-8-13-10-24-6zM22 27l-4-9 8 3 7-8 1 11 8 4-11 2zM31 21l-2-10"/><path class="thin" d="M24 42c1 5 5 8 10 7"/>`,
      cheese: `<path class="fill" d="M13 36l30-20 9 33-39 5z"/><path d="M13 36l30-20 9 33-39 5zM13 36l39 13M13 36v18M26 31c4-2 7 0 7 4s-3 6-7 5M43 16l-3 20"/><circle class="fill" cx="37" cy="44" r="3"/><circle cx="37" cy="44" r="3"/>`,
      tiramisu: `<path class="fill" d="M14 29l29-7 8 9-29 8z"/><path d="M14 29l29-7 8 9-29 8zM14 29v18l8 9 29-8V31M22 39v17M14 38l8 9 29-8M14 43l8 9 29-8"/><path class="thin" d="M20 27l3-1M27 25l3-1M34 24l3-1M26 31l3-1M33 29l3-1M40 27l3-1"/>`,
      flan: `<path d="M11 49c7 4 35 4 42 0M15 46c5 3 29 3 34 0"/><path class="fill" d="M17 42l5-19c7-4 13-4 20 0l5 19c-7 5-23 6-30 0z"/><path d="M17 42l5-19c7-4 13-4 20 0l5 19c-7 5-23 6-30 0zM22 23c5 3 15 3 20 0"/><path class="thin" d="M23 33l-2 8M40 33l2 8"/>`,
      soda: `<path class="fill" d="M22 17h20l-2 35H24z"/><path d="M22 17h20l-2 35H24zM22 17l2-5h16l2 5M24 22h16M24 47h16"/><path class="thin" d="M29 30c3-3 7-3 10 0M27 35c3-2 5-2 7 0M35 39c2-2 4-2 6 0"/>`,
      water: `<path class="fill" d="M19 18h26l-4 35H23z"/><path d="M19 18h26l-4 35H23zM22 29c5-4 9 4 14 0 3-2 5-2 7-1M25 48h14"/><path class="thin" d="M29 35c-2 2-2 5 0 6M36 37c-2 2-2 4 0 5"/>`,
      juice: `<path class="fill" d="M19 20h26l-4 33H23z"/><path d="M19 20h26l-4 33H23zM22 28h20M34 27l7-17h8M27 35h10M26 48h12"/><path class="thin" d="M28 39l3 3 4-4"/>`,
      plate: `<circle class="fill" cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="13"/><path class="thin" d="M23 33c5-6 13-7 18-1M27 39c4 2 8 2 12 0"/>`,
    };
    const normalizeMenuArtName = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, ' ').trim();
    /* Tabler Icons (MIT) · deliberately selected product silhouettes, not a
       blanket icon-font dependency. Moroccan dishes stay Kiwi originals. */
    const MENU_LIBRARY_ART = {
      salad: '<path d="M4 11h16a1 1 0 0 1 1 1v.5c0 1.5-2.517 5.573-4 6.5v1a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-1c-1.687-1.054-4-5-4-6.5V12a1 1 0 0 1 1-1"/><path d="M18.5 11c.351-1.017.426-2.236.5-3.714V6h-2.256c-2.83 0-4.616.804-5.64 2.076M5.255 11.008A12.2 12.2 0 0 1 5 9V8h1.755c.98 0 1.801.124 2.479.35M8 8l1-4 4 2.5M13 11v-.5a2.5 2.5 0 1 0-5 0v.5"/>',
      soup: '<path d="M4 11h16a1 1 0 0 1 1 1v.5c0 1.5-2.517 5.573-4 6.5v1a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-1c-1.687-1.054-4-5-4-6.5V12a1 1 0 0 1 1-1"/><path d="M8 4a2.4 2.4 0 0 0-1 2 2.4 2.4 0 0 0 1 2M12 4a2.4 2.4 0 0 0-1 2 2.4 2.4 0 0 0 1 2M16 4a2.4 2.4 0 0 0-1 2 2.4 2.4 0 0 0 1 2"/>',
      teapot: '<path d="M10.29 3h3.42a2 2 0 0 1 1.988 1.78l1.555 14A2 2 0 0 1 15.265 21h-6.53a2 2 0 0 1-1.988-2.22l1.555-14A2 2 0 0 1 10.29 3"/><path d="M7.47 12.5 3.213 7.481A.899.899 0 0 1 3.903 6h13.09A3 3 0 0 1 20 9v3c0 1.657-1.346 3-3.007 3M7 17h10"/>',
      coffee: '<path d="M3 14c.83.642 2.077 1.017 3.5 1 1.423.017 2.67-.358 3.5-1 .83-.642 2.077-1.017 3.5-1 1.423-.017 2.67.358 3.5 1M8 3a2.4 2.4 0 0 0-1 2 2.4 2.4 0 0 0 1 2M12 3a2.4 2.4 0 0 0-1 2 2.4 2.4 0 0 0 1 2"/><path d="M3 10h14v5a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6zM16.746 16.726a3 3 0 1 0 .252-5.555"/>',
      pancake: '<path d="M5 10c0-2 3.134-3 7-3s7 1 7 3-3.134 3-7 3-7-1-7-3zM5 10v4c0 2 3.134 3 7 3s7-1 7-3v-4M7 17v1c0 1.657 2.239 3 5 3s5-1.343 5-3v-1"/><path d="m10 9 2-1 2 1-2 1z"/>',
    };
    const MENU_ART_RULES = [
      [/agnol+otti/, MENU_LIVE_ART.agnolotti],
      [/ravioli|tortellini/, MENU_LIVE_ART.ravioli],
      [/lasagn/, MENU_LIVE_ART.lasagna],
      [/pappardelle|tagliatelle|spaghetti|linguine|penne|rigatoni|fusilli|pates?\b|pasta\b/, MENU_LIVE_ART.pasta],
      [/parmigiana|melanzane|aubergine/, MENU_LIVE_ART.eggplant],
      [/fromage|cheese|mozzarella/, MENU_LIVE_ART.cheese],
      [/tiramisu/, MENU_LIVE_ART.tiramisu],
      [/bonet|flan|creme caramel|pana\s*cotta/, MENU_LIVE_ART.flan],
      /* Un plat d'abord : « Tajine poulet citron » contient « citron » et
         prenait le verre de jus de la règle des boissons. */
      [/tajine.*(?:poulet|citron)/, MENU_ART['m-008']],
      [/tajine.*(?:kefta|oeuf)/, _keftaEgg],
      [/tajine/, MENU_ART['m-010']],
      [/\b(eau|water)\b/, MENU_LIVE_ART.water],
      [/\b(coca|cola|fanta|sprite|soda|pepsi|schweppes|hawaii)\b/, MENU_LIVE_ART.soda],
      [/orange|jus.*agrume/, _orangeJuice],
      [/\bjus\b|juice|limonade|citron/, MENU_LIVE_ART.juice],
      [/^pommes?$/, MENU_LIVE_ART.soda],
      [/salade/, MENU_LIBRARY_ART.salad, '24'],
      [/harira|soupe/, MENU_LIBRARY_ART.soup, '24'],
      [/brochette|grillade|kebab/, _brochettes],
      [/(?:the|atay).*(?:menthe)?/, MENU_LIBRARY_ART.teapot, '24'],
      [/cafe|espresso|americano/, MENU_LIBRARY_ART.coffee, '24'],
      [/msemen|crepe/, MENU_LIBRARY_ART.pancake, '24'],
      [/couscous/, MENU_ART['m-012']],
      [/pastilla/, MENU_ART['m-015']],
      [/sandwich|bocadillo/, MENU_ART['m-018']],
      [/wrap/, MENU_ART['m-022']],
      [/glace/, MENU_ART['m-035']],
      [/fruit/, MENU_ART['m-034']],
    ];
    /* Un article entièrement nouveau conserve un repli cohérent avec sa
       catégorie, mais tout produit reconnu reçoit d'abord sa silhouette. */
    const CAT_GLYPH_RULES = [
      [/pate|pasta/, MENU_LIVE_ART.pasta],
      [/dessert|sucre/, MENU_LIVE_ART.flan],
      [/boisson|soda|jus/, MENU_LIVE_ART.juice],
      [/entree|salade/, MENU_LIBRARY_ART.salad, '24'],
      [/sandwich|pain/, MENU_ART['m-018']],
    ];
    const menuArt = (id, cat, name) => {
      const normalized = normalizeMenuArtName(name);
      const semantic = MENU_ART_RULES.find(rule => rule[0].test(normalized));
      let art = semantic && semantic[1];
      let viewBox = '0 0 64 64';
      if (semantic && semantic[2] === '24') viewBox = '0 0 24 24';
      if (!art) art = MENU_ART[id];
      if (!art) {
        const category = normalizeMenuArtName(catLabels[cat] || cat);
        const fallback = CAT_GLYPH_RULES.find(rule => rule[0].test(category));
        art = fallback ? fallback[1] : MENU_LIVE_ART.plate;
        if (fallback && fallback[2] === '24') viewBox = '0 0 24 24';
      }
      return `<svg class="menu-art${viewBox === '0 0 24 24' ? ' menu-art--library' : ''}" viewBox="${viewBox}" aria-hidden="true">${art}</svg>`;
    };

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
    /* The language module loads deferred, after this script: subscribe once it exists. */
    (function subscribeCarteLang() {
      const hook = () => {
        try {
          if (!window.KiwiCaisseLang || !window.KiwiCaisseLang.subscribe) return false;
          window.KiwiCaisseLang.subscribe(function () { try { renderCatPills(); renderMenu(); renderCart(); } catch (_) {} });
          /* The menu translations (menu-i18n.js) are deferred as well: the first
             paint named the categories in French. Repaint once both are here. */
          if (carteLang() !== 'fr') { try { renderCatPills(); renderMenu(); } catch (_) {} }
          return true;
        } catch (_) { return false; }
      };
      if (!hook()) document.addEventListener('DOMContentLoaded', hook, { once: true });
    })();

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
            <span class="menu-item-art">${menuArt(m.id, m.cat, m.name)}</span>
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
            ${m.formula ? '<span class="menu-item-optflag">Formule</span>' : ''}
            ${qty > 0 ? `<span class="menu-item-badge mono">${qty}</span>` : ''}
            <span class="menu-item-art">${menuArt(m.id, m.cat, m.name)}</span>
            <span class="menu-item-cat">${escTeam(subLabelL(m) || catLabelL(m.cat) || '')}</span>
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
      if (line) line.qty++;
      else cart.push(Object.assign({ uid: newLineUid(), id: item.id, name: item.name, price: priced.price,
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

    let optVeil = null;
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
        openCaisseFormula(item, (parent, parts) => { cart.push(parent, ...parts); nativeHapticLight(); renderMenu(); renderCart(); });
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
        (tableOrders[selectedId] = tableOrders[selectedId] || []).push({
          uid: newLineUid(), id: 'libre', name: 'Article libre', price: amt, qty: 1, note: ''
        });
        startTableTimer(selectedId);
        renderOrderPanel(selectedId);
      } else {
        cart.push({ uid: newLineUid(), id: 'libre', name: 'Article libre', price: amt,
                    qty: 1, note: '', opts: [], optSig: '' });
        renderCart();
      }
      toast('Article libre · ' + fmtMAD(amt));
    }
    (function () {
      const mlToggle = $('#mlibre-toggle');
      const mlPad = $('#mlibre-pad');
      const mlDisplay = $('#mlibre-display');
      const mlAdd = $('#mlibre-add');
      if (!mlToggle || !mlPad) return;
      let buf = '';
      const val = () => parseFloat(buf.replace(',', '.')) || 0;
      function paint() {
        mlDisplay.textContent = buf ? buf.replace('.', ',') : '0';
        mlAdd.disabled = !(val() > 0);
      }
      mlToggle.addEventListener('click', () => {
        const open = mlPad.hidden;
        mlPad.hidden = !open;
        mlToggle.classList.toggle('is-open', open);
        mlToggle.setAttribute('aria-expanded', String(open));
      });
      mlPad.addEventListener('click', (e) => {
        const key = e.target.closest('[data-mk]');
        if (!key) return;
        const k = key.dataset.mk;
        if (k === 'back') buf = buf.slice(0, -1);
        else if (k === '.') { if (!buf.includes('.')) buf = (buf || '0') + '.'; }
        else if (buf.replace('.', '').length < 6) buf += k;
        paint();
      });
      mlAdd.addEventListener('click', () => { addOpenLine(val()); buf = ''; paint(); });
      paint();
    })();


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
        member.qty = Math.max(0, (+member.qty || 0) + delta);
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
          cart = replaceFormulaGroup(cart, parent.formulaUid, replacement);
          renderCart();
        } else if (selectedId && tableOrders[selectedId]) {
          tableOrders[selectedId] = replaceFormulaGroup(tableOrders[selectedId], parent.formulaUid, replacement);
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
      cart = applyGroupedLineQtyDelta(cart, line, delta);
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
      cart = [];
      vrapDiscount = null;
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

    /* ── kiwiSkin2027:till · le menu et l'addition sur le kit ──────────────────
       (assets/kit/till-frame.js, étape 4 (1)). Drapeau éteint, le kit n'est pas
       chargé et rien de ceci ne tourne. Allumé : <k-menu-grid> prend la place de
       la grille et <k-bill> celle du volet de l'addition, dessinés depuis le
       MÊME état que les livrés (menuItems, cart, tableOrders, generateOrder) :
       chaque fonction qui repeint la grille ou le volet repeint aussi le kit.
       Chaque geste revient ici par son nom et part dans les fonctions livrées
       (addToCart, changeCartLineQty, changeTableOrderLineQty,
       cancelCaisseLineImmediately, validateOrder). Encaisser, diviser et la
       remise ouvrent encore les fenêtres livrées, jusqu'aux étapes 4 (2) et
       4 (3). Une part de formule se change par sa formule, comme au livré. */
    let tillKit = false;
    function tillKitOn() {
      /* Un métier de pos-dispatch est à l'écran (body.is-pos) : le cadre
         partagé est le sien (étape 4 (15)), la caisse restaurant n'y peint pas. */
      if (document.body.classList.contains('is-pos')) return false;
      if (tillKit) return true;
      if (!window.KiwiTillFrame || !window.KiwiKit) return false;
      const grid = $('#menu-grid'), panel = $('.rightpanel');
      if (!grid || !panel) return false;
      const menuBox = document.createElement('div');
      menuBox.id = 'kit-menu';
      grid.parentNode.insertBefore(menuBox, grid);
      const billBox = document.createElement('div');
      billBox.id = 'kit-bill';
      panel.appendChild(billBox);
      /* Le rail du kit (§10.20, étape 4 (10)) avant la barre latérale livrée,
         qui se cache une fois le kit monté ; ses boutons restent dans la page
         et Plus les déclenche. */
      const railBox = document.createElement('div');
      railBox.id = 'kit-rail';
      const shell = $('.shell'), side = $('.sidebar');
      if (shell && side) shell.insertBefore(railBox, side);
      tillKit = !!window.KiwiTillFrame.mount({ menu: menuBox, bill: billBox, rail: railBox, menuPane: $('.main'), act: tillKitAct });
      if (tillKit) {
        document.documentElement.setAttribute('data-k-till', '');
        tillKitMoreScrim();
        /* §18.9 : « Ouvrir la caisse » ouvre le comptage du fond sur le kit. */
        const ci = document.getElementById('clockin-btn');
        if (ci && !ci.classList.contains('is-confirmed')) ci.disabled = false;
        const ciErr = document.getElementById('ci-float-err');
        if (ciErr) ciErr.hidden = true;
        /* §10.12, §10.26 : la bannière vivante et la région polie sont dans le
           DOM dès le montage, vides ; les écrire annonce une fois. */
        const main = $('.main');
        if (main && customElements.get('k-banner')) {
          const banner = document.createElement('k-banner');
          banner.id = 'kit-sync-banner';
          banner.setAttribute('live', '');
          banner.setAttribute('tone', 'danger');
          main.insertBefore(banner, main.firstChild);
        }
        const say = document.createElement('div');
        say.id = 'kit-sync-say';
        say.setAttribute('role', 'status');
        say.setAttribute('aria-live', 'polite');
        say.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
        document.body.appendChild(say);
        /* §18.3 (étape 4 (12)) : les commandes en ligne en tête de l'onglet
           À emporter (assets/kit/till-online.js) ; plus de pastille ni de
           panneau flottant. */
        const vrapBoard = $('#vrap-board');
        if (vrapBoard && window.KiwiTillOnline) {
          const online = document.createElement('div');
          online.id = 'kit-online';
          online.hidden = true;
          vrapBoard.insertBefore(online, vrapBoard.firstChild);
          window.KiwiTillOnline.mount(online, { onPaint: () => { if (tillKitOn()) window.KiwiTillFrame.paint({ rail: tillKitRail() }); } });
          const oldChip = document.getElementById('kop-chip');
          if (oldChip) oldChip.remove();
        }
      }
      return tillKit;
    }
    function tillKitSections() {
      const inView = (m) => activeCat === 'all' || (m.cat === activeCat && (!activeSub || m.subId === activeSub));
      const source = (mode !== 'vrap' && selectedId) ? (tableOrders[selectedId] || []) : cart;
      const soldOut = Array.isArray(carteState.soldOut) ? carteState.soldOut : [];
      const secs = [], byCat = {};
      const put = (m, out) => {
        const cat = String(m.cat || '');
        if (!byCat[cat]) { byCat[cat] = { id: cat || 'menu', title: catLabelL(m.cat) || '', items: [] }; secs.push(byCat[cat]); }
        byCat[cat].items.push({
          id: String(m.id), name: menuName(m), price: m.price, soldOut: out,
          options: !out && !!((m.formula && Array.isArray(m.formula.slots) && m.formula.slots.length) || itemOptGroups(m).length),
          qty: out ? 0 : source.filter(c => c.id === m.id).reduce((s, c) => s + c.qty, 0),
        });
      };
      menuItems.filter(inView).forEach(m => put(m, false));
      soldOut.filter(inView).forEach(m => put(m, true));
      return secs;
    }
    function tillKitLine(l, i) {
      const mods = [];
      if (l.opts && l.opts.length) mods.push(optText(l.opts));
      if ((l.note || '').trim()) mods.push(l.note.trim());
      const sent = !!l.sent;
      return { id: String(l.uid || 'l' + i), qty: l.qty, name: lineName(l), mods,
        price: l.total != null ? l.total : l.price * l.qty, sent, sentAt: '', sentQty: sent ? l.qty : 0 };
    }
    const tillKitDiscount = (d, amt) => amt > 0
      ? { label: d && d.kind === 'pct' ? `Remise ${d.value} %` : 'Remise', amount: -amt } : null;
    /* Ce que montre le volet livré, et rien d'autre : un volet fermé est une
       addition vide. */
    function tillKitBill() {
      const empty = { title: '', meta: '', lines: [], total: 0 };
      if ($('#rp-active').hidden) return empty;
      const title = $('#rp-table').textContent || '', meta = $('#rp-substatus').textContent || '';
      if (mode === 'vrap') {
        const gross = cart.reduce((s, l) => s + l.price * l.qty, 0);
        const disc = vrapDiscountAmount(gross);
        return { title, meta, lines: cart.map(tillKitLine), discount: tillKitDiscount(vrapDiscount, disc),
          total: Math.max(0, gross - disc), sendOnPay: true };
      }
      if (mode === 'order' && selectedId) {
        const order = tableOrders[selectedId] || [];
        return { title, meta, lines: order.map(tillKitLine), total: order.reduce((s, l) => s + l.price * l.qty, 0) };
      }
      if (selectedId && tables[selectedId]) {
        const lines = generateOrder(selectedId, tables[selectedId]);
        const gross = lines.reduce((s, l) => s + l.total, 0);
        const disc = discountAmountFor(selectedId, gross);
        return { title, meta, lines: lines.map(tillKitLine), discount: tillKitDiscount(tables[selectedId].discount, disc),
          total: Math.max(0, gross - disc), sendOnPay: true };
      }
      return empty;
    }
    /* L'encaissement dans le volet (étape 4 (2)). <k-pay> dessine et rapporte ;
       la vente passe par finalizeTender, la même frontière que les fenêtres
       livrées espèces et carte, avec le pourboire posé dans leur état
       (payTipMode). Carte : enregistrement seul, le terminal est ailleurs
       (§10.25). Autre : la méthode `wallet` (§9.6, pay.other). */
    const TILL_KIT_METHOD = { cash: 'cash', card: 'card', other: 'wallet' };
    function tillKitOpenPay() {
      if (!(currentTotal() > 0)) { toast('Addition vide'); return; }
      if (mode === 'order' && selectedId && orderInProgressCount() > 0) validateOrder(selectedId);
      resetPayTip();
      window.KiwiTillFrame.openPay({ bill: $('#rp-table').textContent || '', due: currentTotal(), method: null, tipPct: 0 });
    }
    function tillKitTip(pct) {
      const p = Math.max(0, Math.min(100, Number(pct) || 0));
      if ([0, 5, 10, 15].includes(p)) payTipMode = String(p);
      else { payTipMode = 'autre'; payTipCustom = p; }
    }
    async function tillKitConfirm(kind, value) {
      const method = TILL_KIT_METHOD[kind];
      const pay = window.KiwiTillFrame.pay();
      if (!method || tenderInFlight) return;
      /* Une part de division : son propre montant et son propre pourboire
         (§10.30) ; payTipAmount() vaut 0 pendant une division. */
      const share = tillKitShare && splitState.flow ? splitState.flow.parts[tillKitShare.idx] : null;
      const tipNow = share ? money(pay.tip()) : payTipAmount();
      const total = share ? money(share.base + tipNow) : Math.round((currentTotal() + payTipAmount()) * 100) / 100;
      const got = kind === 'cash' ? Math.round((+value.received || 0) * 100) / 100 : total;
      if (got < total) return;
      if (share) {
        share.tip = tipNow;
        share.amount = money(share.base + tipNow);
        const key = kind === 'card' ? 'carte' : kind === 'other' ? 'wallet' : 'cash';
        const idx = tillKitShare.idx;
        splitPayCallback = () => markSplitPartPaid(idx, key);
      }
      tenderInFlight = true;
      let settled;
      try { settled = await finalizeTender(method); }
      catch (_) { tenderInFlight = false; pay.notRecorded(); toast('Encaissement à vérifier dans le journal avant de réessayer'); return; }
      tenderInFlight = false;
      if (share && !share.paid) { pay.notRecorded(); return; }   // markSplitPartPaid a dit pourquoi
      const sale = settled === 'split' ? null : lastSaleEntry();
      /* §10.26 : la ligne du moment payé lit la sauvegarde du service telle
         qu'elle est au retour de recordSale. */
      const last = sale || lastSaleEntry();
      const held = !!(last && (last.saleSyncError || last.saleHeldLocal));
      const p = pay.p();
      if (tillKitSave !== true) { p.note = kkt('sync.screen_only'); p.noteTone = 'warning'; }
      else if (navigator.onLine === false || held) { p.note = kkt('sync.saved_here'); p.noteTone = ''; }
      else { p.note = ''; p.noteTone = ''; }
      pay.paid();
      if (kind === 'cash') {
        /* markSplitPartPaid ouvre déjà le tiroir d'une part payée en espèces. */
        if (!share) openCashDrawer();
        const change = Math.round((got - total) * 100) / 100;
        if (change > 0) toast('Monnaie à rendre : ' + fmtMAD(change));
      }
      if (sale) printSaleTicket(sale);
      resetPayTip();
      setTimeout(() => {
        window.KiwiTillFrame.closePay();
        if (share) tillKitAfterShare();
        try { tillKitPaint(); } catch (_) {}
      }, 1200);
    }

    /* La division dans le volet (étape 4 (4), §10.30). <k-split> choisit le
       mode et les parts ; la caisse bâtit le même flux que la fenêtre livrée
       (openSplitModal, gardée fermée, puis launchSplitFlow, avec ses gardes et
       leurs messages), et chaque part passe par le volet d'encaissement pour
       son montant, enregistrée par markSplitPartPaid comme au livré. Une part
       vide par article n'existe pas au livré : tillKitShareMap relie le numéro
       de part du kit à la part livrée. */
    let tillKitShare = null, tillKitShareMap = null;
    function tillKitSplitBill() {
      return { total: splitState.total, lines: Object.entries(splitState.itemTotals)
        .map(([name, info]) => ({ id: name, name, amount: money(info.totalQty * info.unitPrice) })) };
    }
    function tillKitPaidShares() {
      if (!splitState.flow || !tillKitShareMap) return [];
      return Object.keys(tillKitShareMap).map(Number)
        .filter(n => { const p = splitState.flow.parts[tillKitShareMap[n]]; return p && p.paid; });
    }
    function tillKitSplitStarted() {
      return !!(splitState.flow && splitState.flow.paidCount > 0 && splitState.flow.paidCount < splitState.flow.parts.length);
    }
    function tillKitOpenSplit() {
      if (!(currentTotal() > 0)) { toast('Addition vide'); return; }
      const source = mode === 'vrap' ? null : selectedId;
      const resume = tillKitSplitStarted() && (mode === 'vrap' ? splitState.isVrap : splitState.tableId === source);
      if (!resume) {
        openSplitModal(source);
        $('#split-modal').classList.remove('is-open');
        splitState.flow = null;
        tillKitShareMap = null;
      }
      window.KiwiTillFrame.openPane('split', { bill: tillKitSplitBill(), paidShares: tillKitPaidShares() });
    }
    function tillKitPayShare(n) {
      const el = window.KiwiTillFrame.pane('split');
      if (!splitState.flow) {
        const plan = el.plan();
        splitState.tipMode = '0';
        splitState.customTipPct = 0;
        if (plan.mode === 'equal') { splitState.splitMode = 'egal'; splitState.numParts = plan.n; }
        else {
          splitState.splitMode = 'article';
          splitState.numConvives = plan.n;
          splitState.perConvive = {};
          Object.entries(plan.assign).forEach(([name, s]) => {
            const info = splitState.itemTotals[name];
            if (info && s) (splitState.perConvive[s] = splitState.perConvive[s] || {})[name] = info.totalQty;
          });
        }
        launchSplitFlow();
        if (!splitState.flow) return;
        tillKitShareMap = {};
        if (splitState.splitMode === 'egal') { for (let i = 1; i <= plan.n; i++) tillKitShareMap[i] = i - 1; }
        else {
          let k = 0;
          for (let c = 1; c <= plan.n; c++) if (splitState.perConvive[c] && Object.keys(splitState.perConvive[c]).length) tillKitShareMap[c] = k++;
        }
      }
      const idx = tillKitShareMap[n];
      const part = idx == null ? null : splitState.flow.parts[idx];
      if (!part || part.paid) return;
      tillKitShare = { idx, n };
      cashAmountOverride = part.base;
      window.KiwiTillFrame.openPay({ bill: (splitState.sourceLabel || '') + ' · ' + kkt('split.share_n', { n }), due: part.base, method: null, tipPct: 0 });
    }
    function tillKitAfterShare() {
      tillKitShare = null;
      cashAmountOverride = null;
      splitPayCallback = null;
      const f = splitState.flow;
      if (f && f.paidCount >= f.parts.length) {
        window.KiwiTillFrame.closePane('split');
        closeSplitModal({ skipRevert: true });
        splitState.flow = null;
        tillKitShareMap = null;
        return;
      }
      window.KiwiTillFrame.openPane('split', { paidShares: tillKitPaidShares() });
    }
    function tillKitLeaveSplit() {
      window.KiwiTillFrame.closePane('split');
      cashAmountOverride = null;
      splitPayCallback = null;
      /* Rien de payé : rien à reprendre. Une part payée garde le flux, que
         Diviser rouvre là où il en était. */
      if (!tillKitSplitStarted()) { splitState.flow = null; tillKitShareMap = null; }
      tillKitPaint();
    }

    /* La remise dans le volet (étape 4 (4), §10.31). <k-discount> choisit le
       mode, la valeur et le motif ; remiseState reçoit le même état que la
       fenêtre livrée et applyRemise() fait le reste : politique des
       pourcentages, accord du responsable (requireManager), plafond au
       montant de l'addition. Le motif voyage par son libellé livré, que
       discountReasonCode() ramène au code du serveur. */
    const TILL_KIT_REASON = { commercial: 'Geste commercial', 'loyal-customer': 'Client habitué', 'kitchen-error': 'Erreur cuisine', other: 'Autre' };
    function tillKitDiscountTarget() {
      if (mode === 'vrap') return { target: 'vrap', tableId: null, gross: cart.reduce((s, l) => s + l.price * l.qty, 0) };
      if (selectedId && tables[selectedId]) {
        return { target: 'table', tableId: selectedId, gross: generateOrder(selectedId, tables[selectedId]).reduce((s, l) => s + l.total, 0) };
      }
      return null;
    }
    function tillKitOpenDiscount() {
      const tg = tillKitDiscountTarget();
      if (!tg || !(tg.gross > 0)) { toast('Addition vide'); return; }
      if (tg.tableId && typeof tableSplits !== 'undefined' && tableSplits.has(tg.tableId)) { toast("Termine le split d'abord"); return; }
      const P = window.KiwiDiscountPolicy;
      try { if (P && P.refresh) P.refresh(true); } catch (_) {}
      window.KiwiTillFrame.openPane('discount', { bill: { total: money(tg.gross) }, policy: {
        configured: !!(P && P.configured && P.configured()),
        percentages: (P && P.percentages && P.percentages()) || [5, 10, 15, 20],
      } });
    }
    function tillKitApplyDiscount(v) {
      const tg = tillKitDiscountTarget();
      if (!tg) return;
      Object.assign(remiseState, { target: tg.target, tableId: tg.tableId, gross: tg.gross,
        kind: v.mode === 'amount' ? 'amount' : 'pct', value: Number(v.value) || 0, reason: TILL_KIT_REASON[v.reason] || 'Autre' });
      window.KiwiTillFrame.closePane('discount');
      applyRemise();
      tillKitPaint();
    }

    /* Le rail et Plus (étape 4 (10), §18.3). Un élément du rail, une ligne de
       Plus n'existe que si son contrôle livré existe et n'est pas éteint
       (merchant-config pose [hidden] sur une fonction désactivée) : la
       ligne déclenche ce contrôle, rien n'est refait. Plus porte TOUS les
       gestes de l'ancienne barre latérale, rangés comme §18.3 les range
       (le poste, la gestion, cet appareil), en attendant leurs places
       définitives (§12). */
    const TILL_KIT_MORE = [
      ['till.more.shift', [
        ['open_drawer', 'till.more.open_drawer', '[data-action="open-drawer"]'],
        ['cash_in_out', 'till.more.cash_in_out', '[data-action="cash-move"]'],
        ['shift_change', 'till.more.shift_change', '[data-action="passation"]'],
        ['cancel_sale', 'till.more.cancel_sale', '[data-action="cancel-sale"]'],
        ['refund', 'till.more.refund', '[data-action="remboursement"]'],
        ['sales', 'till.more.sales', '#stat-txns-card'],
        ['team', 'till.more.team', '#open-team'],
        ['attendance', 'attendance.show', '#open-attendance-code'],
        ['close', 'till.more.close', '[data-action="fin-service"]'],
      ]],
      ['till.more.manage', [
        ['menu', 'till.more.menu', '#open-menu-availability'],
        ['stock', 'till.more.stock', '#open-stock'],
        ['loyalty', 'till.more.loyalty', '.rail-links [data-kcb-navitem]'],
        ['printer', 'till.more.printer', '#open-kitchen-print'],
      ]],
      ['till.more.device', [
        ['fullscreen', 'till.more.fullscreen', '#fs-toggle'],
        ['reload', 'till.more.reload', null],
        ['device_id', 'till.more.device_id', '#caisse-terminal-id'],
      ]],
    ];
    const tillKitLive = (sel) => { const el = sel && document.querySelector(sel); return el && !el.hasAttribute('hidden') ? el : null; };
    function tillKitRail() {
      const kdsOpen = !!(typeof kdsEl !== 'undefined' && kdsEl && kdsEl.classList.contains('is-open'));
      const value = kdsOpen ? 'kitchen' : mode === 'vrap' ? 'takeaway' : mode === 'waitlist' ? 'waiting' : 'floor';
      const newTickets = (typeof kdsOrders !== 'undefined' ? kdsOrders : []).filter((o) => o && o.status === 'new').length;
      /* §18.3 : le badge À emporter compte les commandes en ligne à accepter. */
      const toAccept = window.KiwiTillOnline ? window.KiwiTillOnline.pending() : 0;
      const items = [
        ['floor', 'table_restaurant', 'till.nav.floor', '.mode-pill[data-mode="salle"]'],
        ['takeaway', 'shopping_bag', 'till.nav.takeaway', '.mode-pill[data-mode="vrap"]'],
        ['waiting', 'schedule', 'till.nav.waiting', '.mode-pill[data-mode="waitlist"]'],
        ['kitchen', 'skillet', 'till.nav.kitchen', '#open-kds'],
      ].filter((r) => tillKitLive(r[3])).map(([id, icon, key]) => {
        const it = { id, icon, label: kkt(key), badge: id === 'kitchen' ? newTickets : id === 'takeaway' ? toAccept : 0 };
        if (id === 'takeaway' && toAccept) it.a11y = kkt('till.nav.takeaway_a11y', { n: toAccept });
        return it;
      });
      items.push(tillKitMoreOpen
        ? { id: 'more', icon: 'close', label: kkt('till.nav.less') }
        : { id: 'more', icon: 'more_horiz', label: kkt('till.nav.more') });
      const who = (typeof currentCashier !== 'undefined' && currentCashier && currentCashier.name) || '';
      const footer = who ? { cashier: who } : {};
      const sync = tillKitLocked() ? null : tillKitSyncFooter(tillKitSyncRows());
      if (sync) footer.sync = sync;
      /* La tête du panneau porte exactement les mêmes éléments que le rail. */
      const nav = tillKitMoreNavEl();
      if (nav) { nav.sections = [{ items: items.map((it) => Object.assign({}, it)) }]; nav.setAttribute('value', value || ''); }
      /* Plus n'est pas une destination : la lentille reste sur le mode, et
         <k-rail> comme <k-sidebar> ne laissent pas toucher l'élément qui
         porte déjà leur valeur, ce qui empêcherait Moins de refermer. */
      return { value, items, footer, label: kkt('till.nav.more') };
    }
    /* Plus REMPLACE le rail par la barre latérale livrée (propriétaire,
       2026-10-16) : la feuille rangeait les mêmes gestes sans icônes et sans
       ordre connu, et un second panneau à côté du rail ne faisait que serrer
       l'écran. La barre noire prend la place du rail et porte à sa tête, sous
       le même logo, les mêmes cinq destinations — un <k-sidebar> peint des
       mêmes éléments que le rail, Moins compris. On en sort par Moins, par un
       toucher ailleurs (le voile le prend, aucun geste ne tombe sur une
       tuile) ou par Échap. La feuille reste la route du téléphone (§18.3). */
    let tillKitMoreOpen = false, tillKitMoreNav = null;
    function tillKitMoreNavEl() {
      if (tillKitMoreNav || !customElements.get('k-sidebar')) return tillKitMoreNav;
      const side = $('.sidebar'), brand = side && side.querySelector('.brand-row');
      if (!side) return null;
      const nav = document.createElement('k-sidebar');
      nav.setAttribute('flush', '');
    /* La barre est déjà sombre : le nav lit le jeu sombre du kit par l'îlot
       (§20.7, règle 5). Un hôte ne redéclare jamais un --k-* lui-même, la
       cohabitation de token-contrast-test le lui interdit. */
    nav.setAttribute('data-k-ground', 'inverse');
      nav.setAttribute('label', kkt('till.nav.more'));
      nav.addEventListener('kiwi:action', (e) => {
        const d = e.detail || {};
        if (d.action !== 'k.sidebar.select') return;
        e.stopPropagation();
        tillKitRailSelect(d.id == null ? null : String(d.id));
      });
      side.insertBefore(nav, brand ? brand.nextSibling : side.firstChild);
      tillKitMoreNav = nav;
      return nav;
    }
    function tillKitSetMore(on) {
      on = !!on;
      if (on === tillKitMoreOpen) return;
      tillKitMoreOpen = on;
      const root = document.documentElement;
      if (on) root.setAttribute('data-k-till-more', ''); else root.removeAttribute('data-k-till-more');
      window.KiwiTillFrame.paint({ rail: tillKitRail() });
    }
    /* Le panneau tient à partir de la bande qui donne déjà 360 au ticket
       (§13.3) : 88 de rail, 260 de panneau, le menu derrière. Plus bas, Plus
       garde la feuille, la route du téléphone (§18.3). */
    const tillKitPanelFits = () => window.innerWidth >= 1000;
    function tillKitToggleMore() {
      if (!tillKitPanelFits()) { tillKitOpenMore(); return; }
      tillKitSetMore(!tillKitMoreOpen);
    }
    function tillKitMoreScrim() {
      let el = document.getElementById('kit-more-scrim');
      if (el) return el;
      el = document.createElement('div');
      el.id = 'kit-more-scrim';
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); tillKitSetMore(false); });
      document.body.appendChild(el);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tillKitMoreOpen) tillKitSetMore(false); });
      window.addEventListener('resize', () => { if (tillKitMoreOpen && !tillKitPanelFits()) tillKitSetMore(false); });
      return el;
    }
    function tillKitOpenMore() {
      const sections = TILL_KIT_MORE.map(([title, rows]) => ({
        title: kkt(title),
        rows: rows.filter((r) => !r[2] || tillKitLive(r[2])).map(([id, key]) => ({
          id, title: id === 'fullscreen' && document.fullscreenElement ? kkt('till.more.exit_fullscreen') : kkt(key),
        })),
      }));
      window.KiwiTillFrame.openMore(sections, kkt('till.nav.more'));
    }
    function tillKitMore(id) {
      if (id === 'reload') { location.reload(); return; }
      for (const [, rows] of TILL_KIT_MORE) {
        const row = rows.find((r) => r[0] === id);
        if (row) { const el = tillKitLive(row[2]); if (el) el.click(); return; }
      }
    }
    function tillKitRailSelect(id) {
      if (id === 'more') { tillKitToggleMore(); return; }
      tillKitSetMore(false);
      const kdsOpen = !!(typeof kdsEl !== 'undefined' && kdsEl && kdsEl.classList.contains('is-open'));
      if (id === 'kitchen') { if (!kdsOpen) openKds(); tillKitPaint(); return; }
      if (kdsOpen) closeKds();
      const pill = { floor: 'salle', takeaway: 'vrap', waiting: 'waitlist' }[id];
      const el = pill && tillKitLive('.mode-pill[data-mode="' + pill + '"]');
      if (el) el.click();
      tillKitPaint();
    }
    /* La synchronisation (étape 4 (11), §10.26). tillKitSyncRows() tire de
       l'état livré (KiwiLive, le journal, la dernière sauvegarde du service)
       les lignes 1 à 9, triées, aucune n'en cache une autre. Le rail montre
       l'icône de la première et un seul badge, le compte de la première des
       lignes 3 et 4 ; une seule bannière, la première des lignes 1 et 2 ;
       les lignes 3 et 4 s'annoncent poliment une fois, quand elles
       s'appliquent, jamais sur un changement de compte ; sync.saved_again
       quand la dernière des lignes 1 et 2 tombe. Sous le verrou de magasin,
       tout est calculé, rien n'est dessiné ni annoncé (R7). */
    let tillKitSave = null;            // le dernier oui / non de persistShift()
    let tillKitAllSentUntil = 0, tillKitHadQueue = false, tillKitPrev = {}, tillKitSending = false;
    function tillKitSyncRows() {
      const L = window.KiwiLive;
      const on = !!(L && L.isOn && L.isOn());
      let q = {};
      try { q = (L && L.queueStatus && L.queueStatus()) || {}; } catch (_) { q = {}; }
      const slug = on && L.merchant ? (L.merchant() || '') : '';
      const sales = (Array.isArray(journal) ? journal : []).filter((e) => e && e.kind !== 'refund' && !e.origin);
      const online = navigator.onLine !== false;
      const rows = [];
      const add = (n, key, icon, tone, count) => rows.push({ n, key, icon, tone, count: count || 0,
        text: count != null ? kkt(key, { n: count }) : kkt(key) });
      if (q.storageError || sales.some((e) => e.saleSyncError === 'queue-storage-full')) add(1, 'sync.storage_error', 'error', 'danger');
      if (tillKitSave === false) add(2, 'sync.not_saved', 'error', 'danger');
      if ((q.blocked || 0) > 0) add(3, 'sync.blocked', 'error', 'danger', q.blocked);
      if (on) {
        const refused = sales.filter((e) => e.saleSyncError && (!e.merchant || !slug || e.merchant === slug)).length;
        if (refused) add(4, 'sync.not_synced', 'warning', 'warning', refused);
        const unlinked = slug ? 0 : sales.filter((e) => e.saleSyncPending && !e.serverSaleId).length;
        if (unlinked) add(5, 'sync.waiting_store', 'storefront', 'ink2', unlinked);
      }
      if (!online && (q.pending || 0) > 0) add(6, 'sync.waiting', 'wifi_off', 'ink2', q.pending);
      if (online && (q.sending || 0) > 0) add(7, 'sync.sending', 'upload', 'ink2', q.sending);
      if (!on) add(8, 'sync.off', 'info', 'ink2');
      const queued = (q.total || 0) > 0;
      if (tillKitHadQueue && !queued) tillKitAllSentUntil = Date.now() + 4000;
      tillKitHadQueue = queued;
      if (Date.now() < tillKitAllSentUntil && !rows.some((r) => r.n <= 7)) add(9, 'sync.all_sent', 'task_alt', 'ink2');
      return rows;
    }
    function tillKitSyncFooter(rows) {
      const shown = rows.filter((r) => r.n <= 7 || r.n === 9);
      if (!shown.length) return null;
      const first = shown[0];
      const counted = shown.find((r) => r.n === 3 || r.n === 4);
      return { icon: first.icon, tone: first.tone === 'ink2' ? '' : first.tone, label: shown.map((r) => r.text).join(' · '),
        badge: counted ? counted.count : 0, badgeTone: counted ? (counted.n === 3 ? 'danger' : 'warning') : '' };
    }
    function tillKitLocked() { try { return !!(window.KiwiTillTenant && window.KiwiTillTenant.mismatch && window.KiwiTillTenant.mismatch()); } catch (_) { return false; } }
    function tillKitSay(text) {
      const say = document.getElementById('kit-sync-say');
      if (!say) return;
      if (say.textContent === text) { say.textContent = ''; setTimeout(() => { say.textContent = text; }, 60); }
      else say.textContent = text;
    }
    function tillKitSync() {
      if (!tillKitOn()) return;
      const rows = tillKitSyncRows();
      if (tillKitLocked()) return;            // R7 : calculé, ni dessiné ni annoncé
      const has = (n) => rows.find((r) => r.n === n);
      const banner = document.getElementById('kit-sync-banner');
      const top = has(1) || has(2);
      if (banner) { if (top) banner.setAttribute('message', top.text); else banner.removeAttribute('message'); }
      const was12 = tillKitPrev[1] || tillKitPrev[2];
      [3, 4].forEach((n) => { const r = has(n); if (r && !tillKitPrev[n]) tillKitSay(r.text); });
      if (was12 && !top) tillKitSay(kkt('sync.saved_again'));
      tillKitPrev = { 1: !!has(1), 2: !!has(2), 3: !!has(3), 4: !!has(4) };
      window.KiwiTillFrame.paint({ rail: tillKitRail() });
    }
    /* The indicator's popover: every applicable row, and Send now when sales
       wait on this till only (row 4). Send now replays the journal by the
       same stable ids (reconcileJournalSales), then flushes; nothing goes
       back to recordSale. */
    let tillKitSyncPop = null;
    function tillKitOpenSync(anchor) {
      if (!customElements.get('k-popover')) return;
      if (!tillKitSyncPop) {
        tillKitSyncPop = document.createElement('k-popover');
        tillKitSyncPop.addEventListener('kiwi:action', (e) => {
          const d = e.detail || {};
          if (d.action !== 'k.button.press') return;
          e.stopPropagation();
          tillKitSendNow();
        });
        document.body.appendChild(tillKitSyncPop);
      }
      const rows = tillKitSyncRows().filter((r) => r.n <= 7 || r.n === 9);
      tillKitSyncPop.setAttribute('heading', kkt('till.nav.more'));
      tillKitSyncPop.textContent = '';
      rows.forEach((r) => { const p = document.createElement('p'); p.className = 'k-body'; p.style.margin = '0 0 8px'; p.textContent = r.text; tillKitSyncPop.appendChild(p); });
      if (rows.some((r) => r.n === 4)) {
        const b = document.createElement('k-button');
        b.setAttribute('icon', 'upload');
        b.setAttribute('label', kkt('sync.send_now'));
        if (tillKitSending) b.setAttribute('disabled', '');
        b.setAttribute('data-send-now', '');
        tillKitSyncPop.appendChild(b);
      }
      tillKitSyncPop.anchor = anchor || null;
      tillKitSyncPop.setAttribute('open', '');
    }
    function tillKitSendNow() {
      if (tillKitSending) return;
      tillKitSending = true;
      const btn = tillKitSyncPop && tillKitSyncPop.querySelector('[data-send-now]');
      if (btn) btn.setAttribute('disabled', '');
      try { reconcileJournalSales(true); } catch (_) {}
      try { window.KiwiLive && window.KiwiLive.flush && window.KiwiLive.flush(true); } catch (_) {}
      setTimeout(() => {
        tillKitSending = false;
        if (btn) btn.removeAttribute('disabled');
        tillKitSync();
        if (tillKitSyncPop && tillKitSyncPop.hasAttribute('open')) tillKitOpenSync(tillKitSyncPop.anchor);
      }, 600);
    }
    function tillKitAct(verb, id, value) {
      switch (verb) {
        case 'rail.sync': tillKitOpenSync(value && value.anchor); return;
        case 'rail.select': tillKitRailSelect(id); return;
        case 'rail.cashier': tillKitToggleMore(); return;
        case 'more.select': tillKitMore(id); return;
      }
      if (window.KiwiTillFrame.busy() && !/^(pay|split|discount)\./.test(verb)) return;
      switch (verb) {
        case 'pay.tip': tillKitTip(value.pct); return;
        case 'pay.confirm': tillKitConfirm(id, value); return;
        case 'pay.leave':
          resetPayTip();
          window.KiwiTillFrame.closePay();
          if (tillKitShare) {
            tillKitShare = null;
            cashAmountOverride = null;
            window.KiwiTillFrame.openPane('split', { paidShares: tillKitPaidShares() });
          }
          tillKitPaint();
          return;
        case 'split.pay-share': tillKitPayShare(Number(id)); return;
        case 'split.leave': tillKitLeaveSplit(); return;
        case 'discount.apply': tillKitApplyDiscount(value); return;
        case 'discount.leave': window.KiwiTillFrame.closePane('discount'); tillKitPaint(); return;
      }
      const list = mode === 'vrap' ? cart : (selectedId ? (tableOrders[selectedId] || []) : []);
      const line = id ? list.find(l => String(l.uid) === id) : null;
      if (line && line.kind === 'formula-part') return;
      const click = (sel) => { const el = $(sel); if (el) el.click(); };
      switch (verb) {
        case 'add':
        case 'options':
          addToCart(id);
          return;
        case 'step':
        case 'remove': {
          if (!line) return;
          const delta = verb === 'remove' ? (value.anchor ? -line.qty : -1) : (value.dir > 0 ? 1 : -1);
          if (mode === 'vrap') changeCartLineQty(line.uid, delta);
          else if (mode === 'order' && selectedId) changeTableOrderLineQty(selectedId, line.uid, delta);
          return;
        }
        case 'void':
          if (!line) return;
          if (mode === 'vrap') changeCartLineQty(line.uid, -1);
          else if (mode === 'order' && selectedId) changeTableOrderLineQty(selectedId, line.uid, -1);
          else if (selectedId && line.sent) cancelCaisseLineImmediately(selectedId, line);
          return;
        case 'send':
          if (mode === 'order' && selectedId) validateOrder(selectedId);
          return;
        case 'pay':
          tillKitOpenPay();
          return;
        case 'split': tillKitOpenSplit(); return;
        case 'discount': tillKitOpenDiscount(); return;
        case 'print': click('[data-action="print-bill"]'); return;
      }
    }
    function tillKitPaint() {
      if (!tillKitOn()) return;
      /* Le volet livré s'est fermé (autre table, autre mode) : l'encaissement
         en cours n'a plus d'addition sous lui. */
      if ($('#rp-active').hidden && !tenderInFlight) {
        window.KiwiTillFrame.closePay();
        window.KiwiTillFrame.closePane('discount');
        if (!tillKitSplitStarted()) window.KiwiTillFrame.closePane('split');
      }
      window.KiwiTillFrame.paint({ sections: tillKitSections(), bill: tillKitBill(), rail: tillKitRail() });
    }
    /* Peint tout de suite, puis une fois encore à l'image suivante : le
       volet livré se montre souvent JUSTE APRÈS sa fonction de rendu (une
       table ouverte au plan : renderRightPanel, puis #rp-active visible), et
       l'addition du kit lirait un volet encore fermé. Les signatures de
       till-frame.js rendent la seconde peinture gratuite quand rien n'a bougé. */
    let tillKitFramePending = false;
    function tillKitAfter(fn) {
      return function () {
        const r = fn.apply(this, arguments);
        try { tillKitPaint(); } catch (e) { console.warn('[till-kit]', e); }
        if (!tillKitFramePending) {
          tillKitFramePending = true;
          requestAnimationFrame(() => { tillKitFramePending = false; try { tillKitPaint(); } catch (e) { console.warn('[till-kit]', e); } });
        }
        return r;
      };
    }
    if (document.documentElement.getAttribute('data-skin-2027') === 'till') {
      renderMenu = tillKitAfter(renderMenu);
      renderCart = tillKitAfter(renderCart);
      renderOrderPanel = tillKitAfter(renderOrderPanel);
      renderRightPanel = tillKitAfter(renderRightPanel);
      showEmpty = tillKitAfter(showEmpty);
      setMode = tillKitAfter(setMode);
      openKds = tillKitAfter(openKds);
      closeKds = tillKitAfter(closeKds);
      const persistShiftShipped = persistShift;
      persistShift = function () {
        const r = persistShiftShipped.apply(this, arguments);
        if (r === true || r === false) tillKitSave = r;
        try { tillKitSync(); } catch (_) {}
        return r;
      };
      ['kiwi:sale-queue', 'kiwi:money-sync', 'online', 'offline'].forEach((ev) => window.addEventListener(ev, () => { try { tillKitSync(); } catch (_) {} }));
      /* Le kit arrive en scripts différés, après ce script : on peint une
         première fois quand il est là. */
      document.addEventListener('DOMContentLoaded', () => { try { tillKitPaint(); } catch (e) { console.warn('[till-kit]', e); } });
    }

    /* La clôture sur le kit (étape 4 (7), §18.9). Drapeau allumé, Clôturer
       ouvre <k-cash-count> dans une feuille de comptage (k-sheet size count) au
       lieu de la fenêtre livrée. renderCloture() tourne d'abord, fenêtre gardée
       fermée : il calcule l'attendu et le total carte de Kiwi comme avant. Le
       comptage rend le compté, le motif de l'écart hors tolérance et le total
       carte du terminal ; la caisse les pose dans les champs livrés
       (#clo-count, #clo-card-z) et appelle closeRegister() : rapport, Z,
       événement de caisse et fin de poste restent les livrés. Le motif part
       avec l'événement de clôture (gapReason, cash_session_events.gap_reason).
       « Saisir le total » rouvre la fenêtre livrée, déjà remplie. */
    /* closeGapReason et tillKitCount sont déclarés avec registerClosed, plus bas,
       là où closeRegisterSteps() les lit. */
    function tillKitOpenCount() {
      if (!tillKitOn() || !customElements.get('k-cash-count') || !customElements.get('k-sheet')) return false;
      renderCloture(false);
      const tot = journalTotals();
      if (tillKitCount) tillKitCount.sheet.remove();
      const sheet = document.createElement('k-sheet');
      sheet.setAttribute('size', 'count');
      const cc = document.createElement('k-cash-count');
      cc.setAttribute('mode', 'close');
      sheet.appendChild(cc);
      document.body.appendChild(sheet);
      tillKitCount = { sheet, cc };
      sheet.addEventListener('kiwi:action', (e) => {
        const d = e.detail || {};
        if (d.action === 'k.sheet.close') { sheet.removeAttribute('open'); return; }
        if (d.action === 'k.cash-count.enter-total') { sheet.removeAttribute('open'); $('#cloture-modal').classList.add('is-open'); return; }
        if (d.action !== 'k.cash-count.close') return;
        const v = d.value || {};
        $('#clo-count').value = String(v.counted);
        $('#clo-card-z').value = String(v.cardTotal == null ? clotureCardExpected : v.cardTotal);
        closeGapReason = v.reason || null;
        sheet.removeAttribute('open');
        closeRegister();
      });
      cc.cardKiwi = clotureCardExpected;
      cc.count = { opening: openingFloat, cashSales: tot.cash, cashTips: tot.cashTips, cashIn: tot.movesIn, cashOut: tot.movesOut, refundsCash: 0 };
      sheet.setAttribute('open', '');
      return true;
    }

    /* kiwiSkin2027:till · le fond d'ouverture sur le kit (étape 4 (13), §18.9).
       « Ouvrir la caisse » ouvre <k-cash-count mode="open"> : le fond est ce
       que le caissier COMPTE, rien n'est prérempli ; le dernier fond n'est
       qu'une puce à toucher (count.same_as_last, la même mémoire que les
       puces livrées). Ouvrir pose openingFloat puis reprend openService() :
       contrôle horaire, doOpenService(), l'évènement d'ouverture. Commit
       part sur l'écriture locale, dans doOpenService(). */
    let tillKitFloat = null;
    function tillKitOpenFloat() {
      if (!tillKitOn() || !customElements.get('k-cash-count') || !customElements.get('k-sheet')) return false;
      if (tillKitFloat) tillKitFloat.sheet.remove();
      const sheet = document.createElement('k-sheet');
      sheet.setAttribute('size', 'count');
      const cc = document.createElement('k-cash-count');
      cc.setAttribute('mode', 'open');
      sheet.appendChild(cc);
      document.body.appendChild(sheet);
      const done = () => { try { cc.committed(); } catch (_) {} sheet.removeAttribute('open'); setTimeout(() => sheet.remove(), 400); tillKitFloat = null; };
      tillKitFloat = { sheet, cc, done };
      sheet.addEventListener('kiwi:action', (e) => {
        const d = e.detail || {};
        if (d.action === 'k.sheet.close') { sheet.removeAttribute('open'); return; }
        /* « Saisir le total » : les puces livrées et leur montant libre. */
        if (d.action === 'k.cash-count.enter-total') {
          sheet.removeAttribute('open');
          const box = $('.clockin-float');
          if (box) box.classList.add('k-shown');
          const other = $('#ci-float-chips [data-float="custom"]');
          if (other) other.click();
          return;
        }
        if (d.action !== 'k.cash-count.open') return;
        const v = d.value || {};
        openingFloat = Math.max(0, Number(v.counted) || 0);
        floatChosen = true;
        rememberFloat(openingFloat);
        openService();
      });
      let last = NaN;
      try { last = parseFloat(localStorage.getItem(floatMemKey())); } catch (_) {}
      cc.count = { lastFloat: Number.isFinite(last) && last > 0 ? last : null };
      sheet.setAttribute('open', '');
      return true;
    }

    /* Event delegation: tables, menu items, cart qty, cat pills */
    document.addEventListener('click', (e) => {
      /* La pastille « commande en attente » ouvre la file, pas la table : ce
         que le caissier veut à cet instant, c'est LIRE ce qui a été commandé
         puis l'accepter · ouvrir l'addition de la table ne le lui montre pas. */
      const opBadge = e.target.closest('.cplan-order');
      if (opBadge) {
        e.stopPropagation();
        try { if (window.KiwiOrderInbox) KiwiOrderInbox.open(); } catch (_) {}
        return;
      }
      // Tables (only in salle mode)
      const tableEl = e.target.closest(TBL_SEL);
      if (tableEl && mode === 'salle') {
        const id = tableEl.dataset.table;
        const t = tables[id];
        if (!t) return;
        /* A plan refresh used to be able to repaint an OrderPro table as
           empty while its canonical bill/pending badge still existed. The
           durable order evidence wins at click time too, so the cashier can
           never be asked to open a second visit over the guest's order. */
        if (t.status === 'khawya' && ((tableOrders[id] || []).length
            || phoneSeats.has(tableKey(id)) || phonePending.has(tableKey(id)))) {
          t.status = 'ka-yaklo';
          refreshTableNode(id);
        }
        if (wlSeating) {  // choosing a table for a waitlist party
          if (t.status === 'khawya') seatPartyAt(id);
          else toast('Table occupée, choisis une table libre');
          return;
        }
        if (t.status === 'khawya')  { openNewTableModal(id); return; }
        if (t.status === 'khlass')  { return; }
        if (t.status === 'a-commander' || (!orders[id]?.length && !tableOrders[id]?.length && t.status !== 'bgha-ykhlass')) {
          resumeTableOrder(id);
          return;
        }
        openTable(id);
        return;
      }

      // Cat pills
      const catBtn = e.target.closest('.cat-pill[data-cat]');
      if (catBtn) {
        activeCat = catBtn.dataset.cat;
        activeSub = null;
        renderCatPills();
        renderMenu();
        return;
      }

      // Stepper buttons inside a menu card (− / +) · check BEFORE the card click
      const stepBtn = e.target.closest('.step-btn');
      if (stepBtn) {
        const card = stepBtn.closest('.menu-item');
        if (card) {
          const mid = card.dataset.menuId, inc = stepBtn.dataset.step === 'inc';
          if (mode === 'order') {
            if (selectedId) {
              inc ? addToTableOrder(selectedId, mid) : tableOrderMinusMenu(selectedId, mid);
            } else {
              toast('Aucune table sélectionnée');
              backToSalle();
            }
          } else {
            inc ? addToCart(mid) : cartMinusMenu(mid);
          }
        }
        return;
      }

      // « Souvent avec… » → même ajout qu'un toucher sur la carte du plat.
      const pairAdd = e.target.closest('[data-pair-add]');
      if (pairAdd) {
        const id = pairAdd.dataset.pairAdd;
        if (mode === 'order') { if (selectedId) addToTableOrder(selectedId, id); }
        else addToCart(id);
        return;
      }
      const pairNo = e.target.closest('[data-pair-dismiss]');
      if (pairNo) {
        const scope = pairNo.closest('[data-pair-scope]')?.dataset.pairScope || 'cart';
        try { KiwiPairs.dismiss(scope, pairNo.dataset.pairDismiss); } catch (_) {}
        if (mode === 'order') { if (selectedId) renderOrderPanel(selectedId); } else renderCart();
        return;
      }

      // Menu card body → add one (to table order or cart depending on mode)
      const menuCard = e.target.closest('.menu-item');
      if (menuCard && menuCard.classList.contains('is-86')) { toast('Plat épuisé · retiré de la vente'); return; }
      if (menuCard) {
        if (mode === 'order') {
          if (selectedId) {
            addToTableOrder(selectedId, menuCard.dataset.menuId);
          } else {
            toast('Aucune table sélectionnée');
            backToSalle();
          }
        } else {
          addToCart(menuCard.dataset.menuId);
        }
        return;
      }

      // One tap on − cancels exactly one sent item. The paired caisse is the
      // authorization; no per-item reason dialog or PIN is required.
      const tableVoidBtn = e.target.closest('[data-table-void]');
      if (tableVoidBtn && selectedId) {
        const line = (tableOrders[selectedId] || []).find(l => l.uid === tableVoidBtn.dataset.tableVoid);
        if (line && line.sent) cancelCaisseLineImmediately(selectedId, line);
        return;
      }

      const holdBtn = e.target.closest('[data-hold-uid]');
      if (holdBtn) {
        if (mode === 'order' && selectedId) toggleLineHold(selectedId, holdBtn.dataset.holdUid);
        return;
      }

      // Cart qty +/- buttons (vente rapida) · one specific line by uid
      const qtyBtn = e.target.closest('.qty-btn');
      if (qtyBtn) {
        const d = qtyBtn.dataset.cartAction === 'inc' ? 1 : -1;
        const row = qtyBtn.closest('[data-cart-uid]');
        if (row) changeCartLineQty(row.dataset.cartUid, d);
        const oRow = qtyBtn.closest('[data-order-uid]');
        if (oRow && mode === 'order' && selectedId) changeTableOrderLineQty(selectedId, oRow.dataset.orderUid, d);
        return;
      }
    });

    /* Per-dish kitchen note typed into a line · persist without re-rendering
       (so focus stays); the note then routes with that dish to its station. */
    document.addEventListener('input', (e) => {
      const inp = e.target.closest('.rp-item-note');
      if (!inp) return;
      const uid = inp.dataset.noteUid;
      const list = (mode === 'order' && selectedId) ? (tableOrders[selectedId] || []) : cart;
      const line = list.find(l => l.uid === uid);
      if (line) {
        line.note = inp.value;
        inp.classList.toggle('has-note', !!inp.value.trim());
      }
    });
    document.addEventListener('keydown', (e) => {
      const a = document.activeElement;
      if ((e.key === 'Enter' || e.key === ' ') && (a?.matches?.(TBL_SEL) || a?.matches?.('.menu-item'))) {
        e.preventDefault();
        a.click();
      }
    });

    /* ---------- Full Order Review Modal ---------- */
    function openOrderReviewModal() {
      const modal = $('#order-review-modal');
      if (!modal) return;
      renderOrderReviewContent();
      modal.classList.add('is-open');
      if (window.lucide) lucide.createIcons();
    }

    function closeOrderReviewModal() {
      const modal = $('#order-review-modal');
      if (modal) modal.classList.remove('is-open');
    }

    function renderOrderReviewContent() {
      const isVrap = mode === 'vrap';
      const order = isVrap ? cart : (tableOrders[selectedId] || []);
      const t = (!isVrap && selectedId) ? tables[selectedId] : null;
      const gross = order.reduce((s, l) => s + l.price * l.qty, 0);
      const itemCount = order.reduce((s, l) => s + l.qty, 0);
      const discAmt = isVrap ? vrapDiscountAmount(gross) : 0;
      const net = Math.max(0, gross - discAmt);
      const editing = isVrap && vrapEditingNum != null;

      // Badges & Titles
      const badge = $('#or-modal-badge');
      if (badge) badge.textContent = isVrap ? (editing ? `Vente #${vrapEditingNum}` : 'À emporter') : `Table ${selectedId}`;
      const title = $('#or-modal-title');
      if (title) title.textContent = isVrap ? (editing ? `Commande #${vrapEditingNum}` : 'Vente à emporter') : (t ? `Table ${selectedId} · ${t.covers} couvert${t.covers > 1 ? 's' : ''}` : 'Commande');
      const sub = $('#or-modal-sub');
      if (sub) sub.textContent = `${itemCount} article${itemCount > 1 ? 's' : ''} · ${fmtMAD(net)}`;

      const list = $('#or-items-list');
      if (!list) return;

      if (!order.length) {
        list.innerHTML = `
          <div style="text-align:center; padding:36px 16px; color:var(--ink-3);">
            <i data-lucide="shopping-cart" style="width:36px;height:36px;margin:0 auto 10px;display:block;opacity:0.6;"></i>
            <p style="margin:0; font-size:14px; font-weight:600;">Aucun article dans cette commande</p>
          </div>`;
      } else {
        list.innerHTML = order.map((l) => {
          const optList = (l.opts && l.opts.length) ? l.opts : [];
          const optPills = optList.map(o => {
            const extra = Number(o.price || o.extra || 0);
            return `<span class="or-opt-pill">${kdsEsc(o.name || o.label || o)}${extra > 0 ? ` (+${fmtMAD(extra)})` : ''}</span>`;
          }).join('');

          return `
            <div class="or-item-card" data-review-uid="${l.uid}">
              <div class="or-item-stepper-col">
                ${l.kind === 'formula-part' ? `
                  <span class="or-item-sent-badge">Inclus</span>
                ` : l.sent ? `
                  <span class="or-item-sent-badge">
                    ${KDS_SVG.check} En cuisine
                  </span>
                ` : `
                  <div class="or-item-stepper">
                    <button class="or-stepper-btn" data-review-action="dec" aria-label="Moins">−</button>
                    <span class="or-stepper-num mono">${l.qty}</span>
                    <button class="or-stepper-btn" data-review-action="inc" aria-label="Plus">+</button>
                  </div>
                `}
              </div>
              <div class="or-item-content">
                <div class="or-item-title">${kdsEsc(l.name)}${lineHeld(l, order) ? ' <span class="rp-hold-mark">À suivre</span>' : ''}</div>
                ${optPills ? `<div class="or-item-opts-row">${optPills}</div>` : ''}
                <div class="or-item-note-box">
                  <input class="or-note-input" data-review-note-uid="${l.uid}"
                    value="${kdsEsc(l.note || '')}" placeholder="Note cuisine, ex. bien chaud, sans oignon…"
                    aria-label="Note cuisine, ${kdsEsc(l.name)}" />
                </div>
              </div>
              <div class="or-item-price mono">${fmtMAD(l.price * l.qty)}</div>
              <div class="or-item-actions">
                ${l.sent && l.kind !== 'formula-part' ? `
                  <button class="or-item-del-btn or-item-void-btn" data-review-action="void"
                    title="Annuler un article envoyé en cuisine"
                    aria-label="Annuler un ${kdsEsc(l.name)} envoyé en cuisine">
                    <i data-lucide="trash-2"></i>
                  </button>
                ` : ''}
                ${!l.sent && l.kind === 'formula' ? `
                  <button class="or-item-edit-btn" data-review-action="edit-formula" aria-label="Modifier la formule">
                    Modifier
                  </button>
                ` : ''}
                ${l.sent || l.kind === 'formula-part' ? '' : `
                  <button class="or-item-del-btn" data-review-action="del" title="Supprimer la ligne" aria-label="Supprimer">
                    <i data-lucide="trash-2"></i>
                  </button>
                `}
              </div>
            </div>`;
        }).join('');
      }

      // Summary lines
      const subtotalEl = $('#or-subtotal');
      if (subtotalEl) subtotalEl.textContent = fmtMAD(gross);
      const discRow = $('#or-discount-row');
      if (discRow) {
        discRow.hidden = discAmt <= 0;
        if (discAmt > 0) {
          const discValEl = $('#or-discount-val');
          if (discValEl) discValEl.textContent = `−${fmtMAD(discAmt)}`;
          const discLblEl = $('#or-discount-lbl');
          if (discLblEl) discLblEl.textContent = vrapDiscount && vrapDiscount.kind === 'pct' ? `Remise ${vrapDiscount.value} %` : 'Remise';
        }
      }
      const totalEl = $('#or-total');
      if (totalEl) totalEl.textContent = fmtMAD(net);

      // Foot buttons
      const btnKitchen = $('#or-btn-kitchen');
      if (btnKitchen) {
        const hasUnsent = isVrap ? !editing : order.some(l => !l.sent);
        btnKitchen.hidden = !hasUnsent || order.length === 0;
      }
      const payLabel = $('#or-pay-label');
      if (payLabel) payLabel.textContent = `Encaisser ${fmtMAD(net)}`;

      if (window.lucide) lucide.createIcons();
    }

    /* Event delegation inside Order Review Modal */
    document.addEventListener('click', (e) => {
      // Open modal triggers
      if (e.target.closest('#rp-expand-btn') || e.target.closest('#rp-head-info')) {
        openOrderReviewModal();
        return;
      }
      // Close modal triggers
      if (e.target.closest('#or-modal-close') || e.target.closest('#or-btn-back')) {
        closeOrderReviewModal();
        return;
      }

      // Action inside review modal: stepper dec / inc
      const stepBtn = e.target.closest('.or-stepper-btn');
      if (stepBtn) {
        const row = stepBtn.closest('[data-review-uid]');
        if (!row) return;
        const uid = row.dataset.reviewUid;
        const d = stepBtn.dataset.reviewAction === 'inc' ? 1 : -1;
        if (mode === 'vrap') {
          changeCartLineQty(uid, d);
        } else if (selectedId) {
          changeTableOrderLineQty(selectedId, uid, d);
        }
        renderOrderReviewContent();
        return;
      }

      // Action inside review modal: edit an unsent formula as one bundle
      const editFormulaBtn = e.target.closest('.or-item-edit-btn');
      if (editFormulaBtn) {
        const row = editFormulaBtn.closest('[data-review-uid]');
        if (row) editFormulaLine(row.dataset.reviewUid);
        return;
      }

      // The full bill follows the same one-tap rule as the compact bill.
      const voidBtn = e.target.closest('.or-item-void-btn[data-review-action="void"]');
      if (voidBtn && selectedId) {
        const row = voidBtn.closest('[data-review-uid]');
        const line = row && (tableOrders[selectedId] || []).find(item => item.uid === row.dataset.reviewUid);
        if (line && line.sent) {
          closeOrderReviewModal();
          cancelCaisseLineImmediately(selectedId, line);
        }
        return;
      }

      // Action inside review modal: delete item line
      const delBtn = e.target.closest('.or-item-del-btn');
      if (delBtn) {
        const row = delBtn.closest('[data-review-uid]');
        if (!row) return;
        const uid = row.dataset.reviewUid;
        if (mode === 'vrap') {
          cart = removeGroupedLine(cart, uid);
          renderMenu();
          renderCart();
        } else if (selectedId && tableOrders[selectedId]) {
          tableOrders[selectedId] = removeGroupedLine(tableOrders[selectedId], uid);
          renderMenu();
          renderOrderPanel(selectedId);
        }
        renderOrderReviewContent();
        return;
      }

      // Kitchen dispatch from review modal
      if (e.target.closest('#or-btn-kitchen')) {
        closeOrderReviewModal();
        if (mode === 'vrap') {
          const btn = $('#rp-send-kitchen');
          if (btn) btn.click();
        } else if (selectedId) {
          validateOrder(selectedId);
        }
        return;
      }

      // Pay button from review modal
      if (e.target.closest('#or-btn-pay')) {
        closeOrderReviewModal();
        if (mode === 'vrap') {
          const btn = $('#pay-charge');
          if (btn) btn.click();
        } else if (selectedId) {
          const btn = mode === 'order' ? $('#pay-charge-order') : $('#pay-charge');
          if (btn) btn.click();
        }
        return;
      }
    });

    // Kitchen note inputs inside review modal
    document.addEventListener('input', (e) => {
      const inp = e.target.closest('.or-note-input');
      if (!inp) return;
      const uid = inp.dataset.reviewNoteUid;
      const list = (mode === 'order' && selectedId) ? (tableOrders[selectedId] || []) : cart;
      const line = list.find(l => l.uid === uid);
      if (line) {
        line.note = inp.value;
        const sideInp = document.querySelector(`.rp-item-note[data-note-uid="${uid}"]`);
        if (sideInp) {
          sideInp.value = inp.value;
          sideInp.classList.toggle('has-note', !!inp.value.trim());
        }
      }
    });

    /* ---------- Right panel actions ---------- */
    $('#rp-close').addEventListener('click', () => {
      if (mode === 'vrap') {
        // Clear the working cart entirely
        clearCart();
        return;
      }
      /* LA CROIX, EN MODE COMMANDE. Elle tombait jusqu'ici dans closeRightPanel()
         · écrit pour la salle · qui efface la table sélectionnée et laisse le
         mode en place : la caisse se bloquait (voir backToSalle). Une mesa
         ouverte par erreur, client pas encore prêt à commander, doit se refermer
         ici : c'est ce que le geste promet. Dès qu'il y a des plats saisis on ne
         les jette pas d'un doigt distrait · le panneau reste, et le serveur
         tranche lui-même entre envoyer et annuler. */
      if (mode === 'order') {
        if (orderInProgressCount() > 0) { toast('Valide ou annule la commande d\'abord'); return; }
        cancelNewOrder();
        return;
      }
      // Salle mode: just close the panel · the table keeps its real status.
      closeRightPanel();
    });

    $('#pay-split').addEventListener('click', () => {
      if (mode === 'vrap') {
        if (!cart.length) { toast('Commande vide'); return; }
        openSplitModal(null);
        return;
      }
      if (selectedId) openSplitModal(selectedId);
    });
    /* L'ADDITION (pré-note remise à table). Ce n'est pas un reçu : ni numéro, ni
     * ICE, ni TVA · volontairement, parce qu'elle n'est pas une pièce fiscale.
     * Elle garde donc son propre chemin.
     *
     * Ce qu'elle n'avait pas : un repli. KiwiHardware.print() rend
     * « printer-not-configured » dès qu'aucune imprimante THERMIQUE n'est jointe
     * et s'arrête là · sur un restaurant équipé d'une imprimante branchée en
     * USB sous Windows, ce bouton ne sortait donc rien du tout. KiwiPrinter sait
     * pourtant imprimer par le pilote système (browserReceipt) ; personne ne
     * l'appelait. Et le message renvoyait vers « l'imprimante dans Réglages »,
     * un écran qui n'existe pas sur la caisse. */
    function printHardwareTicket(ticket) {
      const KP = window.KiwiPrinter;
      const viaSystem = () => {
        /* browserReceipt() et non printReceipt() : la première peint le ticket
           et le donne au pilote du système, la seconde pousse de l'ESC/POS et
           échoue exactement là où on en est. Même objet en entrée. */
        if (!KP || !KP.browserReceipt) { toast('Impression indisponible sur cet appareil'); return; }
        try {
          Promise.resolve(KP.browserReceipt({
            shop: ticket && ticket.title, lines: (ticket && ticket.lines) || [],
            total: ticket && ticket.total, method: ticket && ticket.method,
          })).then(
            (r) => toast(r && r.ok ? (r.via === 'pdf' ? 'Addition prête · imprimer ou partager le PDF' : 'Addition ouverte dans l\'impression système') : 'Impression échouée'),
            () => toast('Impression échouée')
          );
        } catch (_) { toast('Impression échouée'); }
      };
      if (!window.KiwiHardware) { viaSystem(); return; }
      Promise.resolve(window.KiwiHardware.print(ticket)).then(function (res) {
        if (res && res.printed) toast('Addition imprimée');
        else if (res && res.mock) toast('Aperçu de démonstration, aucun ticket physique imprimé');
        else viaSystem();
      }, viaSystem);
    }
    $$('.meta-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.action;
        // 'discount' is handled by the [data-action] delegation listener below.
        if (a === 'print-bill') {
          var _lines = Array.prototype.slice.call(document.querySelectorAll('#rp-items > *')).map(function (row) {
            var q = row.querySelector('.rp-item-qty'); var n = row.querySelector('.rp-item-name'); var p = row.querySelector('.rp-item-price');
            var name = n ? n.textContent.trim() : '';
            return name ? { qty: (q ? q.textContent.replace('×', '').trim() : ''), name: name, price: (p ? p.textContent.trim() : '') } : null;
          }).filter(Boolean);
          var _ticket = {
            title: (document.getElementById('rp-table') ? document.getElementById('rp-table').textContent.trim() : 'Reçu Kiwi'),
            lines: _lines,
            total: (document.getElementById('rp-total') ? document.getElementById('rp-total').textContent.trim() : '')
          };
          window.__lastTicket = _ticket;
          printHardwareTicket(_ticket);
        }
        else if (a === 'reprint-bill') {
          /* Ce bouton rejouait window.__lastTicket · une variable de page. Elle
             ne survit ni au rechargement, ni à la mise à jour du service worker,
             ni à l'onglet que iOS tue en arrière-plan. Après midi, le moment
             exact où l'on réimprime, il répondait « Aucun ticket » sur une
             caisse qui avait encaissé toute la matinée.
             Le journal, lui, est écrit. On y prend la dernière vente et on
             ressort SON ticket : même numéro, même heure, mention de duplicata.
             Repli sur l'ancien chemin si le journal est vide mais qu'un ticket
             vient d'être tiré dans cette page · un service qui vient d'ouvrir. */
          const last = journal.slice().reverse().find((e) => e && e.kind !== 'refund' && e.amount > 0);
          const doc = last ? receiptDocFor(last, { copy: true }) : null;
          if (doc) {
            toast('Impression du reçu…');
            Promise.resolve(window.KiwiReceipt.print(doc)).then(
              (r) => toast(r && r.ok ? 'Duplicata imprimé' : 'Impression échouée'),
              () => toast('Impression échouée')
            );
          }
          else if (window.__lastTicket) printHardwareTicket(window.__lastTicket);
          else toast('Aucun ticket à réimprimer');
        }
        else if (a === 'cancel-table') {
          if (mode === 'order') {
            // Building a new mesa · cancel it properly (drops the order, back to Salle)
            cancelNewOrder();
            return;
          }
          if (mode === 'vrap') {
            /* ── VIDER UNE COMMANDE EST UNE PERTE, PAS UNE NAVIGATION ───────
             * Un seul tap effaçait le panier · et, depuis la reprise d'une
             * expirée, une vente déjà chiffrée · sans demander à personne et
             * sans que rien ne dise QUI l'avait fait. Le bouton est rouge mais
             * il n'était gardé par rien.
             *
             * On passe donc par la même porte que les autres gestes sensibles
             * (requireTillOperator › KiwiCaissePairing.authorizeTill ›
             * POST /api/pin/verify) : le code de l'employé est jugé PAR LE
             * SERVEUR, la caisse ne le compare jamais elle-même, et un serveur
             * injoignable répond non — une autorisation qu'on ne peut pas
             * prouver n'est pas une autorisation.
             *
             * La destruction vit ENTIÈREMENT dans le rappel : code refusé,
             * réseau coupé, pavé fermé au doigt mouillé · le panier est encore
             * là. Et un panier vide ne réclame rien : on ne fait pas frapper un
             * code pour ne rien perdre. */
            const editingOrder = vrapEditingNum != null
              ? kdsOrders.find(x => x && x.num === vrapEditingNum) : null;
            const liveOrder = !!(editingOrder && editingOrder.opId && !editingOrder.paid);
            if (!liveOrder && !cart.length) { clearCart(); return; }
            window.KiwiAuthAct?.(liveOrder ? { kind: 'cancel_order', key: 'act.cancel_order', args: { order: ticketNo(editingOrder) } } : { kind: 'clear_order', key: 'act.clear_order' });
            requireTillOperator(
              liveOrder ? `Annuler la commande ${ticketNo(editingOrder)}` : 'Vider la commande',
              (who) => {
                if (liveOrder) {
                  cancelOrderProTakeaway(editingOrder, who);
                  return;
                }
                clearCart();
                const by = who && who.name ? ` · ${who.name}` : '';
                toast(`Commande vidée${by}`);
              },
              /* Annuler une commande déjà partie est une écriture serveur sans
                 file d'attente : sans connexion, pas de code. Vider un panier
                 local, lui, n'a besoin de personne. */
              liveOrder ? TILL_NEEDS_SERVER : undefined
            );
            return;
          }
          if (selectedId) {
            if (storeIsReal()) {
              const tid = selectedId;
              window.KiwiAuthAct?.({ kind: 'cancel_table', key: 'act.cancel_table', args: { table: tid } });
              requireTillOperator(`Annuler la table ${tid} et prévenir la cuisine`, async (who) => {
                try { await cancelSentTable(tid, who); }
                catch (err) { toast(`Table ${tid} conservée · ${err.message || 'annulation non transmise'}`); }
              }, tableCancelNeedsServer(tid) ? TILL_NEEDS_SERVER : undefined);
              return;
            }
            /* A guest can open a table from the NFC menu, browse, then leave
               without ordering. In that case this button clears the local
               table and closes its OrderPro session after identifying the actor.
               If items have been entered (an unsent order), cancelling is a loss:
               it must pass through requireTillOperator. A meal already sent
               to the kitchen remains protected outright. */
            if (tableSentCount(selectedId) === 0) {
              const hasItems = (tableOrders[selectedId] || []).length > 0;
              if (!hasItems) {
                cancelOpenTable(selectedId);
                return;
              }
              const tid = selectedId;
              window.KiwiAuthAct?.({ kind: 'cancel_table', key: 'act.cancel_table', args: { table: tid } });
              requireTillOperator(`Annuler la table ${tid}`, (who) => {
                cancelOpenTable(tid, who);
                const by = who && who.name ? ` · ${who.name}` : '';
                toast(`Table ${tid} annulée${by}`);
              });
              return;
            }
            const tid = selectedId;
            window.KiwiAuthAct?.({ kind: 'cancel_table', key: 'act.cancel_table', args: { table: tid } });
            requireTillOperator(`Annuler la table ${tid} et prévenir la cuisine`, async (who) => {
              try {
                await cancelSentTable(tid, who);
              } catch (err) {
                toast(`Table ${tid} conservée · ${err.message || 'annulation non transmise'}`);
              }
            }, tableCancelNeedsServer(tid) ? TILL_NEEDS_SERVER : undefined);
          }
        }
      });
    });

    $$('.qa-btn, .act-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.action;
        const f = btn.dataset.feature;
        if (f && isFeatureOff(f)) return;
        if (a === 'remboursement' && (isFeatureOff('remboursement') || isFeatureOff('refund'))) return;
        if (a === 'open-drawer' && (isFeatureOff('open-drawer') || isFeatureOff('openDrawer'))) return;
        if (a === 'cash-move' && (isFeatureOff('cash-move') || isFeatureOff('cashMove'))) return;
        if (a === 'passation' && isFeatureOff('passation')) return;
        if (a === 'cancel-sale') {
          window.KiwiPosReprint?.provide?.('restaurant', () => journal.filter(entry => entry
            && entry.kind !== 'refund' && entry.amount > 0).map(entry => ({
              saleId: String(entry.serverSaleId || window.KiwiLive?.saleIdFor?.(entry, currentMerchantSlug()) || entry.id || ''),
              ts: entry.time instanceof Date ? entry.time.getTime() : new Date(entry.time).getTime(),
              total: money(Number(entry.amount || 0) + Number(entry.tip || 0)),
              ref: entry.ref || '', label: entry.label || '', method: entry.method || '',
              lines: entry.lines || [], voided: !!entry.voided,
              reopenSnapshot: entry.reopenSnapshot || null,
            })));
          window.KiwiPosReprint?.open?.('restaurant', { mode: 'cancel' });
        }
        else if (a === 'remboursement')   openRefund();
        else if (a === 'open-drawer') openDrawerNoSale();
        else if (a === 'cash-move')  openCashMove();
        else if (a === 'passation')  openHandover();
        else if (a === 'fin-service') openCloture();
        else if (a === 'attendance-code') openAttendanceCode();
        else if (a === 'stock') openStock();
        else if (a === 'clients') {
          if (window.KiwiClientsBook && typeof window.KiwiClientsBook.open === 'function') {
            window.KiwiClientsBook.open(btn);
          }
        }
      });
    });

    /* ---------- CARD modal ---------- */
    const cardModal = $('#card-modal');
    const reader = {
      disc: $('#reader-disc'),
      status: $('#reader-status'),
      method: $('#reader-method'),
      foot: $('#card-foot'),
      confirm: $('#card-confirm'),
    };
    let cardSuccessTimer = null;
    let cardAttemptSeq = 0;
    let cardPaymentCommitted = false;
    let cashPaymentCommitted = false;
    let tenderInFlight = false;

    /* ---------- Pourboire (tip) on regular card / cash payments ----------
       Split parts keep their own tip (splitState) · this is only applied
       when splitPayCallback is null. currentTotal() stays the base; the tip
       is added on top wherever the customer-facing figure is shown/recorded. */
    let payTipMode = '0';     // '0' | '5' | '10' | '15' | 'autre'
    let payTipCustom = 0;     // custom % when mode === 'autre'

    function payTipPct() {
      if (splitPayCallback) return 0;       // split has its own tip
      if (payTipMode === 'autre') return Math.max(0, Math.min(100, Number.isFinite(payTipCustom) ? payTipCustom : 0));
      return parseFloat(payTipMode) || 0;
    }
    function payTipAmount() {
      /* money(), pas Math.round : un pourboire de 5 % sur 47,50 doit rendre
         2,38 · l'arrondi au dirham entier faussait le rendu au centime près. */
      /* En centimes entiers : 21,35 × 10 / 100 vaut 2,13499… en virgule
         flottante et rendait 2,13 au lieu de 2,14. */
      const cents = Math.round(money(currentTotal()) * 100);
      return Math.round(cents * payTipPct() / 100 + 1e-9) / 100;
    }
    /* Itemised lines for the receipt of the sale being tendered (non-split).
       Table → generateOrder; vente rapida → the cart. */
    /* La famille d'un plat, en clair ("Tajines", "Boissons"). Elle voyage avec
       la ligne jusqu'au rapport de fin de journée, qui regroupe les ventes par
       famille puis par plat. Résolue au moment de l'encaissement, par identifiant
       d'abord (fiable) puis par nom (les parts d'addition partagée ne portent que
       le libellé). Vide si on ne sait pas : le rapport la repêchera dans la carte,
       et il vaut mieux un plat non classé qu'un plat mal classé. */
    function lineCat(id, name) {
      const m = menuLineFind(x => (id && x.id === id) || (name && x.name === name));
      return (m && catLabels[m.cat]) || '';
    }
    /* L'identifiant du plat voyage avec la ligne. Sans lui, le moteur de
       recettes ne sait pas quoi chercher : il reçoit "Tajine poulet citron"
       et n'a qu'une table indexée par it_3. Toute vente était donc muette
       pour le stock · aucun gramme de poulet ne sortait jamais des livres. */
    function formulaPartSupplement(parent, part) {
      /* New remote orders carry this server-authoritative field. Local orders
         carry the same value from the published formula. The catalogue lookup
         keeps already-open legacy tickets itemised after a hot update. */
      if (part && Object.prototype.hasOwnProperty.call(part, 'formulaExtra')) {
        return Math.max(0, +part.formulaExtra || 0);
      }
      const item = (carteState.formulaItems || []).find(candidate => String(candidate.id) === String(parent && parent.id))
        || menuItems.find(candidate => String(candidate.id) === String(parent && parent.id));
      const slots = item && item.formula && Array.isArray(item.formula.slots) ? item.formula.slots : [];
      const slot = slots.find(candidate => String(candidate.id || '') === String((part && part.formulaSlotId) || ''));
      const choice = slot && Array.isArray(slot.choices)
        ? slot.choices.find(candidate => String(candidate.itemId || '') === String((part && part.id) || '')) : null;
      return Math.max(0, +(choice && choice.extra) || 0);
    }

    function receiptLinesFromOrder(lines) {
      const source = Array.isArray(lines) ? lines.filter(Boolean) : [];
      return source.filter(line => line.kind !== 'formula-part').map(line => {
        const qty = Math.max(1, +line.qty || 1);
        const total = line.total != null ? +line.total || 0 : (+line.price || +line.unitPrice || 0) * qty;
        const out = {
          itemId: line.id || line.itemId || '', name: lineLabel(line),
          baseName: line.baseName || line.name, qty,
          total, cat: lineCat(line.id || line.itemId, line.name),
          kind: line.kind || '', formulaUid: line.formulaUid || '',
          promo: line.promo || null,
        };
        if (line.kind === 'formula') {
          const parts = source.filter(part => part.kind === 'formula-part'
            && String(part.formulaUid || '') === String(line.formulaUid || ''));
          const saved = Array.isArray(line.formulaChoices) ? line.formulaChoices : [];
          out.formulaChoices = (parts.length ? parts.map(part => {
            const partQty = Math.max(1, +part.qty || qty);
            const unit = formulaPartSupplement(line, part);
            return { name: lineLabel(part), qty: partQty, total: unit * partQty };
          }) : saved.map(choice => ({
            name: String((choice && choice.name) || 'Choix'),
            qty: Math.max(1, +(choice && choice.qty) || qty),
            total: Math.max(0, +(choice && choice.total) || 0),
          })));
        }
        return out;
      });
    }

    function currentSaleLines() {
      if (mode === 'vrap') return receiptLinesFromOrder(cart);
      if (selectedId && tables[selectedId]) {
        const source = Object.prototype.hasOwnProperty.call(tableOrders, selectedId)
          ? tableOrders[selectedId] : generateOrder(selectedId, tables[selectedId]);
        return receiptLinesFromOrder(source);
      }
      return [];
    }
    function resetPayTip() {
      payTipMode = '0';
      payTipCustom = 0;
    }
    /* Render the tip selector for whichever modal is open (card and/or cash). */
    function renderPayTip() {
      const opts = [
        { label: 'Sans pourboire', val: '0'   },
        { label: '5 %',            val: '5'   },
        { label: '10 %',           val: '10'  },
        { label: '15 %',           val: '15'  },
        { label: 'Autre',          val: 'autre'},
      ];
      const isSplit = !!splitPayCallback;
      ['card', 'cash'].forEach(which => {
        const wrap = $('#' + which + '-tip');
        if (!wrap) return;
        // Hide the whole tip block while a split part is being paid.
        wrap.style.display = isSplit ? 'none' : '';
        if (isSplit) return;
        $('#' + which + '-tip-chips').innerHTML = opts.map(o =>
          `<button class="pay-tip-chip ${o.val === payTipMode ? 'is-active' : ''}" data-pay-tip="${o.val}">${o.label}</button>`
        ).join('');
        const customVisible = payTipMode === 'autre';
        $('#' + which + '-tip-custom').classList.toggle('is-visible', customVisible);
        if (customVisible) $('#' + which + '-tip-input').value = payTipCustom || '';
        const bd = $('#' + which + '-tip-breakdown');
        const tip = payTipAmount();
        if (tip > 0) {
          const base = currentTotal();
          bd.innerHTML =
            `Addition <span class="mono">${fmtMAD(base)}</span>`
            + `<span class="pay-tip-sep">·</span>`
            + `Pourboire <span class="mono">${fmtMAD(tip)}</span>`
            + `<span class="pay-tip-sep">·</span>`
            + `Total <span class="mono">${fmtMAD(base + tip)}</span>`;
          bd.classList.add('is-visible');
        } else {
          bd.innerHTML = '';
          bd.classList.remove('is-visible');
        }
      });
    }
    /* Tip changed · refresh the open modal's customer-facing figure. */
    function applyPayTipChange() {
      renderPayTip();
      const base = currentTotal();
      const tip  = payTipAmount();
      if ($('#card-modal').classList.contains('is-open')) {
        $('#card-amount').textContent = fmtMADcents(base + tip);
      }
      if ($('#cash-modal').classList.contains('is-open')) {
        $('#cash-amount').textContent = fmtMADcents(base + tip);
        const ci = $('#cash-received');
        if (ci) ci.value = base + tip;
        updateRendu();
      }
    }
    // Tip chip clicks (both modals routed through one delegated listener).
    document.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-pay-tip]');
      if (!chip) return;
      payTipMode = chip.dataset.payTip;
      if (payTipMode === 'autre') {
        const open = $('#card-modal').classList.contains('is-open') ? 'card' : 'cash';
        setTimeout(() => { const inp = $('#' + open + '-tip-input'); if (inp) inp.focus(); }, 60);
      }
      applyPayTipChange();
    });
    // Custom tip % input (both modals share one delegated listener).
    document.addEventListener('input', (e) => {
      if (e.target.id === 'card-tip-input' || e.target.id === 'cash-tip-input') {
        const raw = parseFloat(e.target.value);
        payTipCustom = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 0));
        if (String(e.target.value) !== '' && +e.target.value !== payTipCustom) e.target.value = payTipCustom;
        applyPayTipChange();
      }
    });

    /* Le QR passe par le modal carte mais doit s'enregistrer comme 'qr' au
       journal · sinon chaque paiement mobile compte comme une carte. */
    let cardTenderMethod = 'card';
    function openCardModal() {
      try { window.KiwiHardware && window.KiwiHardware.warmPrinter && window.KiwiHardware.warmPrinter(); } catch (_) {}
      const attempt = ++cardAttemptSeq;
      cardPaymentCommitted = false;
      cardTenderMethod = 'card';
      // Reset to pulsing state
      $('#card-modal-title').textContent = 'Payer par carte';
      reader.disc.classList.remove('is-success', 'flash');
      reader.disc.classList.add('is-pulsing');
      reader.disc.innerHTML = '<i data-lucide="credit-card"></i>';
      reader.status.classList.remove('is-success');
      reader.status.innerHTML = 'Approchez la carte ou le téléphone<span class="ellipsis"></span>';
      reader.method.style.display = '';
      reader.method.textContent = 'Kiwi Tap · NFC · QR';
      reader.foot.classList.remove('is-visible');
      /* Sans lecteur branché, « Carte » veut dire : le client paie sur le TPE du
         commerçant. Aucun lecteur n'est en attente d'une carte, et rien ne dit
         que le client a payé · c'est au caissier de le confirmer. Avant, la vente
         s'écrivait toute seule deux secondes après le toucher de « Carte ». */
      const hw0 = window.KiwiHardware;
      const externalTerminal = !!(hw0 && hw0.externalCardTerminal && hw0.externalCardTerminal());
      if (reader.confirm) reader.confirm.hidden = !externalTerminal;
      if (externalTerminal) {
        reader.disc.classList.remove('is-pulsing');
        reader.status.textContent = 'Faites payer sur votre terminal, puis confirmez';
        reader.method.textContent = 'Terminal de paiement externe';
        reader.foot.classList.add('is-visible');
      }
      // Reset the tip so the figure opens on the base addition.
      resetPayTip();
      $('#card-amount').textContent = fmtMADcents(currentTotal());
      cardModal.classList.add('is-open');
      renderPayTip();
      lucide.createIcons();

      if (externalTerminal) return;
      cardSuccessTimer = setTimeout(() => {
        const hw = window.KiwiHardware;
        if (!hw || !hw.authorizeCard) {
          reader.disc.classList.remove('is-pulsing', 'is-success');
          reader.status.textContent = 'Paiement non confirmé · lecteur indisponible';
          reader.foot.classList.add('is-visible');
          return;
        }
        Promise.resolve(hw.authorizeCard(currentTotal() + payTipAmount(), reader.disc, reader.status))
          .then((result) => {
            if (attempt !== cardAttemptSeq || !cardModal.classList.contains('is-open')) return;
            if (result && result.approved) triggerCardSuccess(result);
            else { reader.method.style.display = 'none'; reader.foot.classList.add('is-visible'); lucide.createIcons(); }
          });
      }, 2000);
    }
    async function triggerCardSuccess(result) {
      if (cardPaymentCommitted) return;
      cardPaymentCommitted = true;
      tenderInFlight = true;
      let settled;
      try { settled = await finalizeTender(cardTenderMethod); }
      catch (_) { tenderInFlight = false; toast('Encaissement à vérifier dans le journal avant de réessayer'); return; }
      tenderInFlight = false;
      if (settled === 'split') { closeCardModal(); return; }
      const sale = lastSaleEntry();
      closeCardModal();
      printSaleTicket(sale);
    }
    /* A settled row identifies the order, not the physical table. Keep the
       first kitchen ticket attached to this bill; later sends are additions. */
    /* ── Ce qu'une ligne de journal doit dire ──────────────────────────────
     * Une vente à emporter s'écrivait « À emporter #79 » ; une vente de salle
     * s'écrivait « 51 ». Un nombre nu ne désigne rien : trois mois plus tard,
     * face à une réclamation ou à un écart de caisse, on ne peut ni retrouver
     * la table ni même savoir qu'il s'agissait d'une table. La moitié du
     * journal était donc intraçable.
     *
     * On compose la même forme que pour l'emporter : « Table 5 #56 ».
     *
     * Le numéro BRUT reste stocké dans `t.orderNo`, et ce n'est pas un détail :
     * il est comparé à `order.num` (migration d'un ancien numéro local) et il
     * est TRANSFÉRÉ tel quel d'une table à l'autre lors d'un changement de
     * table. Y coller le nom de la table ferait voyager l'ancienne table avec
     * le ticket. L'étiquette est donc une vue, jamais la donnée. */
    function tableSaleLabel(tableId, ref) {
      const id = String(tableId || '').trim();
      const num = String(ref == null ? '' : ref).trim();
      if (!id) return num || 'Commande';
      if (!num || num === id) return `Table ${id}`;
      return `Table ${id} #${num}`;
    }

    function settledOrderLabel(tableId) {
      return tableSaleLabel(tableId, settledOrderRef(tableId));
    }

    function settledOrderRef(tableId) {
      const t = tableId && tables[tableId];
      if (t && t.orderNo != null && String(t.orderNo).trim()) return String(t.orderNo);
      /* Migration for a table already open when this fix is deployed: only a
         ticket from the current occupancy window may be adopted. Old served
         tickets for the same physical table stay in KDS history. */
      const openedAfter = Date.now() - ((Math.max(0, +(t && t.elapsed) || 0) + 2) * 60000);
      const order = kdsOrders.slice().reverse().find(o => {
        if (!o || o.type !== 'dineIn' || String(o.table) !== String(tableId)) return false;
        const sent = o.sentAt instanceof Date ? o.sentAt.getTime() : new Date(o.sentAt).getTime();
        return Number.isFinite(sent) && sent >= openedAfter;
      });
      if (order) {
        const label = ticketNo(order);
        if (t) t.orderNo = label;
        return label;
      }
      return tableId || 'Commande';
    }

    function closeCardModal() {
      if (tenderInFlight) return;
      cardModal.classList.remove('is-open');
      cardAttemptSeq++;
      clearTimeout(cardSuccessTimer);
      cashAmountOverride = null;
      /* Le modal de paiement s'ouvre PAR-DESSUS le modal de partage : l'abandonner
         laissait `splitPayCallback` armé. Or `finalizeTender()` ne comptabilise une
         vente que si ce callback est vide · l'encaissement suivant, sans rapport,
         était donc absorbé par la part abandonnée : montant de l'ancienne part
         enregistré, vente réelle jamais écrite. On désarme à la fermeture ; sur le
         chemin nominal `finalizeTender()` l'a déjà mis à null avant d'arriver ici. */
      splitPayCallback = null;
      restorePayBindings();
    }
    /* Le caissier confirme que le client a payé sur son terminal : c'est cet
       acte, et lui seul, qui écrit la vente carte. */
    if (reader.confirm) reader.confirm.addEventListener('click', () => {
      if (cardPaymentCommitted || tenderInFlight || !cardModal.classList.contains('is-open')) return;
      const hw = window.KiwiHardware;
      if (!hw || !hw.authorizeCard) return;
      const attempt = cardAttemptSeq;
      reader.confirm.disabled = true;
      Promise.resolve(hw.authorizeCard(currentTotal() + payTipAmount(), reader.disc, reader.status, { cashierConfirmed: true }))
        .then((result) => {
          reader.confirm.disabled = false;
          if (attempt !== cardAttemptSeq || !cardModal.classList.contains('is-open')) return;
          if (result && result.approved) triggerCardSuccess(result);
        }, () => { reader.confirm.disabled = false; });
    });
    $('#pay-card').addEventListener('click', openCardModal);
    const payQrButton = $('#pay-qr');
    if (payQrButton) payQrButton.addEventListener('click', function () {
      /* No QR provider/intent exists in the hardware bridge yet. Reusing the card
         authorizer painted a QR icon but charged the card path · a false success. */
      toast('Paiement QR indisponible · configurez un fournisseur QR');
    });
    cardModal.addEventListener('click', (e) => {
      /* Toucher le fond ne valide jamais l'encaissement : seule l'approbation
       * du lecteur déclenche finalizeTender(), puis le reçu et la fermeture. */
      if (e.target === cardModal) closeCardModal();
      const action = e.target.closest('[data-modal-action]')?.dataset.modalAction;
      if (action === 'close') closeCardModal();
    });

    /* ---------- CASH modal ---------- */
    const cashModal = $('#cash-modal');
    const cashInput = $('#cash-received');
    const cashRendu = $('#cash-rendu');
    const cashRenduVal = $('#cash-rendu-val');
    const cashConfirm = $('#cash-confirm');
    const cashStepInput = $('#cash-step-input');

    // When a split part is being paid, this overrides currentTotal()
    let cashAmountOverride = null;

    function currentTotal() {
      if (cashAmountOverride !== null) return cashAmountOverride;
      if (mode === 'vrap') {
        const gross = cart.reduce((s, l) => s + l.price * l.qty, 0);
        return Math.max(0, gross - vrapDiscountAmount(gross));
      }
      if (!selectedId) return 0;
      const lines = generateOrder(selectedId, tables[selectedId]);
      const gross = lines.reduce((s, l) => s + l.total, 0);
      // Net of any manager-approved remise on this table.
      return Math.max(0, gross - discountAmountFor(selectedId, gross));
    }
    /* Commit at the payment truth boundary, not when a decorative success modal
       is later dismissed. A reload/Escape after cash was accepted or the reader
       approved must never leave the order due and invite a second charge. */
    async function finalizeTender(method) {
      /* Paiement = confirmation ferme. Avant d'écrire la vente ou de libérer
         la table, rattraper tout ce qui n'est pas encore parti en cuisine.
         Chaque chemin garde sa propre preuve durable (ligne.sent, statut held,
         ou identifiant OrderPro), donc les encaissements/retours suivants ne
         peuvent jamais produire un second bon. */
      const tenderOrder = dispatchUnsentKitchenBeforePayment();
      /* A new counter order gets its permanent restaurant number from the
         shared order queue. Never freeze a customer receipt or send a sale to
         Dashboard while that allocation is still in flight: the temporary
         till counter was the source of the #74 / #14 disagreement. */
      await awaitCanonicalTicketNumber(tenderOrder);
      const tenderBase = currentTotal();
      const tenderTip = payTipAmount();
      const saleLabel = mode === 'vrap'
        ? (tenderOrder ? 'À emporter #' + ticketNo(tenderOrder)
          : (vrapEditingNum != null ? 'À emporter #' + vrapEditingNum : 'À emporter'))
        : settledOrderLabel(selectedId);
      const lines = currentSaleLines();
      let recorded = null;
      if (!splitPayCallback) {
        const sale = recordSale(tenderBase, method, saleLabel, tenderTip, lines,
          mode !== 'vrap' ? selectedId : '', tenderOrder);
        if (!sale) throw new Error('sale-not-recorded');
        recorded = sale;
      }
      if (splitPayCallback) {
        const cb = splitPayCallback;
        splitPayCallback = null;
        /* The share's receipt, or nothing if it was not recorded. Only a
           receipt the queue has taken earns the success haptic. */
        if (saleRecordConfirmed(cb())) nativeHapticSuccess();
        return 'split';
      }
      if (mode === 'vrap') settleVrapPayment();
      else if (selectedId) { markPaid(selectedId); closeRightPanel(); }
      if (saleRecordConfirmed(recorded)) nativeHapticSuccess();
      /* The paid moment in the native app (native-runtime.js). The haptic
         above already played, so the app only draws. */
      try { window.dispatchEvent(new CustomEvent('kiwi:sale-paid', { detail: { total: tenderBase + tenderTip, method: method, haptic: false } })); } catch (_) {}
      return 'complete';
    }
    function updateRendu() {
      // The customer pays base + pourboire; rendu is computed off that.
      /* In cents: a percentage remise leaves 44.700000000000003 as the due,
         and a cashier typing 44.7 was told « manque 0 MAD » and blocked. */
      const total = Math.round((currentTotal() + payTipAmount()) * 100) / 100;
      const got = Math.round((parseFloat(String(cashInput.value).replace(',', '.')) || 0) * 100) / 100;
      const diff = Math.round((got - total) * 100) / 100;
      cashRendu.classList.remove('is-positive', 'is-short');
      if (diff >= 0) {
        cashRendu.classList.toggle('is-positive', diff > 0);
        cashRenduVal.textContent = fmtMADcents(diff);
        cashConfirm.disabled = false;
      } else {
        cashRendu.classList.add('is-short');
        cashRenduVal.textContent = 'Insuffisant · manque ' + fmtMAD(total - got);
        cashConfirm.disabled = true;
      }
      // Un billet trop petit pour couvrir le dû ne sert à rien : on le grise.
      $$('.cash-preset').forEach(b => {
        if (!b.dataset.set || b.dataset.set === 'exact') return;
        b.disabled = parseFloat(b.dataset.set) < total;
      });
    }
    function openCashModal() {
      try { window.KiwiHardware && window.KiwiHardware.warmPrinter && window.KiwiHardware.warmPrinter(); } catch (_) {}
      cashPaymentCommitted = false;
      cashStepInput.hidden = false;
      cashStepInput.style.display = '';
      // Reset the tip so the figure opens on the base addition.
      resetPayTip();
      const total = currentTotal();
      cashInput.value = total;
      $('#cash-amount').textContent = fmtMADcents(total);
      cashModal.classList.add('is-open');
      renderPayTip();
      updateRendu();
    }
    function closeCashModal() {
      if (tenderInFlight) return;
      cashAmountOverride = null;
      cashPaymentCommitted = false;
      cashConfirm.disabled = false;
      // Même désarmement qu'en carte · voir closeCardModal().
      splitPayCallback = null;
      restorePayBindings();
      cashModal.classList.remove('is-open');
    }
    const payCashButton = $('#pay-cash');
    if (payCashButton) payCashButton.addEventListener('click', openCashModal);
    cashInput.addEventListener('input', updateRendu);
    /* « Encaisser » · le geste principal (Slice A). En vente rapide il ouvre
       le flux espèces ; en prise de commande il envoie d'abord les lignes en
       cuisine, puis ouvre le même flux. */
    $('#pay-charge').addEventListener('click', () => {
      if (!(currentTotal() > 0)) { toast('Addition vide'); return; }
      openCashModal();
    });
    $('#pay-charge-order').addEventListener('click', () => {
      if (!selectedId) return;
      if (tableHasOpenSplit(selectedId)) { toast('Un split est en cours sur cette table : reprenez-le depuis l\'addition'); return; }
      if (orderInProgressCount() > 0) validateOrder(selectedId);
      if (currentTotal() > 0) openCashModal();
      else toast('Addition vide');
    });
    /* Le total vit dans #rp-total ; on le recopie sur les deux boutons
       Encaisser (observer, pas de deuxième source de vérité). */
    (function () {
      const src = document.getElementById('rp-total');
      const t1 = document.getElementById('pay-charge-total');
      const t2 = document.getElementById('pay-charge-order-total');
      if (!src) return;
      const sync = () => { const v = src.textContent.trim(); if (t1) t1.textContent = v; if (t2) t2.textContent = v; };
      new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
      sync();
    })();
    /* Un tap RÈGLE le montant reçu (façon Loyverse) : « Exact » = le dû,
       un billet = sa valeur. Les presets des autres modales (data-cm-add,
       data-ho-add, data-ho-vadd) gardent leurs propres handlers. */
    $$('.cash-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!btn.dataset.set || btn.disabled) return;
        const due = currentTotal() + payTipAmount();
        cashInput.value = btn.dataset.set === 'exact' ? money(due) : parseFloat(btn.dataset.set);
        updateRendu();
      });
    });
    cashConfirm.addEventListener('click', async () => {
      // Customer owes base + pourboire; rendu is the change off that.
      const total = Math.round((currentTotal() + payTipAmount()) * 100) / 100;
      const got = Math.round((parseFloat(String(cashInput.value).replace(',', '.')) || 0) * 100) / 100;
      if (cashPaymentCommitted || got < total) return;
      const change = Math.round((got - total) * 100) / 100;
      cashPaymentCommitted = true;
      cashConfirm.disabled = true;
      tenderInFlight = true;
      let settled;
      try { settled = await finalizeTender('cash'); }
      catch (_) { tenderInFlight = false; toast('Encaissement à vérifier dans le journal avant de réessayer'); return; }
      tenderInFlight = false;
      if (settled === 'split') {
        if (change > 0) toast('Monnaie à rendre : ' + fmtMAD(change));
        closeCashModal();
        return;
      }
      const sale = lastSaleEntry();
      closeCashModal();
      openCashDrawer();
      if (change > 0) toast('Monnaie à rendre : ' + fmtMAD(change));
      printSaleTicket(sale);
    });
    cashModal.addEventListener('click', (e) => {
      if (e.target === cashModal) closeCashModal();
      const action = e.target.closest('[data-modal-action]')?.dataset.modalAction;
      if (action === 'close') closeCashModal();
    });
    function dismissModalVeil(veil) {
      if (!veil) return;
      const id = veil.id;
      if (id === 'card-modal') { closeCardModal(); return; }
      if (id === 'cash-modal') { closeCashModal(); return; }
      if (id === 'order-review-modal') { closeOrderReviewModal(); return; }
      if (id === 'client-modal') { closeClientModal(); return; }
      if (id === 'split-modal') { closeSplitModal(); return; }
      if (id === 'receipt-modal') { closeReceipt(); return; }
      if (id === 'cash-move-modal') { closeCashMove(); return; }
      if (id === 'manager-modal') { closeManagerModal(); return; }
      if (id === 'attendance-code-modal') { closeAttendanceCode(); return; }
      if (id === 'msg-modal') { closeMsgModal(); return; }
      if (id === 'reassign-modal') { closeReassignModal(); return; }
      if (id === 'remise-modal') { closeRemiseModal(); return; }
      if (id === 'refund-modal') { closeRefund(); return; }
      if (id === 'handover-modal') { closeHandover(); return; }
      if (id === 'sk-modal') { closeSkModal(); return; }
      if (id === 'team-drawer') { closeTeamDrawer(); return; }
      if (id === 'journal-drawer') { closeJournal(); return; }
      const closeBtn = veil.querySelector('[data-modal-action="close"], #cl-cancel, #nt-cancel, #wl-cancel, #ctrf-cancel, #cmrg-cancel, #split-done-close, #attendance-code-close, #receipt-close, .modal-close, .drawer-close');
      if (closeBtn) {
        closeBtn.click();
      } else {
        veil.classList.remove('is-open');
      }
    }

    /* Dismiss modal on backdrop tap (click outside the modal window) */
    document.addEventListener('click', (e) => {
      if (!e.target || !e.target.classList) return;
      if (e.target.classList.contains('modal-veil') && e.target.classList.contains('is-open')) {
        dismissModalVeil(e.target);
      } else if (e.target.classList.contains('cloture-veil') && e.target.classList.contains('is-open')) {
        e.target.classList.remove('is-open');
      } else if (e.target.classList.contains('drawer-veil') && e.target.classList.contains('is-open')) {
        dismissModalVeil(e.target);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal-veil.is-open, .drawer-veil.is-open, .cloture-veil.is-open');
        if (openModal) dismissModalVeil(openModal);
      }
      if (e.key === 'Enter' && cashModal.classList.contains('is-open') && !cashStepInput.hidden) {
        if (!cashConfirm.disabled) { e.preventDefault(); cashConfirm.click(); }
        return;
      }
      if (!['F2', 'F3', 'F4'].includes(e.key) || e.repeat) return;
      const target = e.target;
      if (target && (target.matches?.('input,textarea,select') || target.isContentEditable)) return;
      if (!document.body.classList.contains('is-unlocked')) return;
      if (document.querySelector('.modal-veil.is-open, .drawer.is-open')) return;
      if (!(currentTotal() > 0)) return;
      e.preventDefault();
      if (e.key === 'F2') openCashModal();
      else if (e.key === 'F3') openCardModal();
      else if (mode === 'vrap' || selectedId) openSplitModal(selectedId);
    });

    /* ---------- Live elapsed minutes ---------- */
    function resetTableTimer(t) {
      if (!t) return;
      t.elapsed = 0;
      delete t.orderStartedAt;
      delete t.timerSession;
    }
    function startTableTimer(id, createdAt = 0) {
      const t = tables[id];
      if (!t) return 0;
      const now = Date.now();
      if (!(Number(t.orderStartedAt) > 0)) {
        const created = Number(createdAt);
        // Old shift snapshots have only elapsed minutes. Preserve that age;
        // canonical orders supply their timestamp when a till reconnects.
        t.orderStartedAt = created > 0 ? Math.min(now, created)
          : now - Math.max(0, Number(t.elapsed) || 0) * 60000;
      } else if (Number(createdAt) > 0) {
        // A reconnect can deliver the newest ticket first. Earlier tickets
        // move the anchor back; additional orders never restart the clock.
        t.orderStartedAt = Math.min(t.orderStartedAt, Number(createdAt), now);
      }
      t.elapsed = Math.max(0, Math.floor((now - t.orderStartedAt) / 60000));
      return t.orderStartedAt;
    }
    function updateTableTimers() {
      Object.keys(tables).forEach(id => {
        const t = tables[id];
        const hasOrder = (tableOrders[id] && tableOrders[id].length > 0) || (orders[id] && orders[id].length > 0);
        if (hasOrder && (t.status === 'ka-yaklo' || t.status === 'bgha-ykhlass' || t.status === 'a-commander')) {
          startTableTimer(id);
          // Update DOM in place (cheaper than full re-render)
          const node = document.querySelector(`[data-table="${id}"] .tbl-elapsed`);
          if (node) node.textContent = `${t.elapsed} mn`;
          // Update right panel substatus if this is the selected one
          if (id === selectedId) {
            const sub = $('#rp-substatus');
            if (!sub) return;
            const flag = sub.dataset.flag;
            const map = {
              'bgha-ykhlass': 'Addition',
              'a-commander':  'À commander',
              'ka-yaklo':     'En cours',
            };
            sub.textContent = `${map[flag]} · ${t.elapsed} mn`;
          }
        } else if (!hasOrder || t.status === 'khawya' || t.status === 'khlass') resetTableTimer(t);
      });
    }
    setInterval(updateTableTimers, 60_000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) updateTableTimers(); });

    /* ---------- Khlass-fade for T7 (preset) ---------- */
    setTimeout(() => {
      if (tables.T7 && tables.T7.status === 'khlass') {
        tables.T7.status = 'khawya';
        refreshTableNode('T7');
      }
    }, 5000);

    document.getElementById('new-table-modal').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-nt-covers]');
      if (chip) { newTableCovers = parseInt(chip.dataset.ntCovers); renderNewTableChips(); return; }
      if (e.target.closest('#nt-confirm')) { confirmNewTable(); return; }
      if (e.target.closest('#nt-cancel') || e.target === $('#new-table-modal'))
        { $('#new-table-modal').classList.remove('is-open'); return; }
    });

    /* ============================================================
       WAITLIST (liste d'attente) · walk-in parties at the door
       ============================================================ */
    const WL_PREFS = {
      'terrasse':    { label: 'Terrasse',    icon: 'sun'              },
      'interieur':   { label: 'Intérieur',   icon: 'utensils-crossed' },
      'etage':       { label: 'Étage',       icon: 'layers'           },
      'peu-importe': { label: 'Peu importe', icon: 'check'            },
    };

    $('#wl-add-btn') && $('#wl-add-btn').addEventListener('click', openWaitlistModal);
    document.getElementById('waitlist-modal').addEventListener('click', (e) => {
      const sizeChip = e.target.closest('[data-wl-size]');
      if (sizeChip) { wlDraft.size = parseInt(sizeChip.dataset.wlSize); renderWaitlistChips(); return; }
      const prefChip = e.target.closest('[data-wl-pref]');
      if (prefChip) { wlDraft.pref = prefChip.dataset.wlPref; renderWaitlistChips(); return; }
      if (e.target.closest('#wl-confirm')) { confirmWaitlistAdd(); return; }
      if (e.target.closest('#wl-cancel') || e.target === $('#waitlist-modal'))
        { $('#waitlist-modal').classList.remove('is-open'); return; }
    });
    $('#wl-name') && $('#wl-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmWaitlistAdd(); });
    $('#waitlist-list') && $('#waitlist-list').addEventListener('click', (e) => {
      const seat = e.target.closest('[data-wl-seat]');
      if (seat) { startSeating(parseInt(seat.dataset.wlSeat)); return; }
      const rem = e.target.closest('[data-wl-remove]');
      if (rem) { removeWaitlist(parseInt(rem.dataset.wlRemove)); return; }
    });
    $('#wl-seat-banner-cancel') && $('#wl-seat-banner-cancel').addEventListener('click', () => endSeating(true));
    // keep wait times fresh while the waitlist is on screen
    setInterval(() => { if (mode === 'waitlist') renderWaitlist(); }, 30000);

    /* ---------- Caisse Table Transfer & Merge Handlers ---------- */
    let ctrfFromId = null;
    let ctrfSelectedToId = null;

    let cmrgSourceId = null;
    let cmrgSelectedTargetId = null;

    $('#rp-transfer-table') && $('#rp-transfer-table').addEventListener('click', () => {
      if (!hasTables() || isFeatureOff('tableTransfer') || isFeatureOff('table-transfer')) return;
      if (selectedId) openCaisseTransferModal(selectedId);
    });
    $('#rp-merge-table') && $('#rp-merge-table').addEventListener('click', () => {
      if (!hasTables() || isFeatureOff('tableMerge') || isFeatureOff('table-merge')) return;
      if (selectedId) openCaisseMergeModal(selectedId);
    });

    document.getElementById('caisse-transfer-modal').addEventListener('click', (e) => {
      const card = e.target.closest('[data-ctrf-to]');
      if (card) {
        ctrfSelectedToId = card.dataset.ctrfTo;
        renderCaisseTransferGrid();
        const btnText = $('#ctrf-btn-text');
        if (btnText) btnText.textContent = `Déplacer vers ${ctrfSelectedToId}`;
        const confirmBtn = $('#ctrf-confirm');
        if (confirmBtn) confirmBtn.disabled = false;
        return;
      }
      if (e.target.closest('#ctrf-confirm')) { confirmCaisseTransfer(); return; }
      if (e.target.closest('#ctrf-cancel') || e.target === $('#caisse-transfer-modal')) {
        $('#caisse-transfer-modal').classList.remove('is-open');
        return;
      }
    });

    document.getElementById('caisse-merge-modal').addEventListener('click', (e) => {
      const card = e.target.closest('[data-cmrg-target]');
      if (card) {
        cmrgSelectedTargetId = card.dataset.cmrgTarget;
        renderCaisseMergeGrid();
        const btnText = $('#cmrg-btn-text');
        if (btnText) btnText.textContent = `Fusionner avec ${cmrgSelectedTargetId}`;
        const confirmBtn = $('#cmrg-confirm');
        if (confirmBtn) confirmBtn.disabled = false;
        return;
      }
      if (e.target.closest('#cmrg-confirm')) { confirmCaisseMerge(); return; }
      if (e.target.closest('#cmrg-cancel') || e.target === $('#caisse-merge-modal')) {
        $('#caisse-merge-modal').classList.remove('is-open');
        return;
      }
    });

    /* La reprise de file a fini par obtenir le numéro canonique. C'est le
       même bon — `opId` est son identité — et c'est le seul moment où l'on
       peut encore faire converger le papier, la cuisine et la caisse. */
    window.addEventListener('kiwi:kitchen-relay-number', (e) => {
      const detail = (e && e.detail) || {};
      const order = detail.id ? opTickets.get(String(detail.id)) : null;
      if (!order || detail.number == null || order.opNum != null) return;
      const was = ticketNo(order);
      order.opNum = detail.number;
      order.provisionalNumber = false;
      if (order.table && detail.session && tables[order.table]) {
        order.session = String(detail.session);
        tables[order.table].timerSession = order.session;
      }
      reconcileReceiptOrderNumber(order);
      if (order.table && tables[order.table] && String(tables[order.table].orderNo) === was) {
        tables[order.table].orderNo = ticketNo(order);
      }
      updateKdsCount();
      if (kdsEl.classList.contains('is-open')) kdsPaint();
      try { persistShift(); } catch (_) {}
      /* Le papier, lui, est déjà sorti avec « L64 ». On le dit, une fois : le
         comptoir doit pouvoir rapprocher le ticket posé sur la planche. */
      try { toast(`Bon ${was} · numéro définitif ${ticketNo(order)}`, 'ok'); } catch (_) {}
    });

    document.getElementById('validate-order').addEventListener('click', () => {
      if (mode !== 'order') return;
      if (selectedId) { validateOrder(selectedId); return; }
      /* Mode commande sans mesa : il n'y a rien à envoyer. Se taire laissait le
         serveur devant un bouton qui ne répond pas · on le ramène à la salle et
         on le lui dit. Le panier ramassé par erreur pendant ce temps repart avec
         (il n'appartient à aucune note), sinon il ressortirait tout seul au
         prochain passage en « À emporter ». */
      cart = [];
      backToSalle();
      toast('Aucune table en cours');
    });
    document.getElementById('cancel-new-order').addEventListener('click', cancelNewOrder);
    $('#rp-add-items').addEventListener('click', () => {
      if (mode !== 'salle' || !selectedId) return;
      resumeTableOrder(selectedId);
    });

    /* ===========================================================
       Split Bill
       =========================================================== */

    let splitPayCallback = null;

    /* Le sous-titre des modals de paiement est global : « Part 2 » écrit ici
       restait affiché sur l'encaissement suivant, sans le moindre rapport avec
       la note partagée · « Table Part 2 · T7 » sur une commande à emporter.
       On mémorise donc l'étiquette d'origine pour la remettre dès que le flux
       de partage se termine, qu'il aboutisse ou qu'il soit abandonné. */
    /* Le sous-titre des fenêtres de paiement. Il était écrit en dur
       « Table … · N couverts » et seul le chiffre changeait : une vente à
       emporter s'affichait « Table À emporter · 1 art. couverts », une part de
       note « Table Part 2 · T7 couverts ». Le préfixe et l'unité suivent
       maintenant ce qu'on encaisse. */
    function payMeta(m) {
      $$('.pay-table-prefix').forEach(el => { el.hidden = !m.prefix; });
      $$('[data-bind="table"]').forEach(el => el.textContent = m.table);
      $$('[data-bind="covers"]').forEach(el => el.textContent = m.covers);
      $$('[data-bind="covers-unit"]').forEach(el => { el.textContent = m.unit; el.hidden = !m.unit; });
    }
    function readPayMeta() {
      const q = (sel) => document.querySelector(sel);
      return {
        prefix: !(q('.pay-table-prefix') || {}).hidden,
        table: q('[data-bind="table"]')?.textContent || '',
        covers: q('[data-bind="covers"]')?.textContent || '',
        unit: q('[data-bind="covers-unit"]')?.hidden ? '' : (q('[data-bind="covers-unit"]')?.textContent || ''),
      };
    }
    let payBindingsBackup = null;
    function setPayBindings(table, covers) {
      if (!payBindingsBackup) payBindingsBackup = readPayMeta();
      payMeta({ prefix: false, table, covers, unit: '' });
    }
    function restorePayBindings() {
      if (!payBindingsBackup) return;
      const b = payBindingsBackup;
      payBindingsBackup = null;
      payMeta(b);
    }

    /* Le partage regroupe les articles par nom pour montrer « 4 × Tajine ».
       Deux plats du même nom à des prix différents (une formule avec ou sans
       supplément) se fondaient en une seule carte, au prix du premier : à 84
       et 88 MAD, chacun des deux convives payait 86 et les deux lignes disaient
       84 (Pasta Corner, 1er octobre). Un autre prix garde sa propre carte, et
       son nom de base pour que le classement des produits les compte ensemble. */
    function splitItemTotals(lines) {
      const itemTotals = {};
      (lines || []).forEach(l => {
        const unitPrice = l.qty > 0 ? (l.total / l.qty) : l.total;
        let key = l.name;
        if (itemTotals[key] && minor(itemTotals[key].unitPrice) !== minor(unitPrice)) key = `${l.name} · ${fmtMADcents(unitPrice)}`;
        if (!itemTotals[key]) {
          itemTotals[key] = { totalQty: 0, unitPrice, itemId: l.itemId || l.id || '', baseName: l.baseName || (key !== l.name ? l.name : '') };
        }
        itemTotals[key].totalQty += l.qty;
      });
      return itemTotals;
    }

    const splitState = {
      tableId: null,
      isVrap: false,       // true when splitting an À emporter cart (no table)
      sourceLabel: null,   // modal label · 'T3' for a mesa, 'À emporter' for vrap
      total: 0,
      sourceLines: [],     // immutable bill snapshot used by audited zero settlement
      itemTotals: {},      // { itemName: { totalQty, unitPrice } }
      splitMode: 'egal',   // 'egal' | 'article'
      numParts: 2,
      tipMode: '0',        // '0','5','10','15','autre'
      customTipPct: 0,
      numConvives: 2,
      perConvive: {},      // { conviveNum: { itemName: qty } }
      activeConvive: 1,
      flow: null,          // { parts:[{amount,label,paid,payMethod}], paidCount }
    };

    function effectiveTipPct() {
      /* A tip is never negative: a typed -50 % would shave the bill itself. */
      if (splitState.tipMode === 'autre') return Math.min(100, Math.max(0, Number(splitState.customTipPct) || 0));
      return Math.max(0, parseFloat(splitState.tipMode) || 0);
    }

    /* ---- open ---- */
    function openSplitModal(tableId) {
      // À emporter has no mesa · split the working cart instead of a table order.
      const isVrap = (mode === 'vrap');
      let lines, covers, sourceLabel;
      if (isVrap) {
        lines = cart.map(c => ({ name: lineLabel(c), baseName: c.baseName || c.name,
          itemId: c.id || '', qty: c.qty, total: c.price * c.qty, promo: c.promo || null }));
        covers = 2;
        sourceLabel = vrapEditingNum != null ? ('À emporter #' + vrapEditingNum) : 'À emporter';
      } else {
        const t = tables[tableId];
        lines = generateOrder(tableId, t);
        covers = t.covers || 2;
        sourceLabel = settledOrderLabel(tableId);
      }
      const gross = money(lines.reduce((s, l) => s + l.total, 0));
      /* A split settles the same NET amount shown by the ordinary payment
         buttons. The old path rebuilt the gross from the lines and silently
         dropped the manager-approved discount. */
      const total = isVrap
        ? money(gross - vrapDiscountAmount(gross))
        : money(gross - discountAmountFor(tableId, gross));

      // Aggregate per unique item name: split-pool shows one card per dish
      // with remaining count, so 4× Tajine can be assigned to 4 different convives
      const itemTotals = splitItemTotals(lines);

      Object.assign(splitState, {
        tableId: isVrap ? null : tableId,
        isVrap, sourceLabel,
        total, sourceLines: lines.map(line => ({ ...line })), itemTotals,
        splitMode: 'egal',
        numParts: Math.max(2, covers),
        tipMode: '0', customTipPct: 0,
        numConvives: Math.max(2, covers),
        perConvive: {}, activeConvive: 1, flow: null,
      });

      $('#split-table-label').textContent = sourceLabel;
      $('#split-setup').hidden = false;
      $('#split-flow').hidden = true;
      $('#split-all-done').hidden = true;

      renderSplitSetup();
      $('#split-modal').classList.add('is-open');
      lucide.createIcons();
    }

    /* ---- Par article helpers ---- */
    function remainingQty(itemName) {
      const total = splitState.itemTotals[itemName]?.totalQty || 0;
      let assigned = 0;
      for (const c in splitState.perConvive) {
        assigned += splitState.perConvive[c][itemName] || 0;
      }
      return total - assigned;
    }
    function conviveTotal(c) {
      const map = splitState.perConvive[c] || {};
      let sum = 0;
      for (const name in map) {
        sum += map[name] * (splitState.itemTotals[name]?.unitPrice || 0);
      }
      return sum;
    }
    function assignUnit(itemName) {
      if (!Number.isInteger(remainingQty(itemName)) || remainingQty(itemName) <= 0) return;
      const c = splitState.activeConvive;
      if (!splitState.perConvive[c]) splitState.perConvive[c] = {};
      splitState.perConvive[c][itemName] = (splitState.perConvive[c][itemName] || 0) + 1;
    }
    function unassignUnit(itemName) {
      const c = splitState.activeConvive;
      const map = splitState.perConvive[c];
      if (!map || !map[itemName]) return;
      map[itemName]--;
      if (map[itemName] <= 0) delete map[itemName];
    }

    function closeSplitModal({ skipRevert = false } = {}) {
      $('#split-modal').classList.remove('is-open');
      splitPayCallback = null;
      cashAmountOverride = null;
      restorePayBindings();
    }

    /* ---- setup screen ---- */
    function renderSplitSetup() {
      $$('[data-split-tab]').forEach(tab =>
        tab.classList.toggle('is-active', tab.dataset.splitTab === splitState.splitMode));

      $('#split-egal-content').hidden = splitState.splitMode !== 'egal';
      $('#split-article-content').hidden = splitState.splitMode !== 'article';

      if (splitState.splitMode === 'egal') {
        $('#split-launch').disabled = false;
        $('#split-launch').textContent = 'Lancer le split';
        $('#split-launch').title = '';
        renderPartsChips();
        renderTipChips();
        updateSplitSummary();
      } else {
        renderArticleMode();
      }
      lucide.createIcons();
    }

    /* ---- Par article renderers ---- */
    function renderArticleMode() {
      renderConvivesChips();
      renderConvivesTabs();
      renderPool();
      renderConviveCart();
      const allocation = splitArticleAllocation();
      $('#split-launch').disabled = !allocation.ok;
      $('#split-launch').textContent = allocation.ok ? 'Encaisser les articles attribués' : allocation.message;
      $('#split-launch').title = allocation.message || '';
      lucide.createIcons();
    }

    // Item splitting allocates whole units. Only explicit equal splitting may
    // share the price of one dish between diners. Validate again at payment entry.
    function splitArticleAllocation() {
      const items = Object.entries(splitState.itemTotals || {});
      const n = Number(splitState.numConvives);
      const invalid = () => ({ ok: false, message: 'Attribution invalide : vérifiez les articles' });
      if (!items.length || !Number.isInteger(n) || n < 1) return invalid();
      const totals = new Map(items.map(([name, info]) => [name, info.totalQty]));
      const assigned = new Map();
      for (const [convive, cart] of Object.entries(splitState.perConvive || {})) {
        if (!Number.isInteger(Number(convive)) || Number(convive) < 1 || Number(convive) > n || !cart || typeof cart !== 'object') return invalid();
        for (const [name, qty] of Object.entries(cart)) {
          if (!totals.has(name) || !Number.isInteger(qty) || qty < 0) return invalid();
          assigned.set(name, (assigned.get(name) || 0) + qty);
        }
      }
      let remaining = 0;
      for (const [name, qty] of totals) {
        if (!Number.isInteger(qty) || qty < 0 || (assigned.get(name) || 0) > qty) return invalid();
        remaining += qty - (assigned.get(name) || 0);
      }
      return remaining ? { ok: false, message: `${remaining} article${remaining > 1 ? 's' : ''} à attribuer` } : { ok: true, message: '' };
    }

    function renderConvivesTabs() {
      const n = splitState.numConvives;
      $('#split-convives-tabs').innerHTML = Array.from({ length: n }, (_, i) => {
        const c = i + 1;
        const isActive = c === splitState.activeConvive;
        return `
          <button class="split-conv-tab ${isActive ? 'is-active' : ''}" data-conv-tab="${c}">
            <span class="split-conv-tab-label">Conv ${c}</span>
            <span class="split-conv-tab-total">${fmtMAD(conviveTotal(c))}</span>
          </button>`;
      }).join('');
    }

    function renderPool() {
      const items = Object.entries(splitState.itemTotals);
      $('#split-pool').innerHTML = items.map(([name, info]) => {
        const rem = remainingQty(name);
        const isEmpty = rem <= 0;
        return `
          <button class="split-pool-item ${isEmpty ? 'is-empty' : ''}" data-pool-item="${name}" type="button">
            <div class="split-pool-item-info">
              <div class="split-pool-item-name">${name}</div>
              <div class="split-pool-item-meta">
                <span class="remaining">${rem}</span> / ${info.totalQty} restant${info.totalQty > 1 ? 's' : ''} · ${info.unitPrice} MAD chacun
              </div>
            </div>
            <div class="split-pool-item-add">+</div>
          </button>`;
      }).join('');
    }

    function renderConviveCart() {
      const c = splitState.activeConvive;
      const cart = splitState.perConvive[c] || {};
      const entries = Object.entries(cart);
      const wrap = $('#split-convive-cart');
      if (!wrap) return;

      if (entries.length === 0) {
        wrap.innerHTML = `<div class="split-convive-cart-empty-state">Convive ${c} n'a encore rien · tapez un article ci-dessus</div>`;
        return;
      }
      const total = conviveTotal(c);
      const rowsHTML = entries.map(([name, qty]) => {
        const unitPrice = splitState.itemTotals[name].unitPrice;
        const lineTotal = qty * unitPrice;
        const qtyPrefix = qty > 1 ? `${qty}× ` : '';
        return `
          <div class="split-convive-cart-row">
            <span class="split-convive-cart-name">${qtyPrefix}${name}</span>
            <div class="split-convive-cart-actions">
              <span class="split-convive-cart-price">${fmtMAD(lineTotal)}</span>
              <button class="split-convive-cart-remove" data-remove-item="${name}" aria-label="Retirer">×</button>
            </div>
          </div>`;
      }).join('');
      wrap.innerHTML = `
        <div class="split-convive-cart">
          <div class="split-convive-cart-title">
            <span>Articles de Convive ${c}</span>
            <span class="split-convive-cart-total">${fmtMAD(total)}</span>
          </div>
          ${rowsHTML}
        </div>`;
    }

    function renderPartsChips() {
      const opts = [2, 3, 4, 5, 6, 8];
      $('#split-parts-chips').innerHTML = opts.map(n =>
        `<button class="split-chip ${n === splitState.numParts ? 'is-active' : ''}" data-parts="${n}">${n}</button>`
      ).join('');
    }

    function renderTipChips() {
      const opts = [
        { label: '0 %',  val: '0'   },
        { label: '5 %',  val: '5'   },
        { label: '10 %', val: '10'  },
        { label: '15 %', val: '15'  },
        { label: 'autre',val: 'autre'},
      ];
      $('#split-tip-chips').innerHTML = opts.map(o =>
        `<button class="split-chip ${o.val === splitState.tipMode ? 'is-active' : ''}" data-tip="${o.val}">${o.label}</button>`
      ).join('');
      const customVisible = splitState.tipMode === 'autre';
      $('#split-tip-custom').classList.toggle('is-visible', customVisible);
      if (customVisible) {
        const inp = $('#split-tip-input');
        inp.value = splitState.customTipPct || '';
        setTimeout(() => inp.focus(), 60);
      }
    }

    function updateSplitSummary() {
      const tipPct = effectiveTipPct();
      const tipAmt = money(splitState.total * tipPct / 100);
      const withTip = money(splitState.total + tipAmt);
      const perPerson = money(withTip / splitState.numParts);

      $('#split-total-display').textContent = fmtMADcents(splitState.total);
      const tipRow = $('#split-tip-row');
      if (tipPct > 0) {
        tipRow.style.display = '';
        $('#split-tip-label').textContent = `+ pourboire ${tipPct}%`;
        $('#split-tip-display').textContent = `+ ${fmtMADcents(tipAmt)}`;
      } else {
        tipRow.style.display = 'none';
      }
      $('#split-per-person').textContent = fmtMADcents(perPerson);
      $('#split-egal-desc').textContent = `${splitState.numParts} parts · ${fmtMADcents(perPerson)} chacun`;
    }

    function renderConvivesChips() {
      const opts = [2, 3, 4, 5, 6, 8];
      $('#split-convives-chips').innerHTML = opts.map(n =>
        `<button class="split-chip ${n === splitState.numConvives ? 'is-active' : ''}" data-convives="${n}">${n} convives</button>`
      ).join('');
    }

    /* Allocate in centimes, including the remainder. Each returned amount has
       at most two decimals and their sum is exactly the requested total. */
    function shareMoney(total, n) {
      const cents = minor(total);
      const base = Math.floor(cents / n);
      let rest = cents - base * n;
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push(major(base + (rest > 0 ? 1 : 0)));
        if (rest > 0) rest--;
      }
      return out;
    }

    /* Allocate a monetary total proportionally to arbitrary positive weights.
       Largest remainders receive the leftover centimes, so a discounted
       article split preserves both the grand total and the relative shares. */
    function shareWeighted(total, weights) {
      const target = minor(total);
      const clean = weights.map(w => Math.max(0, Number(w) || 0));
      const sum = clean.reduce((s, w) => s + w, 0);
      if (!clean.length) return [];
      if (!(sum > 0)) return shareMoney(total, clean.length);
      const raw = clean.map(w => target * w / sum);
      const cents = raw.map(Math.floor);
      let rest = target - cents.reduce((s, n) => s + n, 0);
      raw.map((n, i) => ({ i, frac: n - cents[i] }))
        .sort((a, b) => b.frac - a.frac || a.i - b.i)
        .forEach(x => { if (rest > 0) { cents[x.i]++; rest--; } });
      return cents.map(major);
    }

    /* ---- launch flow ---- */
    function launchSplitFlow() {
      if (minor(splitState.total) <= 0) {
        /* A fully-discounted table is not a cash/card payment, but it is still
           a completed commercial event. Record the approved 100% reduction as
           an auditable complimentary settlement before freeing the table.
           Generic zero totals remain blocked. */
        if (!splitState.isVrap && splitState.tableId) {
          const lines = Array.isArray(splitState.sourceLines) ? splitState.sourceLines : [];
          const discount = activeSaleDiscount(0, lines, splitState.tableId);
          if (discount && discount.grossAmountCents === discount.discountAmountCents) {
            const entry = recordSale(0, 'complimentary',
              (splitState.sourceLabel || 'Table') + ' · offerte', 0, lines, splitState.tableId);
            if (entry) {
              $('#split-modal').classList.remove('is-open');
              markPaid(splitState.tableId);
              toast('Addition offerte enregistrée · table clôturée');
              return;
            }
          }
        }
        toast('Montant nul non justifié · appliquez une remise de 100 % approuvée');
        return;
      }
      if (splitState.splitMode === 'egal' && minor(splitState.total) < splitState.numParts) {
        toast('Trop de parts pour ce montant · chaque part doit avoir au moins 0,01 MAD');
        return;
      }
      if (splitState.splitMode !== 'egal') {
        const allocation = splitArticleAllocation();
        if (!allocation.ok) { toast(allocation.message); return; }
      }
      const parts = [];
      const tipTotal = Math.round(minor(splitState.total) * effectiveTipPct() / 100 + 1e-9) / 100;
      if (splitState.splitMode === 'egal') {
        const tipPct = effectiveTipPct();
        const baseShares = shareMoney(splitState.total, splitState.numParts);
        const tipShares = shareMoney(tipTotal, splitState.numParts);
        const label = tipPct > 0 ? `Part égale + pourboire ${tipPct}%` : 'Part égale';
        /* Une part égale ne portait aucune ligne : la vente entrait au journal
           comme un montant nu, donc invisible dans la ventilation par famille du
           rapport Z · une addition partagée en trois disparaissait entièrement des
           catégories tout en restant dans le total. On donne à chaque part sa
           fraction de la note, article par article, famille comprise. */
        const shareLines = Object.entries(splitState.itemTotals).map(([name, info]) => {
          const unitPrice = info.unitPrice || 0;
          const shareUnitPrice = money(unitPrice / splitState.numParts);
          return {
            name: `${name} · 1/${splitState.numParts}`,
            baseName: info.baseName || '',
            qty: info.totalQty,
            unit: shareUnitPrice,
            price: shareUnitPrice,
            total: money(info.totalQty * unitPrice / splitState.numParts),
            cat: lineCat(info.itemId || null, name),
            itemId: info.itemId || '',
            /* Chaque part porte le plat ENTIER à 1/N du prix pour que son reçu
               se lise bien. Le journal, le rapport Z et le stock, eux, doivent
               compter 1/N de plat par part : voir recordSale(). */
            shareDen: splitState.numParts,
          };
        });
        /* Le total de chaque ligne se partage au centime : 47,50 en trois faisait
           15,83 × 3 = 47,49 au rapport Z. Les centimes de reste tournent d'une
           part à l'autre, ligne après ligne, comme ceux de la note. */
        const nParts = splitState.numParts, lineCents = Object.entries(splitState.itemTotals).map(([, info]) => minor(money((info.totalQty || 0) * (info.unitPrice || 0))));
        let turn = 0;
        const lineShares = lineCents.map((c) => {
          const out = new Array(nParts).fill(Math.floor(c / nParts));
          for (let r = c - out[0] * nParts; r > 0; r--) { out[turn] += 1; turn = (turn + 1) % nParts; }
          return out;
        });
        for (let i = 0; i < splitState.numParts; i++) {
          parts.push({ base: baseShares[i], tip: tipShares[i], amount: money(baseShares[i] + tipShares[i]), label, lines: shareLines.map((l, k) => ({ ...l, total: major(lineShares[k][i]) })), paid: false, payMethod: null });
        }
      } else {
        const n = splitState.numConvives;

        for (let c = 1; c <= n; c++) {
          const cart = splitState.perConvive[c] || {};
          const amt = Object.entries(cart).reduce((s, [name, qty]) => {
            return s + qty * (splitState.itemTotals[name]?.unitPrice || 0);
          }, 0);

          if (amt < 0.01) continue; // skip empty convives

          const items = Object.entries(cart)
            .map(([name, qty]) => qty > 1 ? `${qty}× ${name}` : name)
            .join(', ');
          const assignedLines = Object.entries(cart).map(([name, qty]) => {
            const info = splitState.itemTotals[name] || {};
            const unitPrice = info.unitPrice || 0;
            return {
              name, baseName: info.baseName || '', qty,
              unit: unitPrice,
              price: unitPrice,
              total: money(qty * unitPrice),
              cat: lineCat(info.itemId || null, name),
              itemId: info.itemId || '',
            };
          });
          const partLines = assignedLines;
          parts.push({
            weight: amt,
            label: items || 'Part équilibrée',
            /* Chaque part garde ses lignes pour que le ticket imprimé du
               convive liste ses articles, pas juste un montant. */
            lines: partLines,
            paid: false, payMethod: null,
          });
        }
        const weights = parts.map(p => p.weight);
        const bases = shareWeighted(splitState.total, weights);
        const tips = shareWeighted(tipTotal, weights);
        parts.forEach((p, i) => {
          p.base = bases[i]; p.tip = tips[i]; p.amount = money(bases[i] + tips[i]);
          delete p.weight;
        });
      }

      if (!parts.length || parts.some(part => minor(part.base) <= 0)) {
        toast('Une part vaut 0 MAD · regroupez les articles ou ajustez la remise');
        return;
      }
      const flowSession = (splitState.tableId && phoneSessionOf(splitState.tableId)) || ('flow-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7));
      splitState.flow = { parts, paidCount: 0, session: flowSession,
        id: 'split-' + (window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)) };
      $('#split-setup').hidden = true;
      $('#split-flow').hidden = false;
      renderSplitFlow();
      lucide.createIcons();
    }

    function renderSplitFlow() {
      const { parts, paidCount } = splitState.flow;
      $('#split-flow-progress').textContent = `${paidCount} / ${parts.length} réglées`;
      $('#split-parts-list').innerHTML = parts.map((p, idx) => {
        if (p.paid) {
          return `<div class="split-part-card is-paid" data-part="${idx}">
            <div class="split-part-num"><i data-lucide="check"></i></div>
            <div class="split-part-info">
              <div class="split-part-amount">${fmtMADcents(p.amount)}</div>
              <div class="split-part-paid-label">Réglé · ${p.payMethod === 'carte' ? 'Carte' : 'Espèces'}</div>
            </div>
            <div class="split-part-btns">
              <button class="split-part-btn reprint" data-reprint-part="${idx}" aria-label="Réimprimer le ticket">
                <i data-lucide="printer"></i><span>Ticket</span>
              </button>
            </div>
          </div>`;
        }
        return `<div class="split-part-card" data-part="${idx}">
          <div class="split-part-num">${idx + 1}</div>
          <div class="split-part-info">
            <div class="split-part-amount">${fmtMADcents(p.amount)}</div>
            <div class="split-part-label">${p.label}</div>
          </div>
          <div class="split-part-btns">
            <button class="split-part-btn carte" data-pay-part="${idx}" data-pay-method="carte" aria-label="Payer par carte">
              <i data-lucide="credit-card"></i><span>Carte</span>
            </button>
            <button class="split-part-btn cash-dark" data-pay-part="${idx}" data-pay-method="cash" aria-label="Payer en espèces">
              <i data-lucide="banknote"></i><span>Espèces</span>
            </button>
          </div>
        </div>`;
      }).join('');
      lucide.createIcons();
    }

    function paySplitPart(partIdx, method) {
      const part = splitState.flow.parts[partIdx];
      if (!part || part.paid) return;

      // Bind modal subtitle to the split context
      setPayBindings(`Part ${partIdx + 1}`, splitState.sourceLabel || splitState.tableId || '');

      if (method === 'carte') {
        /* openCardModal() derives both the displayed and authorized amount from
           currentTotal(). Without this override a 40 MAD card part displayed,
           then authorized, the full table amount. */
        cashAmountOverride = part.amount;
        splitPayCallback = () => markSplitPartPaid(partIdx, 'carte');
        openCardModal();
      } else {
        cashAmountOverride = part.amount;
        splitPayCallback = () => markSplitPartPaid(partIdx, 'cash');
        openCashModal();
      }
    }

    function markSplitPartPaid(partIdx, method) {
      const p = splitState.flow.parts[partIdx];
      if (!p || p.paid) return;
      const tip = money(p.tip || 0);
      const base = money(p.base != null ? p.base : (p.amount - tip));
      const splitInfo = { index: partIdx, count: splitState.flow.parts.length, flowId: splitState.flow.id };
      /* 'wallet' : une part payée par Autre dans le volet du kit (étape 4) ; la
         fenêtre livrée ne passe que 'carte' et 'cash'. */
      const entry = recordSale(base, method === 'carte' ? 'card' : method === 'wallet' ? 'wallet' : 'cash',
        (splitState.sourceLabel || 'Table') + ' · part ' + (partIdx + 1), tip, p.lines,
        splitState.tableId || '', null, splitInfo);
      if (!entry) {
        toast('Encaissement non enregistré · la table reste ouverte');
        return null;
      }
      if (entry) {
        /* `flow-*` is only the local split modal's resume key. A takeaway has
           no table visit; never send that UI token as a server session. Table
           splits still carry their real phone/table visit above. */
        if (!splitState.isVrap && splitState.flow && splitState.flow.session && !entry.session) {
          entry.session = String(splitState.flow.session);
        }
        p.saleId = entry.id;
      }
      p.paid = true; p.payMethod = method;
      splitState.flow.paidCount++;
      renderSplitFlow();

      if (method === 'cash') {
        openCashDrawer();
      }
      printSaleTicket(entry || lastSaleEntry());

      if (splitState.flow.paidCount >= splitState.flow.parts.length) {
        // All parts settled · finalize the sale
        $('#split-parts-list').style.opacity = '0.45';
        $('#split-all-done').hidden = false;
        if (splitState.isVrap)       settleVrapPayment();
        else if (splitState.tableId) markPaid(splitState.tableId);
        lucide.createIcons();
      }
      return entry;
    }

    /* ---- events ---- */
    $('#split-modal').addEventListener('click', (e) => {
      // Tab switch
      const tab = e.target.closest('[data-split-tab]');
      if (tab) { splitState.splitMode = tab.dataset.splitTab; renderSplitSetup(); return; }

      // Parts chips
      const partsChip = e.target.closest('[data-parts]');
      if (partsChip) {
        splitState.numParts = parseInt(partsChip.dataset.parts);
        renderPartsChips(); updateSplitSummary(); return;
      }

      // Tip chips
      const tipChip = e.target.closest('[data-tip]');
      if (tipChip) {
        splitState.tipMode = tipChip.dataset.tip;
        renderTipChips(); updateSplitSummary(); return;
      }

      // 1 · Number of convives → reset per-convive assignments
      const convivesChip = e.target.closest('[data-convives]');
      if (convivesChip) {
        splitState.numConvives = parseInt(convivesChip.dataset.convives);
        splitState.perConvive = {};
        splitState.activeConvive = 1;
        renderArticleMode();
        return;
      }

      // 2 · Switch the active convive (tab)
      const convTab = e.target.closest('[data-conv-tab]');
      if (convTab) {
        splitState.activeConvive = parseInt(convTab.dataset.convTab);
        renderArticleMode();
        return;
      }

      // 3 · Tap an item in the pool → assign one unit to active convive
      const poolItem = e.target.closest('[data-pool-item]');
      if (poolItem) {
        assignUnit(poolItem.dataset.poolItem);
        renderArticleMode();
        return;
      }

      // × on an assigned item → remove one unit from active convive
      const removeBtn = e.target.closest('[data-remove-item]');
      if (removeBtn) {
        unassignUnit(removeBtn.dataset.removeItem);
        renderArticleMode();
        return;
      }

      // Launch button
      if (e.target.closest('#split-launch')) { launchSplitFlow(); return; }

      // Cancel link
      if (e.target.closest('#split-cancel')) { closeSplitModal(); return; }

      // Done close
      if (e.target.closest('#split-done-close')) {
        closeSplitModal({ skipRevert: true });
        closeRightPanel();
        return;
      }

      // Pay-part buttons
      const payBtn = e.target.closest('[data-pay-part]');
      if (payBtn) {
        paySplitPart(parseInt(payBtn.dataset.payPart), payBtn.dataset.payMethod);
        return;
      }

      // Reprint paid part button
      const reprintBtn = e.target.closest('[data-reprint-part]');
      if (reprintBtn) {
        const pIdx = parseInt(reprintBtn.dataset.reprintPart);
        const part = splitState.flow && splitState.flow.parts && splitState.flow.parts[pIdx];
        if (part && part.saleId) {
          const sale = journal.find(en => en && en.id === part.saleId);
          if (sale) printSaleTicket(sale, { copy: true });
          else toast('Ticket introuvable');
        } else if (lastSaleEntry()) {
          printSaleTicket(lastSaleEntry(), { copy: true });
        }
        return;
      }

      // Click on veil backdrop (only allowed on setup screen, not mid-flow)
      if (e.target === $('#split-modal') && !$('#split-flow').hidden) return;
      if (e.target === $('#split-modal')) closeSplitModal();
    });

    // Custom tip percentage input
    document.addEventListener('input', (e) => {
      if (e.target.id === 'split-tip-input') {
        splitState.customTipPct = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
        updateSplitSummary();
      }
    });

    // Escape also closes split modal (same handler already closes card/cash)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && $('#split-modal').classList.contains('is-open')) {
        if (!$('#split-flow').hidden) return; // don't accidentally close mid-flow
        closeSplitModal();
      }
    }, { capture: false });

    /* ===========================================================
       PIN LOGIN
       =========================================================== */
    const pinScreen = $('#pin-screen');
    /* Expose the restaurant-caisse boot for the pairing module (caisse-pairing.js),
       which boots a paired store into its matching vertical (restaurant → here). */
    try { window.__kiwiUnlockApp = function () { return unlockApp(); }; } catch (_) {}
    let pinBuffer = '';

    function renderPinDots() {
      $$('#pin-dots .pin-dot').forEach((d, i) => {
        d.classList.toggle('is-filled', i < pinBuffer.length);
      });
    }

    /* Support access skips a staff PIN only after pairing proves the named
       operator. It is NOT permission to open a new merchant service on load,
       overwrite its provisional Z, or resume a local cashier's journal. */
    function operatorCaisseRequested() {
      try {
        return new URLSearchParams(location.search || '').get('op') === '1';
      } catch (_) { return false; }
    }

    function unlockApp() {
      /* PIN accepted · cross-fade the PIN into the clock-in screen
       * (ouverture de caisse). The greeting flash + shell dive-in now
       * run from openService(), once the cashier opens the register. */
      const clockinEl = document.getElementById('clockin-screen');

      if (operatorCaisseRequested()) {
        const notice = document.getElementById('operator-service-notice');
        if (notice) notice.hidden = false;
        const link = document.getElementById('operator-dashboard-link');
        if (link) link.href = '/dashboard?op=1&merchant=' + encodeURIComponent(currentMerchantSlug());
      }

      // t=0..210: success pop on the 4 dots, staggered left → right.
      $$('#pin-dots .pin-dot').forEach((d, i) => {
        setTimeout(() => d.classList.add('is-success'), i * 70);
      });

      // t=460: cross-fade · PIN out, clock-in screen in.
      setTimeout(() => {
        pinScreen.classList.add('is-leaving');
        if (clockinEl) {
          clockinEl.classList.add('is-visible');
          clockinEl.setAttribute('aria-hidden', 'false');
        }
      }, 460);

      // t=940: PIN gone.
      setTimeout(() => { pinScreen.style.display = 'none'; }, 940);
    }

    /* Reset the PIN state and replay the fade-in animation. Exposed on window
       because the pressing mode (PIN 0000, assets/pressing-caisse.js) locks
       the terminal back too, and pinBuffer lives inside this IIFE. */
    window.__kiwiPinReset = function () {
      pinBuffer = '';
      renderPinDots();
      $$('#pin-dots .pin-dot').forEach(d => d.classList.remove('is-success'));
      pinScreen.classList.remove('is-leaving');
      pinScreen.style.display = '';
      pinScreen.style.animation = 'none';
      void pinScreen.offsetWidth; // force reflow so the fade-in keyframe replays
      pinScreen.style.animation = '';
    };

    /* ===========================================================
       === Shift lifecycle ===  (clock-in · live stats · Clôture)
       =========================================================== */
    let   openingFloat   = 0;      // fond d'ouverture · MAD (chosen at clock-in, never preselected)
    const cashMovements  = [];     // [{ id, time, type:'in'|'out', amount, reason }]
    const DAILY_OBJECTIF = 18000;  // objectif d'lyoum · MAD

    /* Non-journal shift counters · the journal below is the ledger of record.
       `discounts` opens at 95 for the pitch demo (a service already under way).
       A real store opens at zero · applyStoreIdentity() clears it, the same way
       it clears the seeded transaction counters. `discountsCount` and `cancels`
       feed the daily report, which counts them as well as sums them: "3 remises
       pour 95 MAD" tells a patron something "95 MAD" alone does not. */
    const shift = { discounts: 95, discountsCount: 2, cancels: 0, refunds: 0, tablesPaid: 0 };
    let shiftOpenedAt = null;
    let shiftOpenedBy = '';        // qui a ouvert la caisse · figé à l'ouverture
    let cashSessionKey = '';

    /* ---- Cashier handover ("passation de caisse") ----
       A business day is split into "postes" · one per cashier. The journal
       keeps growing across the whole day; `posteOpenedAt` marks where the
       CURRENT cashier's accountability starts, `posteOpeningFloat` is the
       drawer they took over. Each handover is logged for the Clôture. */
    const CASHIER_ROSTER = [
      { id: 'othmane', name: 'Othmane N.', role: 'Caissier'  },
      { id: 'yassine', name: 'Yassine M.', role: 'Caissier'  },
      { id: 'salma',   name: 'Salma T.',   role: 'Caissière' },
      { id: 'mehdi',   name: 'Mehdi A.',   role: 'Caissier'  },
    ];
    let   currentCashier    = { id: 'othmane', name: 'Othmane N.', role: 'Caissier' };
    let   posteOpenedAt     = null;  // current cashier's poste start
    let   posteOpeningFloat = 500;   // drawer the current cashier took over
    const handovers         = [];    // [{ id,time,fromName,toName,posteOpenedAt,expected,counted,ecart }]

    /* ---- Journal des ventes · the shift's transaction ledger ---- */
    const journal = [];         // [{ id, time, label, amount, method, ref }]
    let journalSearch = '';
    let journalFilter = 'all';  // all | card | cash | complimentary
    let lastSaleId    = null;

    const activeCloudSaleIds = new Set();
    document.addEventListener('kiwi-sales-voided', (e) => {
      try {
        reconcileVoids(
          (e && e.detail && e.detail.refs) || [],
          (e && e.detail && e.detail.ids) || [],
          (e && e.detail && e.detail.voidEvents) || []
        );
      } catch (_) {}
    });
    /* Le sondage qui a précédé cet écouteur ne se rejouera pas tout seul. */
    try {
      if (window.KiwiLive && window.KiwiLive.voidedRefs) {
        reconcileVoids(
          window.KiwiLive.voidedRefs(),
          window.KiwiLive.voidedSaleIds ? window.KiwiLive.voidedSaleIds() : [],
          window.KiwiLive.voidEvents ? window.KiwiLive.voidEvents() : []
        );
      }
    } catch (_) {}
    /* ── VENDUE ICI, PAS ENCORE DANS LA FILE ─────────────────────────────────
     * Quand le stockage local est plein, Live Link refuse la mise en file
     * (`queue-storage-full`). La vente a pourtant eu lieu : l'argent est dans
     * le tiroir, le ticket est imprimé. Elle reste donc au journal, UNE fois,
     * marquée `saleHeldLocal`, et une copie part sur une étagère à part qui
     * survit au rechargement comme à la clôture : localStorage si une petite
     * écriture y passe encore, IndexedDB (quota bien plus large) dans tous les
     * cas. Le battement de cinq secondes la rejoue jusqu'à ce que la file la
     * prenne ; postSale() dérive le même identifiant à chaque essai, donc un
     * rejeu ne réserve jamais deux fois. Rien à l'écran ne propose de
     * réencaisser : la ligne d'état du rail compte ces ventes jusqu'à leur
     * envoi (caisse-pwa.js, window.KiwiCaisseHeldSales). */
    const HELD_SALES_PREFIX = 'kiwi-caisse-held-sales:';
    let heldSalesCache = null;
    window.KiwiCaisseHeldSales = Object.freeze({
      count: () => heldSaleRows().length,
      retry: retryHeldSales,
    });
    /* IndexedDB took a sale that localStorage refused: release it now rather
       than at the next tick. */
    window.addEventListener('kiwi:money-enqueued', () => { try { retryHeldSales(); } catch (_) {} });

    /* Every completed payment already exists in the SAME cloud sales ledger
       that feeds Dashboard Commandes. Mirror that ledger into the open caisse
       journal too: OrderPro, waiter and another till must all produce the same
       Transactions list after a reload. The server id is not always the local
       id, so the printed reference is the cross-device deduplication key. */
    let employeeSaleFeedStarted = false;
    let employeeSaleFeedMerchant = '';
    /* A restored register exists before deferred scripts run. A fresh register
       does not: doOpenService() below starts the bridge at the exact moment it
       creates shiftOpenedAt. */
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        if (shiftOpenedAt) startEmployeeSaleJournalSync();
      }, { once: true });
    } else if (shiftOpenedAt) startEmployeeSaleJournalSync();

    /* ═══════════ CLIENT & FIDÉLITÉ SUR LA NOTE ══════════════════════════════
     * assets/clients-store.js (le carnet) et assets/clients-book.js (l'écran)
     * étaient chargés sur ce comptoir depuis le début, et RIEN dans cette page
     * ne les appelait : on pouvait inscrire un client depuis le carnet, jamais
     * lui compter un passage en encaissant. Sur la boutique, si ·
     * assets/pos-boutique.js appelle recordPurchase à l'encaissement. Le
     * restaurant, lui, tenait un carnet qui ne bougeait jamais.
     *
     * Le programme de fidélité (points au dirham, ou tampons) est réglé par le
     * patron au tableau de bord ; ici on ne fait que déclarer le passage et
     * laisser KiwiClients appliquer SES règles.
     *
     * Une note = un passage. Une addition partagée en quatre appelle recordSale
     * quatre fois : sans détachement immédiat, la cliente repartirait avec
     * quatre tampons pour un déjeuner. */
    let saleClient = null;

    /* ---- le sélecteur ---- */
    const clientModal = $('#client-modal');
    let clNewMode = false;

    $('#rp-client').addEventListener('click', (e) => {
      if (e.target.closest('#rp-client-clear')) {
        e.stopPropagation();
        saleClient = null; renderSaleClient(); return;
      }
      openClientModal();
    });
    $('#cl-search').addEventListener('input', clPaint);
    $('#cl-list').addEventListener('click', (e) => {
      const row = e.target.closest('[data-cl-pick]');
      if (!row) return;
      try { attachClient(window.KiwiClients.get(row.dataset.clPick)); } catch (_) {}
    });
    $('#cl-cancel').addEventListener('click', () => { if (clNewMode) { clNewMode = false; clPaint(); } else closeClientModal(); });
    $('#cl-confirm').addEventListener('click', () => {
      if (!clNewMode) { clNewMode = true; clPaint(); setTimeout(() => { try { $('#cl-new-name').focus(); } catch (_) {} }, 80); return; }
      const name = ($('#cl-new-name').value || '').trim();
      const phone = ($('#cl-new-phone').value || '').trim();
      /* Un carnet de noms sans numéro ne sert à rien le jour où le patron veut
         rappeler ses habitués · mais on ne bloque pas une inscription au
         comptoir pour ça : le nom suffit, le numéro se complète plus tard. */
      if (!name && !phone) { try { $('#cl-new-name').focus(); } catch (_) {} return; }
      try {
        const rec = window.KiwiClients.upsert({
          name: name || phone, phone: phone,
          consent: !!($('#cl-new-consent') && $('#cl-new-consent').checked),
          source: 'caisse',
        });
        attachClient(rec);
      } catch (_) { toast('Enregistrement impossible'); }
    });
    clientModal.addEventListener('click', (e) => { if (e.target === clientModal) closeClientModal(); });

    /* Le carnet complet (fiches, historique, récompenses) reste celui de
       assets/clients-book.js, qui greffe sa propre entrée dans .act-selector. */
    renderSaleClient();
    if (!hookClientBook()) document.addEventListener('DOMContentLoaded', hookClientBook, { once: true });
    document.addEventListener('kiwi-paired', () => { try { renderSaleClient(); } catch (_) {} });

    /* ============ REÇU / TICKET · receipt preview ============ */
    /* Faux but plausible Moroccan establishment identifiers · DEMO ONLY. */
    const RECEIPT_ICE   = '002176548000071';  /* 15-digit ICE (demo) */
    const RECEIPT_PHONE = '+212 522 27 84 19';
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyStoreIdentity);
    else applyStoreIdentity();
    // This runs at load, BEFORE anyone has entered their code · so re-run it the
    // moment the till learns who is on shift, and again when they hand over.
    document.addEventListener('kiwi-staff', function () { applyStoreIdentity(); startLiveTeam(); });
    // Same for WHICH store: the pairing is redeemed after this file has painted,
    // so a device handed over from a second store's dashboard kept showing the
    // first store's name everywhere until reload.
    document.addEventListener('kiwi-paired', function () {
      liveTeamMerchant = '';
      applyStoreIdentity();
      startLiveTeam();
    });
    // The roster arrives async (/api/config → KiwiConfig.pins → kiwi-config), after
    // this file has painted its demo servers · rebuild the floor team when it lands.
    document.addEventListener('kiwi-config', function () { try { rebuildRealRoster(); startLiveTeam(); syncActiveMode(); if (mode === 'vrap') renderVrapBoard(); } catch (_) {} });
    setTimeout(startLiveTeam, 1000);

    /* L'écriture actuellement à l'écran · c'est ELLE qu'on réimprime, pas une
       nouvelle vente. Une réimpression garde le numéro et le contenu d'origine. */
    let receiptEntry = null;

    $('#receipt-close').addEventListener('click', closeReceipt);
    /* Ce bouton annonçait « Ticket envoyé à l'imprimante » et fermait la fenêtre.
       Il n'imprimait rien. Sur une vraie caisse, la caissière le pressait, le
       client attendait, et il ne sortait jamais de papier · le pire mensonge
       qu'une caisse puisse faire. Il imprime maintenant, et il dit quand il n'a
       pas pu.
       DUPLICATA parce qu'un second exemplaire du même ticket qui circule sans le
       dire est une pièce qu'on ne peut plus rapprocher. Le NUMÉRO, lui, ne
       change pas : c'est le même achat. */
    $('#receipt-print').addEventListener('click', () => {
      const doc = receiptDocFor(receiptEntry, { copy: true });
      if (!doc) { toast('Impression indisponible sur cet appareil'); return; }
      toast('Impression du reçu…');
      Promise.resolve(window.KiwiReceipt.print(doc)).then(
        (r) => toast(r && r.ok ? 'Reçu imprimé' : 'Impression échouée'),
        () => toast('Impression échouée')
      );
      closeReceipt();
    });
    const rcptInv = $('#receipt-invoice');
    if (rcptInv) {
      rcptInv.addEventListener('click', () => {
        if (!receiptEntry) return;
        if (window.KiwiInvoice && typeof window.KiwiInvoice.makeSaleInvoice === 'function') {
          window.KiwiInvoice.makeSaleInvoice(receiptEntry);
        }
      });
    }
    $('#receipt-modal').addEventListener('click', (e) => {
      if (e.target === $('#receipt-modal')) closeReceipt();
    });

    /* ---- Clôture de caisse · end-of-service report ---- */
    let clotureExpected = 0;
    let clotureCardExpected = 0;
    let terminalCardTotal = null;
    // KiwiLive dispatches on window, not document. Listening on document
    // silently lost every server acknowledgement (and refund recovery event).
    window.addEventListener('kiwi:money-sync', (event) => {
      const detail = event && event.detail || {};
      if (detail.kind === 'sale' && detail.id) {
        let changed = false;
        journal.forEach((entry) => {
          if (!entry || entry.kind === 'refund' || entry.origin) return;
          const queuedId = String(entry.serverSaleId || window.KiwiLive?.saleIdFor?.(entry, currentMerchantSlug()) || '');
          if (queuedId !== String(detail.id)) return;
          if (detail.state === 'accepted') {
            entry.serverSaleId = String(detail.serverId || detail.id);
            delete entry.saleSyncPending;
            delete entry.saleSyncError;
            if (entry.saleHeldLocal) { delete entry.saleHeldLocal; releaseHeldSale(entry.id); }
          } else if (detail.state === 'blocked') {
            entry.saleSyncPending = true;
            entry.saleSyncError = 'sale-conflict';
          }
          changed = true;
        });
        if (changed) { try { persistShift(); } catch (_) {} }
        return;
      }
      if (detail.kind !== 'refund' || !detail.id) return;
      let changed = false;
      journal.forEach((entry) => {
        if (!entry || entry.kind !== 'refund') return;
        let serverId = String(entry.serverSaleId || '');
        if (!serverId) {
          try { serverId = String(window.KiwiLive?.moneyId?.(entry) || ''); } catch (_) {}
        }
        if (!serverId || serverId !== String(detail.id)) return;
        if (detail.state === 'accepted') {
          entry.serverSaleId = serverId;
          entry.refundSynced = true;
          entry.refundSyncNeedsApproval = false;
          entry.refundSyncStatus = 'accepted';
          applyAcceptedRefund(entry);
          /* The server has consumed the exact capability. Retain the named
             approver for the local audit, not the bearer token. */
          if (entry.refundActor) entry.refundActor.approval = '';
          changed = true;
        } else if (Number(detail.status) === 403) {
          entry.refundSyncNeedsApproval = true;
          entry.refundSyncStatus = 'manager-required';
          changed = true;
        } else if (detail.state === 'blocked' && Number(detail.status) >= 400) {
          markRejectedRefund(entry, detail.status);
          changed = true;
        }
      });
      if (!changed) return;
      try { persistShift(); } catch (_) {}
      try {
        if ($('#refund-modal') && $('#refund-modal').classList.contains('is-open')) renderRefundRecovery();
      } catch (_) {}
    });
    /* L'instantané provisoire. `reopen:false` : tenir le tableau de bord à jour
       pendant le service n'est pas une clôture et ne doit ni incrémenter le
       compteur de fermetures ni salir l'historique des révisions. */
    let lastProvisional = 0;

    /* ---- L'écran d'après-clôture ----
       Le patron vient de fermer sa caisse. Il lui reste UNE décision : garder ou
       non une trace papier. Les trois choix sont ceux d'une caisse et pas d'un
       logiciel · imprimer, réimprimer si le rouleau a bourré, ou continuer sans.
       La caisse ne se recharge qu'ensuite : recharger d'abord, c'était fermer la
       porte avant d'avoir posé la question. */
    let closedReport = null;

    /* #0164 · Pasta Corner, 2026-10-05. The close was recorded at 01:16 (cash
       event, Z, day report), but the page never finished: four minutes later
       the same service was still on screen, and every new « Fermer la caisse »
       returned silently on `registerClosing`. A close must therefore (1) say
       when it is already running, (2) never wait forever on storage, and (3)
       once durably recorded, always end in finishClose(), even if the paper
       sheet fails to render. */
    let registerClosed = false;
    /* La clôture sur le kit (§18.9) : le motif d'écart et la feuille de comptage
       ouverte. Déclarés ici, dans le même bloc que closeRegisterSteps() qui les
       lit, pour que la clôture reste exécutable seule. */
    let closeGapReason = null;
    let tillKitCount = null;
    const CLOSE_STEP_TIMEOUT_MS = 15000;

    const clockinBtn = document.getElementById('clockin-btn');
    if (clockinBtn) clockinBtn.addEventListener('click', openService);
    /* Imprimer AVANT de fermer · le patron qui veut relire son Z sur papier
       avant de valider le comptage. Le rapport est construit avec le comptage
       saisi à l'instant, pas avec un zéro : un aperçu qui n'a pas le même écart
       que l'écran ne sert à rien. Aucune écriture ici, c'est un tirage. */
    $('#clo-print').addEventListener('click', () => {
      const cardRaw = $('#clo-card-z') ? $('#clo-card-z').value.trim() : '';
      const cardValue = cardRaw === '' ? NaN : Number(cardRaw);
      terminalCardTotal = Number.isFinite(cardValue) && cardValue >= 0 ? money(cardValue) : null;
      const raw = $('#clo-count') ? $('#clo-count').value : '';
      const r = buildDayReport((raw === '' || raw == null) ? null : parseFloat(raw), 0);
      if (!r) { toast('Rapport indisponible'); return; }
      doPrintDayReport(r, 'AVANT CLÔTURE');
    });
    $('#clo-close').addEventListener('click', () => { window.KiwiAuthAct?.({ kind: 'close_till', key: 'act.close_till' }); requireTillOperator('Fermeture de caisse', closeRegister); });
    $('#clo-continue').addEventListener('click', () => $('#cloture-modal').classList.remove('is-open'));

    /* ---- L'écran d'après-clôture : imprimer · réimprimer · continuer ---- */
    (function wirePostClose() {
      const veil = $('#zsheet-modal'); if (!veil) return;
      const print = $('#zs-print'), reprint = $('#zs-reprint'), skip = $('#zs-skip');
      if (print) print.addEventListener('click', () => {
        if (!closedReport) return finishClose();
        print.disabled = true;
        doPrintDayReport(closedReport, '').then((res) => {
          print.disabled = false;
          /* « Réimprimer » n'apparaît qu'APRÈS un premier tirage : proposer de
             réimprimer ce qui n'a jamais été imprimé n'a pas de sens. */
          if (res?.ok) {
            if (reprint) reprint.hidden = false;
            const lbl = print.querySelector('span'); if (lbl) lbl.textContent = 'Imprimer à nouveau';
          }
        });
      });
      if (reprint) reprint.addEventListener('click', () => {
        if (!closedReport) return;
        /* Un double du Z porte la mention DUPLICATA. Deux exemplaires
           indiscernables de la même journée qui circulent, c'est une pièce
           comptable qu'on ne peut plus rapprocher. */
        doPrintDayReport(closedReport, 'DUPLICATA');
      });
      if (skip) skip.addEventListener('click', finishClose);
      /* Pas de fermeture au clic sur le voile : la caisse va se recharger, un
         clic à côté ne doit pas décider ça à la place du commerçant. */
    })();
    $('#cloture-modal').addEventListener('click', (e) => {
      if (e.target === $('#cloture-modal')) $('#cloture-modal').classList.remove('is-open');
    });

    /* ---- Rapport du jour · le tiroir à trois onglets ----
     *
     * Résumé · Ventes par article · Journal. Le troisième est l'ancien tiroir
     * « Journal des ventes » tel quel ; les deux premiers sont ce qui lui
     * manquait. Le rapport se recalcule à chaque rendu depuis le journal en
     * mémoire · c'est la même fonction qui écrit le Z (buildDayReport), donc
     * ce que le comptoir lit en plein service et ce qui s'imprimera à la
     * clôture ne peuvent pas raconter deux journées différentes. */
    let rpTab = 'journal';

    const txnsCard = $('#stat-txns-card');
    if (txnsCard) txnsCard.addEventListener('click', () => openJournal('journal'));
    $('#journal-drawer-close').addEventListener('click', closeJournal);
    $('#rp-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rp-tab]');
      if (!b) return;
      rpTab = b.dataset.rpTab;
      /* La recherche ne traverse pas les onglets : « tajine » tapé dans les
         articles ne doit pas vider le journal en y revenant. */
      journalSearch = '';
      const input = $('#jr-search-input'); if (input) input.value = '';
      $$('#rp-tabs [data-rp-tab]').forEach((c) => {
        const on = c === b;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      renderJournal();
      const body = $('#journal-body'); if (body) body.scrollTop = 0;
    });
    $('#rp-foot').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rp-act]');
      if (!b) return;
      const a = b.dataset.rpAct;
      if (a === 'print-items') printItemSales();
      else if (a === 'print-report') printLiveReport();
      else if (a === 'reprint-last') reprintLastTicket();
    });
    $('#journal-drawer').addEventListener('click', (e) => {
      if (e.target === $('#journal-drawer')) { closeJournal(); return; }
      /* L'icône imprimante AVANT la ligne : elle est dessinée dedans, donc sans
         cette interception elle héritait du clic de la ligne et ouvrait l'aperçu.
         Une imprimante qui ouvre un aperçu n'imprime pas. DUPLICATA, parce qu'un
         second exemplaire qui circule sans le dire ne se rapproche plus. */
      const inv = e.target.closest('[data-jr-invoice]');
      if (inv) {
        e.stopPropagation();
        const entry = journal.find(en => en.id === inv.dataset.jrInvoice);
        if (entry && window.KiwiInvoice && typeof window.KiwiInvoice.makeSaleInvoice === 'function') {
          window.KiwiInvoice.makeSaleInvoice(entry);
        }
        return;
      }
      const pr = e.target.closest('[data-jr-print]');
      if (pr) {
        e.stopPropagation();
        const entry = journal.find(en => en.id === pr.dataset.jrPrint);
        if (entry) printSaleTicket(entry, { copy: true });
        return;
      }
      const row = e.target.closest('[data-jr-id]');
      if (row) {
        const entry = journal.find(en => en.id === row.dataset.jrId);
        if (entry) openReceipt(entry);
      }
    });
    $('#jr-search-input').addEventListener('input', (e) => {
      journalSearch = e.target.value;
      renderJournal();
    });
    $('#jr-filters').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-jr-filter]');
      if (!chip) return;
      journalFilter = chip.dataset.jrFilter;
      $$('#jr-filters .jr-chip').forEach(c => c.classList.toggle('is-active', c === chip));
      renderJournal();
    });

    const CM_REASONS = {
      out: ['Achat fournisseur', 'Dépôt banque', 'Avance personnel', 'Autre'],
      in:  ['Appoint monnaie', 'Correction', 'Autre'],
    };
    let cmType = 'out', cmReason = '';
    const CM_TYPE_LABEL = {
      fr: { out: 'Sortie', in: 'Entrée' },
      en: { out: 'Cash out', in: 'Cash in' },
      ar: { out: 'سحب', in: 'إيداع' },
    };
    let cmLangHooked = false;

    $('#cash-move-modal').addEventListener('click', (e) => {
      if (e.target === $('#cash-move-modal')) { closeCashMove(); return; }
      const typeBtn = e.target.closest('[data-cm-type]');
      if (typeBtn) {
        cmType = typeBtn.dataset.cmType;
        $$('#cm-type .cm-type-btn').forEach(b => b.classList.toggle('is-active', b === typeBtn));
        renderCmReasons();
        return;
      }
      const reasonBtn = e.target.closest('[data-cm-reason]');
      if (reasonBtn) {
        cmReason = reasonBtn.dataset.cmReason;
        $$('#cm-reasons .cm-reason').forEach(b => b.classList.toggle('is-active', b === reasonBtn));
        updateCmCustomVisibility();
        return;
      }
      const preset = e.target.closest('[data-cm-add]');
      if (preset) {
        $('#cm-amount').value = (parseFloat($('#cm-amount').value) || 0) + parseFloat(preset.dataset.cmAdd);
        return;
      }
      if (e.target.closest('#cm-cancel'))  { closeCashMove(); return; }
      if (e.target.closest('#cm-confirm')) { confirmCashMove(); return; }
    });

    const cmAmountInput = $('#cm-amount');
    if (cmAmountInput) {
      cmAmountInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmCashMove();
        }
      });
    }
    const cmCustomInput = $('#cm-custom-input');
    if (cmCustomInput) {
      cmCustomInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmCashMove();
        }
      });
    }
    const floatChips  = $('#ci-float-chips');
    const floatCustom = $('#ci-float-custom');
    const floatInput  = $('#ci-float-input');

    const floatLast = $('#ci-float-last');
    const floatErr  = $('#ci-float-err');
    /* Le caissier a-t-il dit combien il y a dans le tiroir ? Sur un vrai
       commerce l'ouverture est refusée tant que non : un fond présélectionné
       puis jamais compté devenait l'« attendu » que la clôture rapproche. */
    let floatChosen = false;

    if (floatChips) floatChips.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-float]');
      if (!chip) return;
      markFloatChip(chip);
      if (chip.dataset.float === 'custom') {
        showFloatCustom(true, true);
        openingFloat = readFloatInput();
        /* « Autre » n'engage rien tant qu'aucun montant n'est tapé (0 compte) */
        floatChosen = !!(floatInput && floatInput.value !== '');
        syncFloatGate();
        return;
      }
      showFloatCustom(false);
      openingFloat = parseInt(chip.dataset.float, 10) || 500;
      floatChosen = true; syncFloatGate();
      rememberFloat(openingFloat);
    });

    if (floatInput) {
      floatInput.addEventListener('input', () => {
        /* Un signe moins saisi par erreur ne doit pas passer dans le Z : on le
           corrige à la frappe plutôt que de refuser l'ouverture plus tard. */
        if (floatInput.value && parseFloat(floatInput.value) < 0) floatInput.value = floatInput.value.replace('-', '');
        openingFloat = readFloatInput();
        floatChosen = floatInput.value !== '';
        syncFloatGate();
        if (floatChosen) rememberFloat(openingFloat);
      });
      /* Entrée = « j'ai fini de taper », pas « ouvre la caisse » : ouvrir sur une
         touche du clavier tablette ouvrirait des services par accident. */
      floatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); floatInput.blur(); } });
    }
    if (floatLast) floatLast.addEventListener('click', () => {
      const v = parseFloat(floatLast.dataset.value);
      if (!Number.isFinite(v) || v < 0) return;
      const preset = floatChips && floatChips.querySelector(`[data-float="${v}"]`);
      openingFloat = v; floatChosen = true; syncFloatGate();
      if (preset) { markFloatChip(preset); showFloatCustom(false); return; }
      const other = floatChips && floatChips.querySelector('[data-float="custom"]');
      if (other && floatInput) { markFloatChip(other); floatInput.value = String(v); showFloatCustom(true, false); }
    });
    restoreFloat();
    document.addEventListener('kiwi-paired', () => { try { restoreFloat(); } catch (_) {} });

    /* Clôture cash-count écart */
    $('#clo-count').addEventListener('input', updateEcart);
    $('#clo-card-z').addEventListener('input', () => {
      const raw = $('#clo-card-z').value.trim();
      const value = raw === '' ? NaN : Number(raw);
      terminalCardTotal = Number.isFinite(value) && value >= 0 &&
        Math.abs(value * 100 - Math.round(value * 100)) <= 0.000001 ? money(value) : null;
      try { persistShift(); } catch (_) {}
      updateCardEcart();
    });

    const verticalDemoPins = new Set(['0000','0002','0003','0004','0005','0006','0007','0008','0009','0010','0011','0012','0013','0014','0015']);
    let pinRoutePending = false;

    $('#pin-pad').addEventListener('click', (e) => {
      const key = e.target.closest('.pin-key');
      if (!key) return;
      const v = key.dataset.pin;
      if (v === 'back') {
        pinBuffer = pinBuffer.slice(0, -1);
        renderPinDots();
        return;
      }
      if (v === 'forgot') {
        toast('SOS · contacte le manager');
        return;
      }
      if (pinBuffer.length >= 4) return;
      pinBuffer += v;
      renderPinDots();
      if (pinBuffer.length === 4) routeAccessPin(pinBuffer);
    });
    document.addEventListener('keydown', (e) => {
      if (pinScreen.style.display === 'none') return;
      if (/^[0-9]$/.test(e.key) && pinBuffer.length < 4) {
        pinBuffer += e.key;
        renderPinDots();
        if (pinBuffer.length === 4) routeAccessPin(pinBuffer);
      } else if (e.key === 'Backspace') {
        pinBuffer = pinBuffer.slice(0, -1);
        renderPinDots();
      }
    });

    /* ===========================================================
       MANAGER-PIN AUTHORIZATION GATE
       -----------------------------------------------------------
       requireManager(actionLabel, onApprove)
         · actionLabel · string shown in the modal subtitle
                          (e.g. "Remise sur l'addition").
         · onApprove   · callback fired ONLY after a valid 4-digit
                                manager code is entered. Only the unpaired local
                          demo accepts any 4 digits; a paired/hosted till validates
                          a manager-level code from its server-backed roster.
       Cancel / veil-click closes the modal WITHOUT calling onApprove.
       Every approval is logged to the `authorizations` array below.
       Exposed as window.requireManager so later features can gate
       sensitive actions through it.
       =========================================================== */
    const authorizations = [];  // [{ id, time:Date, action }]
    const mgrModal   = $('#manager-modal');
    let   mgrBuffer  = '';
    let   mgrOnApprove = null;
    let   mgrBusy    = false;    // true during the success beat
    let   mgrAccess  = 'manager';
    let   mgrAuthContext = null;
    let   mgrNeedsServer = false;  // the act is a server write with no outbox
    let   mgrValidate = null;      // (who) => refusal text | null, judged on the pad
    let   mgrOnCancel = null;      // called when the pad closes without an approval

    function renderMgrDots() {
      $$('#mgr-dots .mgr-dot').forEach((d, i) => {
        d.classList.toggle('is-filled', i < mgrBuffer.length);
      });
    }

    function closeManagerModal() {
      const abandoned = mgrOnCancel;
      mgrOnCancel = null;
      mgrModal.classList.remove('is-open');
      mgrBuffer = '';
      mgrOnApprove = null;
      mgrBusy = false;
      mgrAuthContext = null;
      mgrNeedsServer = false;
      mgrValidate = null;
      mgrModal.classList.remove('is-error', 'is-needs-connection');
      showMgrNote('');
      $('#mgr-needs').hidden = true;
      $$('#mgr-dots .mgr-dot').forEach(d => d.classList.remove('is-filled', 'is-success'));
      if (typeof abandoned === 'function') { try { abandoned(); } catch (_) {} }
    }

    function showMgrNote(text) {
      const note = $('#mgr-note');
      if (!note) return;
      note.textContent = text || '';
      note.hidden = !text;
    }

    /* opts : voir requireTillOperator (onCancel surtout : une promesse qui attend
       l'approbation doit pouvoir se défaire si le pavé se ferme sans elle). */
    function requireManager(actionLabel, onApprove, authContext, opts) {
      openAuthorization(actionLabel, onApprove, 'manager', authContext, opts);
    }

    /* Design 2027 (§10.2): the act an approval is for, by its act.* key, set
       by the caller on the line before requireManager / requireTillOperator.
       The 2027 pad writes its sub from it; the shipped modal ignores it.
       Consumed by the next opening in the same tick, never later. */
    let nextAuthAct = null;
    function authAct(act) { nextAuthAct = act ? { act, at: Date.now() } : null; }
    window.KiwiAuthAct = authAct;

    /* opts (all optional):
         needsServer · the act's effect is a server write with no outbox (it
                       cannot be replayed later). Offline, no code is taken: the
                       pad opens in its needs-a-connection state, and a code the
                       server could not judge is never approved by the offline
                       verifier. Nothing retries by itself.
         validate    · (who) => refusal text | null. Judges WHO the code proved,
                       on the pad, before it closes.
         hint        · replaces the line under the keys.
         onCancel    · called when the pad closes without an approval. */
    function requireTillOperator(actionLabel, onApprove, opts) {
      openAuthorization(actionLabel, onApprove, 'till', null, opts);
    }
    window.KiwiAuthorizeTillAction = requireTillOperator;

    const TILL_NEEDS_SERVER = Object.freeze({ needsServer: true });

    /* « Définitivement hors ligne » seulement : navigator.onLine === true ne
       prouve rien, c'est pourquoi le vérificateur refuse aussi, de son côté, de
       laisser le repli hors ligne approuver un acte qui exige le serveur. */
    function tillReachable() {
      try { return navigator.onLine !== false; } catch (_) { return true; }
    }

    function showNeedsConnection() {
      mgrBuffer = '';
      mgrBusy = false;
      mgrModal.classList.remove('is-error');
      mgrModal.classList.add('is-needs-connection');
      showMgrNote('');
      $$('#mgr-dots .mgr-dot').forEach(d => d.classList.remove('is-filled', 'is-success'));
      $('#mgr-needs').hidden = false;
    }

    function openAuthorization(actionLabel, onApprove, access, authContext, opts) {
      const act = nextAuthAct && Date.now() - nextAuthAct.at < 1000 ? nextAuthAct.act : null;
      nextAuthAct = null;
      /* kiwiSkin2027:till · the approval on the kit's pad (assets/kit/till-pin.js).
         Every approval, at both levels, joins the authorization log with the
         identity, the verdict and, for a verdict read from a row, provenAt. */
      if (window.KiwiTillPin && typeof window.KiwiTillPin.approve === 'function') {
        window.KiwiTillPin.approve({
          level: access === 'till' ? 'till' : 'manager', act, label: actionLabel,
          onApprove, onCancel: opts && opts.onCancel, needsServer: !!(opts && opts.needsServer),
          authContext: authContext || null, incoming: opts && opts.incoming, validate: opts && opts.validate,
          log: (e) => authorizations.push({ id: 'auth-' + Date.now(), time: new Date(), action: e.label, level: e.level,
            who: { id: e.id, name: e.name, role: e.role }, verdict: e.verdict, provenAt: e.provenAt }),
        });
        return;
      }
      if (typeof mgrOnCancel === 'function') { const abandoned = mgrOnCancel; mgrOnCancel = null; try { abandoned(); } catch (_) {} }
      mgrBuffer = '';
      mgrBusy = false;
      mgrAccess = access === 'till' ? 'till' : 'manager';
      mgrAuthContext = authContext || null;
      mgrOnApprove = typeof onApprove === 'function' ? onApprove : null;
      mgrNeedsServer = !!(opts && opts.needsServer);
      mgrValidate = opts && typeof opts.validate === 'function' ? opts.validate : null;
      mgrOnCancel = opts && typeof opts.onCancel === 'function' ? opts.onCancel : null;
      mgrModal.classList.remove('is-error', 'is-needs-connection');
      showMgrNote('');
      $('#mgr-needs').hidden = true;
      $('#manager-modal-title').textContent = mgrAccess === 'till' ? 'Autorisation caisse' : 'Autorisation manager';
      $('#manager-modal-sub').textContent = actionLabel || 'Action à autoriser';
      $$('#mgr-dots .mgr-dot').forEach(d => d.classList.remove('is-filled', 'is-success'));
      mgrModal.classList.add('is-open');
      const hint = mgrModal.querySelector('.mgr-hint');
      if (hint) {
        let demo = true;
        try { demo = !(window.KiwiEnv?.isReal?.() || window.KiwiCaissePairing?.isPaired?.()); } catch (_) {}
        hint.textContent = (opts && opts.hint) || (demo ? 'Démo locale · n’importe quel code' : (mgrAccess === 'till'
          ? 'Code caissier, manager ou propriétaire requis'
          : 'Code manager ou propriétaire requis'));
      }
      if (mgrNeedsServer && !tillReachable()) showNeedsConnection();
      if (window.lucide) lucide.createIcons();
    }

    /* Le verdict vient du serveur (assets/caisse-pairing.js › verifyCode), donc
       il ARRIVE : la caisse ne détient plus les codes et ne peut plus trancher
       elle-même. Toujours une promesse, y compris en démo locale, pour que
       l'appelant n'ait qu'un seul chemin à gérer. */
    function managerCodeValid(code) {
      let protectedTill = false;
      try { protectedTill = !!(window.KiwiEnv?.isReal?.() || window.KiwiCaissePairing?.isPaired?.()); } catch (_) {}
      if (!protectedTill) return Promise.resolve(true);
      const P = window.KiwiCaissePairing;
      const ask = mgrAccess === 'till' ? P?.authorizeTill : P?.authorizeManager;
      if (typeof ask !== 'function') return Promise.resolve(false);
      /* authorizeTill takes `{ needsServer }` as its second argument,
         authorizeManager takes the action context. */
      const second = mgrAccess === 'till' ? { needsServer: mgrNeedsServer } : mgrAuthContext;
      try { return Promise.resolve(ask.call(P, code, second)).then((ok) => ok === true, () => false); }
      catch (_) { return Promise.resolve(false); }
    }

    function mgrPushDigit(v) {
      if (mgrBusy || mgrBuffer.length >= 4) return;
      /* No keys in the needs-a-connection state, on screen or on a keyboard. */
      if (mgrModal.classList.contains('is-needs-connection')) return;
      if (!mgrBuffer.length) showMgrNote('');
      mgrBuffer += v;
      renderMgrDots();
      if (mgrBuffer.length === 4) {
        /* La vérification part sur le réseau : on VERROUILLE le pavé le temps de
           la réponse, sinon un cinquième chiffre frappé pendant l'aller-retour
           repartait sur une seconde vérification et le refus de la première
           effaçait un tampon qui n'était déjà plus le sien. */
        mgrBusy = true;
        const attempt = mgrBuffer;
        managerCodeValid(attempt).then((valid) => {
          if (attempt !== mgrBuffer) return;   // annulé / rouvert entre-temps
          if (!valid && mgrNeedsServer && window.KiwiCaissePairing?.lastVerifyState?.().offline) {
            /* Le serveur n'a pas pu juger le code et l'acte exige le serveur :
               on n'approuve pas, on le dit. Aucun code n'est gardé. */
            showNeedsConnection();
            return;
          }
          if (valid && mgrValidate) {
            const refusal = mgrValidate(mgrVerifiedIdentity());
            if (refusal) {
              /* Le serveur a répondu oui, mais pas pour la bonne personne : le
                 refus se lit ICI, sur le pavé, avant qu'il se ferme. */
              mgrModal.classList.add('is-error');
              showMgrNote(refusal);
              nativeHapticDanger();
              setTimeout(() => {
                mgrModal.classList.remove('is-error');
                mgrBuffer = ''; mgrBusy = false; renderMgrDots();
              }, 520);
              return;
            }
          }
          if (!valid) {
            mgrModal.classList.add('is-error');
            toast((mgrAccess === 'till' ? 'Code caisse' : 'Code manager') + ' incorrect ou impossible à vérifier');
            setTimeout(() => {
              mgrModal.classList.remove('is-error');
              mgrBuffer = ''; mgrBusy = false; renderMgrDots();
            }, 520);
            return;
          }
          mgrApprove();
        });
      }
    }

    /* Qui le code vient de prouver (jamais le code). */
    function mgrVerifiedIdentity() {
      const P = window.KiwiCaissePairing;
      return (mgrAccess === 'till' ? (P?.lastOperator?.() || P?.lastManager?.()) : P?.lastManager?.())
        || (window.KiwiStaff ? { id: window.KiwiStaff.id || 'till', name: window.KiwiStaff.name || 'Caissier', role: window.KiwiStaff.role || 'Caissier' } : null)
        || (currentCashier ? { id: currentCashier.id, name: currentCashier.name, role: currentCashier.role } : null)
        || { id: 'till', name: 'Caissier', role: 'Caissier' };
    }

    /* Le code est bon : la chorégraphie de succès puis l'action autorisée. */
    function mgrApprove() {
      mgrBusy = true;
      const action  = $('#manager-modal-sub').textContent;
      const approve = mgrOnApprove;
      const verified = mgrVerifiedIdentity();
      // Success beat · dots pop left → right, mirroring the access PIN.
      $$('#mgr-dots .mgr-dot').forEach((d, i) => {
        setTimeout(() => d.classList.add('is-success'), i * 70);
      });
      mgrOnCancel = null;   // approved: closing the pad is not an abandonment
      setTimeout(() => {
        if (mgrAccess === 'manager') authorizations.push({ id: 'auth-' + Date.now(), time: new Date(), action: action });
        closeManagerModal();
        if (approve) approve(verified);
      }, 520);
    }

    $('#mgr-pad').addEventListener('click', (e) => {
      const key = e.target.closest('.mgr-key');
      if (!key || key.classList.contains('is-spare')) return;
      const v = key.dataset.mgr;
      if (v === 'back') {
        if (mgrBusy) return;
        mgrBuffer = mgrBuffer.slice(0, -1);
        renderMgrDots();
        return;
      }
      mgrPushDigit(v);
    });
    $('#manager-cancel').addEventListener('click', closeManagerModal);
    /* « Réessayer » ne fait qu'une chose : revérifier la connexion, à la demande
       de la personne. Il ne rejoue jamais un code et n'approuve rien ; si le
       réseau est revenu, le pavé reparaît vide, il faut retaper le code. */
    $('#mgr-needs-retry').addEventListener('click', () => {
      if (!tillReachable()) { toast('Toujours sans connexion · rien n’a changé'); return; }
      mgrModal.classList.remove('is-needs-connection');
      $('#mgr-needs').hidden = true;
      mgrBuffer = ''; mgrBusy = false; renderMgrDots();
    });
    mgrModal.addEventListener('click', (e) => {
      if (e.target === mgrModal) closeManagerModal();
    });
    window.addEventListener('keydown', (e) => {
      if (!mgrModal.classList.contains('is-open') || mgrBusy) return;
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        mgrPushDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (mgrBuffer.length > 0) {
          mgrBuffer = mgrBuffer.slice(0, -1);
          renderMgrDots();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeManagerModal();
      }
    });

    window.requireManager = requireManager;

    /* ===========================================================
       ATTENDANCE CODE · short-lived code generated by the caisse
       =========================================================== */
    let attendanceCodeTimer = null;
    let attendanceCodeExpires = 0;
    function renderAttendanceHistory(entries) {
      const host = $('#attendance-code-history');
      if (!host) return;
      const rows = (Array.isArray(entries) ? entries : []).slice(0, 5);
      host.innerHTML = rows.length ? `
        <div class="team-section-label">Derniers pointages</div>
        ${rows.map((entry) => {
          const arrival = entry.inTs ? new Date(entry.inTs).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }) : '·';
          const departure = entry.outTs ? new Date(entry.outTs).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }) : 'En service';
          /* Envoyé plus tard depuis le téléphone : délai déclaré visible pour le gérant. */
          const ms = Math.max(Number(entry.inDeferredMs) || 0, Number(entry.outDeferredMs) || 0);
          const total = Math.max(1, Math.round(ms / 60000)), h = Math.floor(total / 60), m = total % 60;
          const lang = String(document.documentElement.lang || 'fr').slice(0, 2);
          const note = !ms ? '' : lang === 'ar' ? `أُرسل لاحقاً من الهاتف · التأخير المصرَّح به ${h ? `${h} س ${m} د` : `${m} د`}`
            : lang === 'en' ? `Sent later from the phone · declared delay ${h ? `${h} h ${m} min` : `${m} min`}`
            : `Envoyé plus tard depuis le téléphone · délai déclaré ${h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`}`;
          return `<div style="padding:9px 0;border-bottom:1px solid var(--line);font-size:12px;"><div style="display:flex;justify-content:space-between;gap:12px;"><b>${escTeam(entry.name || 'Employé')}</b><span>${arrival} → ${departure}</span></div>${note ? `<div class="team-meta" data-attendance-deferred>${escTeam(note)}</div>` : ''}</div>`;
        }).join('')}` : '<div class="team-meta">Aucun pointage enregistré.</div>';
    }
    function renderAttendanceCodeExpiry() {
      const remaining = Math.max(0, attendanceCodeExpires - Date.now());
      const label = $('#attendance-code-expiry');
      if (!label) return;
      if (!remaining) {
        label.textContent = 'Code expiré · générez-en un nouveau';
        return;
      }
      const seconds = Math.ceil(remaining / 1000);
      label.textContent = `Valide encore ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }
    function generateAttendanceCode() {
      const value = $('#attendance-code-value');
      const button = $('#attendance-code-new');
      value.textContent = '······';
      button.disabled = true;
      fetch('/api/team/live', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ merchant: pairedTeamMerchant(), action: 'generate-attendance-code' }),
      }).then(async (response) => {
        let data = {}; try { data = await response.json(); } catch (_) {}
        if (!response.ok) throw new Error(data.error || 'attendance-code-write-failed');
        value.textContent = String(data.code || '').replace(/(.{3})/, '$1 ');
        attendanceCodeExpires = Number(data.expiresTs) || 0;
        renderAttendanceCodeExpiry();
        if (attendanceCodeTimer) clearInterval(attendanceCodeTimer);
        attendanceCodeTimer = setInterval(renderAttendanceCodeExpiry, 1000);
      }).catch(() => {
        value.textContent = 'Erreur';
        $('#attendance-code-expiry').textContent = 'Code non généré · vérifiez la connexion';
      }).finally(() => { button.disabled = false; });
    }
    function openAttendanceCode() {
      /* kiwiSkin2027:till (étape 4, §10.34) : le code partagé du commerce, sur le
         kit (assets/kit/till-attendance.js), qui ne le remplace plus à
         l'ouverture. */
      if (document.documentElement.hasAttribute('data-k-till') && window.KiwiTillAttendance && window.KiwiTillAttendance.open({
        merchant: pairedTeamMerchant,
        post: (body) => fetch('/api/team/live', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }),
        time: (ts) => { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); },
        venue: () => storeName(),
      })) { pollLiveTeam(); return; }
      $('#attendance-code-modal').classList.add('is-open');
      generateAttendanceCode();
      pollLiveTeam();
    }
    function closeAttendanceCode() {
      $('#attendance-code-modal').classList.remove('is-open');
      if (attendanceCodeTimer) clearInterval(attendanceCodeTimer);
      attendanceCodeTimer = null;
    }
    const attendanceCodeRailTrigger = $('#open-attendance-code');
    if (attendanceCodeRailTrigger) attendanceCodeRailTrigger.addEventListener('click', openAttendanceCode);
    $('#attendance-code-new').addEventListener('click', generateAttendanceCode);
    $('#attendance-code-close').addEventListener('click', closeAttendanceCode);
    $('#attendance-code-modal').addEventListener('click', (event) => {
      if (event.target === $('#attendance-code-modal')) closeAttendanceCode();
    });

    /* ===========================================================
       TEAM DRAWER · list servers, break management, send message
       =========================================================== */
    function activeServerCount() {
      return Object.values(servers).filter(s => s.status === 'on').length;
    }
    function pauseElapsedMn(s) {
      if (!s.breakStart) return 0;
      return Math.floor((Date.now() - s.breakStart) / 60000);
    }
    function updateTeamCount() {
      $('#team-count').textContent = activeServerCount();
    }

    function teamCardHTML(s) {
      const initials = serverInitials(s);
      const isPause = s.status === 'pause';
      const isOff   = s.status === 'off';
      const dotClass = isPause ? 'pause' : (isOff ? 'off' : 'on');
      let meta = '';
      let actions = '';
      if (s.status === 'on') {
        const myTables = Object.entries(tables)
          .filter(([_, t]) => t.server === s.id && t.status !== 'khawya' && t.status !== 'khlass').length;
        // Real roster has no live clock-in yet (no serveur app) → show the role,
        // not a fabricated "depuis 08:12". Demo servers keep their shift time.
        meta = s.since
          ? `En service depuis ${s.since} · ${myTables} table${myTables !== 1 ? 's' : ''} actives`
          : (s.role ? escTeam(s.role) : 'Sur le service');
        actions = `
          <button class="team-btn" data-team-action="message" data-server="${s.id}" title="Envoyer un message">
            <i data-lucide="message-square"></i>
          </button>
          <button class="team-btn danger" data-team-action="start-pause" data-server="${s.id}" title="Donner une pause">
            <i data-lucide="coffee"></i>
          </button>
        `;
      } else if (s.status === 'pause') {
        const mn = pauseElapsedMn(s);
        meta = `<span class="pause-tick">En pause · ${mn} mn</span>`;
        actions = `
          <button class="team-btn" data-team-action="message" data-server="${s.id}" title="Envoyer un message">
            <i data-lucide="message-square"></i>
          </button>
          <button class="team-btn primary" data-team-action="end-pause" data-server="${s.id}" title="Fin de pause">
            <i data-lucide="play"></i>
          </button>
        `;
      } else {
        meta = 'Pas en service · fin de shift';
        actions = `
          <button class="team-btn" data-team-action="message" data-server="${s.id}" title="Envoyer un message" disabled style="opacity:.35;">
            <i data-lucide="message-square"></i>
          </button>
        `;
      }
      return `
        <div class="team-card ${isPause ? 'is-pause' : ''}" data-team-card="${s.id}">
          <span class="team-avatar" style="background:${s.color};">
            ${initials}
            <span class="badge-dot ${dotClass}"></span>
          </span>
          <div class="team-info">
            <div class="team-name">${escTeam(s.name)}</div>
            <div class="team-meta">${meta}</div>
          </div>
          <div class="team-actions">${actions}</div>
        </div>
      `;
    }

    function renderTeamDrawer() {
      const onDuty = Object.values(servers).filter(s => s.status === 'on');
      const onPause = Object.values(servers).filter(s => s.status === 'pause');
      const offDuty = Object.values(servers).filter(s => s.status === 'off');

      let html = '';
      // A real store with no roster: nudge to the dashboard (the brain), not a
      // bare "aucun serveur". Demo always has on-duty servers, so it never shows.
      const emptyMsg = (storeIsReal() && !currentRoster().length)
        ? '<div class="team-empty"><div class="team-empty-t">Aucun membre dans l\'équipe</div><div class="team-empty-s">Ajoutez votre équipe depuis votre tableau de bord · <b>Équipe</b>. Elle apparaîtra ici automatiquement.</div></div>'
        : '<div class="team-meta" style="padding:6px 4px;">Aucun serveur actif.</div>';
      html += `<div class="team-section-label">En service · ${onDuty.length}</div>`;
      html += onDuty.map(teamCardHTML).join('') || emptyMsg;

      if (onPause.length) {
        html += `<div class="team-section-label">En pause · ${onPause.length}</div>`;
        html += onPause.map(teamCardHTML).join('');
      }
      if (offDuty.length) {
        html += `<div class="team-section-label">Pas en service · ${offDuty.length}</div>`;
        html += offDuty.map(teamCardHTML).join('');
      }

      html += `
        <div class="team-broadcast">
          <button id="team-broadcast-all" type="button">
            <i data-lucide="megaphone"></i> Message à toute l'équipe
          </button>
        </div>
      `;
      $('#team-drawer-body').innerHTML = html;
      lucide.createIcons();
      updateTeamCount();
    }

    function openTeamDrawer() {
      renderTeamDrawer();
      $('#team-drawer').classList.add('is-open');
      pollLiveTeam();
    }
    function closeTeamDrawer() {
      $('#team-drawer').classList.remove('is-open');
    }

    $('#open-team').addEventListener('click', openTeamDrawer);
    $('#team-drawer-close').addEventListener('click', closeTeamDrawer);
    $('#team-drawer').addEventListener('click', (e) => {
      if (e.target === $('#team-drawer')) closeTeamDrawer();

      const card = e.target.closest('[data-team-action]');
      if (card) {
        const act = card.dataset.teamAction;
        const sid = card.dataset.server;
        if (act === 'start-pause' || act === 'end-pause') {
          if (card.disabled) return;
          card.disabled = true;
          const pausing = act === 'start-pause';
          const member = servers[sid];
          fetch('/api/team/live', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ merchant: pairedTeamMerchant(), action: pausing ? 'manager-pause' : 'manager-resume', memberId: sid }),
          }).then(async (response) => {
            let data = {}; try { data = await response.json(); } catch (_) {}
            if (!response.ok) throw new Error(data.error || 'pause-write-failed');
            toast(`${member.name} · ${pausing ? 'pause démarrée' : 'fin de pause'}`);
            pollLiveTeam();
          }).catch((error) => {
            toast(error && error.message === 'employee-not-clocked-in'
              ? `${member.name} n'est pas pointé en service`
              : 'Pause non synchronisée · vérifiez la connexion');
          }).finally(() => { card.disabled = false; });
        } else if (act === 'message') {
          openMsgModal(sid);
        }
        return;
      }

      if (e.target.closest('#team-broadcast-all')) {
        openMsgModal('ALL');
      }
    });

    // Live pause-timer ticker
    setInterval(() => {
      if (!$('#team-drawer').classList.contains('is-open')) return;
      $$('[data-team-card]').forEach(card => {
        const s = servers[card.dataset.teamCard];
        if (s && s.status === 'pause') {
          const tick = card.querySelector('.pause-tick');
          if (tick) tick.textContent = `En pause · ${pauseElapsedMn(s)} mn`;
        }
      });
    }, 30000);

    /* ===========================================================
       MESSAGE COMPOSER
       =========================================================== */
    let msgTargetId = null;
    function openMsgModal(targetId) {
      msgTargetId = targetId;
      const isAll = targetId === 'ALL';
      const av = $('#msg-target-avatar');
      const nm = $('#msg-target-name');
      const st = $('#msg-target-status');
      if (isAll) {
        av.textContent = '∀';
        av.style.background = 'var(--ink)';
        nm.textContent = 'Toute l\'équipe';
        /* Singulier pour 0 et 1 : « 1 serveurs en service » ne se dit pas. */
        const n = activeServerCount();
        st.textContent = `· ${n} serveur${n > 1 ? 's' : ''} en service`;
      } else {
        const s = servers[targetId];
        av.textContent = serverInitials(s);
        av.style.background = s.color;
        nm.textContent = s.name;
        st.textContent = s.status === 'on' ? '· En service'
                       : s.status === 'pause' ? `· en pause depuis ${pauseElapsedMn(s)} mn`
                       : '· hors service · il le verra à son pointage';
      }
      $('#msg-input').value = '';
      $('#msg-modal').classList.add('is-open');
      setTimeout(() => $('#msg-input').focus(), 80);
    }
    function closeMsgModal() {
      $('#msg-modal').classList.remove('is-open');
      msgTargetId = null;
    }
    $('#msg-cancel').addEventListener('click', closeMsgModal);
    $('#msg-modal').addEventListener('click', (e) => {
      if (e.target === $('#msg-modal')) closeMsgModal();
      const quick = e.target.closest('[data-msg]');
      if (quick) {
        $('#msg-input').value = quick.dataset.msg;
        $('#msg-input').focus();
      }
    });
    $('#msg-send').addEventListener('click', async () => {
      const text = $('#msg-input').value.trim();
      if (!text) { toast('Écris un message d\'abord'); return; }
      const sentTo = activeServerCount();
      const target = msgTargetId === 'ALL'
        ? `équipe (${sentTo} serveur${sentTo > 1 ? 's' : ''} en service)`
        : servers[msgTargetId].name;
      const button = $('#msg-send');
      button.disabled = true;
      fetch('/api/team/live', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ merchant: pairedTeamMerchant(), action: 'message', target: msgTargetId, text }),
      }).then(async (response) => {
        let data = {}; try { data = await response.json(); } catch (_) {}
        if (!response.ok) throw new Error(data.error || 'message-write-failed');
        toast(`Message envoyé à ${target} ✓`);
        closeMsgModal();
      }).catch(() => { toast('Message non envoyé · vérifiez la connexion'); })
        .finally(() => { button.disabled = false; });
    });

    /* ===========================================================
       REASSIGN SERVER MODAL
       =========================================================== */
    let reassignTableId = null;
    function openReassignModal(tableId) {
      reassignTableId = tableId;
      const t = tables[tableId];
      $('#reassign-table-id').textContent = tableId;

      const html = Object.values(servers)
        .filter(s => s.status !== 'off')
        .map(s => {
          const initials = serverInitials(s);
          const isCurrent = s.id === t.server;
          const badge = s.status === 'on'
            ? '<span class="reassign-opt-badge on">En service</span>'
            : '<span class="reassign-opt-badge pause">En pause</span>';
          const myTables = Object.entries(tables)
            .filter(([_, tt]) => tt.server === s.id && tt.status !== 'khawya' && tt.status !== 'khlass').length;
          return `
            <button class="reassign-opt ${isCurrent ? 'is-current' : ''}" data-reassign="${s.id}" type="button">
              <span class="team-avatar" style="background:${escTeam(s.color)};">${escTeam(initials)}</span>
              <div class="reassign-opt-info">
                <div class="reassign-opt-name">${escTeam(s.name)}${isCurrent ? ' · actuel' : ''}</div>
                <div class="reassign-opt-meta">${myTables} table${myTables !== 1 ? 's' : ''} actives</div>
              </div>
              ${badge}
            </button>
          `;
        }).join('');
      $('#reassign-list').innerHTML = html;
      $('#reassign-modal').classList.add('is-open');
      lucide.createIcons();
    }
    function closeReassignModal() {
      $('#reassign-modal').classList.remove('is-open');
      reassignTableId = null;
    }
    $('#reassign-cancel').addEventListener('click', closeReassignModal);
    $('#reassign-modal').addEventListener('click', (e) => {
      if (e.target === $('#reassign-modal')) closeReassignModal();
      const opt = e.target.closest('[data-reassign]');
      if (opt && reassignTableId) {
        const newSid = opt.dataset.reassign;
        const t = tables[reassignTableId];
        const oldSid = t.server;
        if (newSid === oldSid) { closeReassignModal(); return; }
        t.server = newSid;
        refreshTableNode(reassignTableId);
        if (selectedId === reassignTableId) renderRightPanel(reassignTableId);
        toast(`Table ${reassignTableId} → ${servers[newSid].name}`);
        closeReassignModal();
      }
    });

    /* ===========================================================
       SPLIT BILL · persistence (background / resume / cancel)
       =========================================================== */
    const tableSplits = new Map(); // tableId → { mode, total, parts, paidCount }
    /* One split per takeaway order (key 'new' = the cart not sent yet, 'n<num>'
       = a numbered order). A single global slot let a second takeaway order's
       split overwrite the first one's paid parts, and resumed the first order's
       split onto whichever cart was open. */
    const vrapSplits = new Map();
    function vrapSplitKey(num) { return num == null ? 'new' : 'n' + Number(num); }
    function currentVrapSplit() { return vrapSplits.get(vrapSplitKey(vrapEditingNum)) || null; }

    function splitPaidCount(saved) {
      if (!saved || !Array.isArray(saved.parts)) return 0;
      return saved.parts.filter((part) => part && part.paid === true).length;
    }

    function liveTableSplit(id) {
      const saved = tableSplits.get(id);
      if (!saved) return null;
      const visit = String(phoneSessionOf(id) || tables[id]?.timerSession || '');
      /* A legacy till may have persisted a completed split before markPaid()
         could clear it. A new waiter/phone visit can also reuse this table
         without passing through the cashier's new-table modal. Neither may
         inherit the previous party's paid parts. */
      if (!Array.isArray(saved.parts) || !saved.parts.length
        || splitPaidCount(saved) === saved.parts.length
        || (saved.session && visit && String(saved.session) !== visit)) {
        tableSplits.delete(id);
        try { persistShift(); } catch (_) {}
        return null;
      }
      return saved;
    }

    /* True when the table carries a split with a part still due (the same test
       renderRightPanel uses to hide the ordinary pay button): the whole-bill
       « Encaisser » must stay out of reach. */
    function tableHasOpenSplit(id) {
      const saved = liveTableSplit(id);
      return !!(saved && splitPaidCount(saved) < saved.parts.length);
    }

    function splitRemainingTotal(saved) {
      if (!saved || !Array.isArray(saved.parts)) return 0;
      return money(saved.parts.reduce((sum, part) => sum + (part && !part.paid ? Number(part.amount) || 0 : 0), 0));
    }

    function savedTakeawaySplitFor(order) {
      if (!order) return null;
      const byNum = vrapSplits.get(order.num == null ? 'new' : 'n' + Number(order.num));
      if (byNum) return byNum;
      for (const saved of vrapSplits.values()) {
        if (String(saved.sourceLabel || '') === `À emporter #${order.num}`) return saved;
      }
      return null;
    }

    function saveSplitFlow() {
      if (!splitState.flow) return;
      const saved = {
        mode:      splitState.splitMode,
        total:     splitState.total,
        sourceLines: Array.isArray(splitState.sourceLines)
          ? splitState.sourceLines.slice(0, 40).map(line => ({ ...line })) : [],
        parts:     splitState.flow.parts.map(p => ({
          ...p,
          lines: Array.isArray(p.lines) ? p.lines.map(l => ({ ...l })) : [],
        })),
        paidCount: splitPaidCount(splitState.flow),
        id: String(splitState.flow.id || ''),
        session: String(splitState.flow.session || ''),
        sourceLabel: splitState.sourceLabel || '',
        orderNum: splitState.isVrap && vrapEditingNum != null ? Number(vrapEditingNum) : null,
      };
      if (splitState.isVrap) vrapSplits.set(vrapSplitKey(saved.orderNum), saved);
      else if (splitState.tableId) tableSplits.set(splitState.tableId, saved);
      try { persistShift(); } catch (_) {}
    }

    function loadSplitFlow(tableId) {
      const isVrap = mode === 'vrap';
      const saved = isVrap ? currentVrapSplit() : liveTableSplit(tableId);
      if (!saved) return false;
      const t = isVrap ? null : tables[tableId];
      const currentLines = isVrap
        ? cart.map(c => ({ name: lineLabel(c), qty: c.qty, total: c.price * c.qty }))
        : generateOrder(tableId, t);
      /* The original bill, not the remaining amount or a freshly rendered
         table, belongs on every split receipt. Keep it across backgrounding
         and reloads so a later void can restore the exact bill lines. */
      const sourceLines = Array.isArray(saved.sourceLines) && saved.sourceLines.length
        ? saved.sourceLines : currentLines;
      Object.assign(splitState, {
        tableId: isVrap ? null : tableId,
        isVrap,
        sourceLabel: isVrap ? (vrapEditingNum != null ? ('À emporter #' + vrapEditingNum) : 'À emporter')
          : (saved.sourceLabel || tableId),
        total:     saved.total,
        sourceLines: sourceLines.map(line => ({ ...line })),
        splitMode: saved.mode,
        numParts:  saved.parts.length,
        tipMode:   '0', customTipPct: 0,
        numConvives: saved.parts.length,
        assignments: {},
        flow: {
          id: String(saved.id || ''),
          session: String(saved.session || ''),
          parts: saved.parts.map(p => ({
            ...p,
            lines: Array.isArray(p.lines) ? p.lines.map(l => ({ ...l })) : [],
          })),
          paidCount: splitPaidCount(saved),
        },
      });
      return true;
    }

    function renderRpSplitCard(id) {
      const card = $('#rp-split-card');
      if (!card) return;
      const saved = liveTableSplit(id);
      if (!saved) { card.hidden = true; return; }
      const paidCount = splitPaidCount(saved);
      const remaining = splitRemainingTotal(saved);
      const pct = Math.round((paidCount / saved.parts.length) * 100);
      $('#rp-split-card-sub').textContent =
        `${paidCount} / ${saved.parts.length} parts réglées · ${pct}% · reste ${fmtMAD(remaining)}`;
      $('#rp-split-bar-fill').style.width = pct + '%';
      card.hidden = false;
    }

    /* "Plus tard" · background the split */
    $('#split-flow-close').addEventListener('click', () => {
      saveSplitFlow();
      const t = tables[splitState.tableId];
      if (t && t.status !== 'khlass') {
        t.status = 'bgha-ykhlass';  // backgrounded split → mesa shows Addition
        refreshTableNode(splitState.tableId);
      }
      $('#split-modal').classList.remove('is-open');
      toast('Split en pause · reprends quand tu veux');
      if (selectedId === splitState.tableId) renderRightPanel(selectedId);
    });

    // Patch markSplitPartPaid via wrapper · save on every payment, delete on done
    const _origMarkPaid = markSplitPartPaid;
    markSplitPartPaid = function(partIdx, method) {
      _origMarkPaid(partIdx, method);
      if (splitState.flow.paidCount >= splitState.flow.parts.length) {
        if (splitState.isVrap) vrapSplits.delete(vrapSplitKey(vrapEditingNum));
        else tableSplits.delete(splitState.tableId);
        /* The payment journal was persisted before the final part changed the
           flow. Persist the deletion too, otherwise F5 restores a completed
           split and presents an already-paid note as still due. */
        try { persistShift(); } catch (_) {}
      } else {
        saveSplitFlow();
        if (selectedId === splitState.tableId) renderRpSplitCard(selectedId);
      }
    };

    // Patch openSplitModal · if a saved split exists, jump directly to flow screen
    const _origOpenSplit = openSplitModal;
    openSplitModal = function(tableId) {
      if ((mode === 'vrap' && currentVrapSplit()) || (mode !== 'vrap' && tableSplits.has(tableId))) {
        loadSplitFlow(tableId);
        $('#split-table-label').textContent = splitState.sourceLabel || tableId;
        $('#split-setup').hidden = true;
        $('#split-flow').hidden = false;
        $('#split-all-done').hidden = splitState.flow.paidCount < splitState.flow.parts.length;
        renderSplitFlow();
        $('#split-modal').classList.add('is-open');
        lucide.createIcons();
        return;
      }
      _origOpenSplit(tableId);
    };

    /* This bridge is deliberately table-specific. The shared reprint module
     * authorizes the exact receipt; only the restaurant till can restore its
     * bill snapshot and split progress without creating a second kitchen order. */
    window.KiwiRestaurantReopen = {
      originalTable(entry) {
        return String(entry?.reopenSnapshot?.table || '').trim();
      },
      freeTables(original) {
        return Object.keys(tables).filter(id => {
          const t = tables[id];
          return t && (t.status === 'khawya' || t.status === 'khlass')
            && (!t.timerSession || !phoneSeats.has(tableKey(id)));
        }).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      },
      apply(result, receipt) {
        const snap = receipt && receipt.reopenSnapshot;
        const target = String(result && result.table || '');
        const table = tables[target];
        if (!snap || !table || !result.sessionId || !Array.isArray(snap.lines)
          || !(table.status === 'khawya' || table.status === 'khlass'
            || table.timerSession === result.sessionId
            || (table.reopenSessionId === result.sessionId
              && !(tableOrders[target] || []).length && !(orders[target] || []).length))) return false;
        const saleId = String(receipt.saleId || '');
        const voided = journal.find(row => row && (
          row.id === saleId || row.serverSaleId === saleId
          || window.KiwiLive?.saleIdFor?.(row, currentMerchantSlug()) === saleId));
        if (voided) { voided.voided = true; voided.voidConfirmed = true; voided.voidAuthority = 'sale-cancel'; }
        table.status = 'bgha-ykhlass';
        table.covers = Math.max(1, Number(snap.covers) || 1);
        table.orderNo = String(snap.orderNo || '').trim();
        table.reopenRef = String(result.ref || snap.ref || '').trim();
        table.timerSession = String(result.sessionId);
        delete table.reopenSessionId;
        table.reopenedBill = saleId;
        delete tableClosedAt[tableKey(target)];
        delete orders[target];
        tableOrders[target] = snap.lines.slice(0, 40).map((line, index) => {
          const qty = Math.max(1, Number(line.qty) || 1);
          return { id: 'reopen-' + index, name: String(line.name || 'Article'), qty,
            price: Number(line.total || 0) / qty, sent: true, reopenedBill: true };
        });
        if (snap.split && Array.isArray(snap.split.parts)) {
          const flowId = String(snap.split.id || result.splitFlowId || '');
          const parts = snap.split.parts.map((part, index) => {
            const live = journal.find(row => row && !row.voided && row.split
              && String(row.split.flowId || '') === flowId && Number(row.split.index) === index);
            return { ...part, paid: !!live, payMethod: live ? (live.method === 'card' ? 'carte' : 'cash') : null,
              saleId: live ? live.id : null };
          });
          tableSplits.set(target, { id: flowId, session: String(result.sessionId),
            mode: snap.split.mode || 'egal', total: Number(snap.split.total) || 0,
            sourceLabel: table.reopenRef || tableSaleLabel(target, table.orderNo),
            parts, paidCount: splitPaidCount({ parts }) });
        } else tableSplits.delete(target);
        refreshTableNode(target);
        persistShift();
        openTable(target);
        return true;
      },
    };
    /* End restaurant reopen bridge */

    // Allow backdrop click to background mid-flow (instead of locking)
    // Replace the lock with a save-and-close on the existing handler
    // (The previous listener returned early on flow screen; we add a global capture)
    document.addEventListener('click', (e) => {
      if (e.target === $('#split-modal') && !$('#split-flow').hidden && $('#split-modal').classList.contains('is-open')) {
        // Background the split rather than block
        saveSplitFlow();
        const t = tables[splitState.tableId];
        if (t && t.status !== 'khlass') {
          t.status = 'bgha-ykhlass';  // backgrounded split → mesa shows Addition
          refreshTableNode(splitState.tableId);
        }
        $('#split-modal').classList.remove('is-open');
        toast('Split en pause · reprends quand tu veux');
        if (selectedId === splitState.tableId) renderRightPanel(selectedId);
      }
    }, true);

    /* ===========================================================
       REMISE · manager-gated discount on a table addition
       -----------------------------------------------------------
       Data model, on the table:
         tables[id].discount = {
           kind:   'pct' | 'amount',
           value:  number,   // % when pct, MAD when amount
           amount: number,   // computed MAD cut, rounded, clamped <= gross
           reason: string,
         }
       discountAmountFor(id, gross) recomputes the live cut against the
       current gross so the figure stays correct if the order changes.
       =========================================================== */
    function discountAmountFor(id, gross) {
      const d = tables[id] && tables[id].discount;
      if (!d) return 0;
      let amt = d.kind === 'pct'
        ? Math.round(minor(gross) * (d.value || 0) / 100 + 1e-9) / 100 /* centimes entiers : 5 % de 43 871,10 vaut 2 193,555 */
        : money(d.value || 0);
      return money(Math.max(0, Math.min(amt, money(gross))));
    }

    const remiseModal = $('#remise-modal');
    const remiseState = { target: 'table', tableId: null, gross: 0, kind: 'pct', value: 0, reason: 'Geste commercial' };
    function renderRemiseChips() {
      const values = window.KiwiDiscountPolicy?.percentages() || [5, 10, 15, 20];
      $('#rm-pct-chips').innerHTML = values.map(n => `<button class="rm-pct-chip" data-rm-pct="${n}">${n} %</button>`).join('');
    }
    window.addEventListener('DOMContentLoaded', () => {
      const policy = window.KiwiDiscountPolicy;
      policy?.percentages(); // bind the paired merchant and fetch the owner's server copy
      policy?.subscribe(() => {
        if (!remiseModal.classList.contains('is-open')) return;
        renderRemiseChips();
        $$('#rm-pct-chips .rm-pct-chip').forEach(c => c.classList.toggle('is-active',
          remiseState.kind === 'pct' && Number(c.dataset.rmPct) === remiseState.value));
      });
    });

    function remiseCutPreview() {
      const g = remiseState.gross;
      let cut = remiseState.kind === 'pct'
        ? money(g * (remiseState.value || 0) / 100)
        : money(remiseState.value || 0);
      return money(Math.max(0, Math.min(cut, g)));
    }
    function renderRemisePreview() {
      const pv = $('#rm-preview');
      const cut = remiseCutPreview();
      if (cut <= 0) {
        pv.classList.add('is-empty');
        pv.textContent = "Choisis une remise pour voir l'aperçu.";
        return;
      }
      pv.classList.remove('is-empty');
      const net = remiseState.gross - cut;
      pv.innerHTML =
        `<span class="rm-pv-from mono">Addition ${fmtMAD(remiseState.gross)}</span>`
        + `<span class="rm-pv-arrow">→</span>`
        + `<span class="rm-pv-to mono">${fmtMAD(net)}</span>`
        + `<span class="rm-pv-cut mono">−${fmtMAD(cut)}</span>`;
    }
    function syncRemiseType() {
      $$('#rm-type .rm-type-btn').forEach(b =>
        b.classList.toggle('is-active', b.dataset.rmType === remiseState.kind));
      $('#rm-pct-block').hidden    = remiseState.kind !== 'pct';
      $('#rm-amount-block').hidden = remiseState.kind !== 'amount';
    }
    function openRemiseModal(id) {
      window.KiwiDiscountPolicy?.refresh?.(true); // the owner may have changed the allowed percentages
      // A split in progress locks the addition · finish it first.
      if (typeof tableSplits !== 'undefined' && tableSplits.has(id)) {
        toast("Termine le split d'abord");
        return;
      }
      const lines = generateOrder(id, tables[id]);
      const gross = lines.reduce((s, l) => s + l.total, 0);
      remiseState.target  = 'table';
      remiseState.tableId = id;
      remiseState.gross   = gross;
      const existing = tables[id] && tables[id].discount;
      if (existing) {
        remiseState.kind   = existing.kind || 'pct';
        remiseState.value  = Number(existing.value || 0);
        remiseState.reason = existing.reason || 'Geste commercial';
      } else {
        remiseState.kind   = 'pct';
        remiseState.value  = 0;
        remiseState.reason = 'Geste commercial';
      }
      $('#rm-subtle').innerHTML = `Table ${id} · addition <span class="mono">${fmtMAD(gross)}</span>`;
      renderRemiseChips();
      $('#rm-amount').value = (remiseState.kind === 'amount' && remiseState.value) ? remiseState.value : '';
      $$('#rm-pct-chips .rm-pct-chip').forEach(c => {
        c.classList.toggle('is-active', remiseState.kind === 'pct' && parseFloat(c.dataset.rmPct) === remiseState.value);
      });
      $$('#rm-reasons .rm-reason').forEach(b =>
        b.classList.toggle('is-active', b.dataset.rmReason === remiseState.reason));
      const rmRemoveBtn = $('#rm-remove');
      if (rmRemoveBtn) {
        rmRemoveBtn.hidden = !existing;
        rmRemoveBtn.style.display = existing ? '' : 'none';
      }
      syncRemiseType();
      renderRemisePreview();
      remiseModal.classList.add('is-open');
      if (window.lucide) lucide.createIcons();
    }
    function closeRemiseModal() { remiseModal.classList.remove('is-open'); }

    function applyRemise() {
      const target = remiseState.target;
      const targetTableId = remiseState.tableId;
      const targetKind = remiseState.kind;
      const targetValue = remiseState.value;
      const targetReason = remiseState.reason;
      if (targetKind === 'pct' && window.KiwiDiscountPolicy?.configured() && !window.KiwiDiscountPolicy.allowed(targetValue)) {
        toast('Pourcentage non autorisé · rechargez la remise'); return;
      }
      const cut = remiseCutPreview();
      if (cut <= 0) { toast('Choisis une remise'); return; }

      window.KiwiAuthAct?.(targetKind === 'pct' ? { kind: 'discount', key: 'act.discount.pct', args: { pct: `${targetValue}\u202f%` } } : { kind: 'discount', key: 'act.discount.amount', args: { amount: fmtMAD(cut) } });
      requireManager("Remise sur l'addition", () => {
        if (target === 'vrap') {
          const gross = cart.reduce((s, l) => s + l.price * l.qty, 0);
          let amount = targetKind === 'pct'
            ? money(gross * (targetValue || 0) / 100)
            : money(targetValue || 0);
          amount = money(Math.max(0, Math.min(amount, money(gross))));
          if (amount <= 0) { toast('Remise sans effet'); return; }
          vrapDiscount = {
            kind:   targetKind,
            value:  targetValue,
            amount: amount,
            reason: targetReason,
            actorId: String(window.KiwiCaissePairing?.lastManager?.()?.id || currentCashier?.id || '').slice(0, 96),
            accounted: false,
          };
          closeRemiseModal();
          renderCart();
          toast(`Remise appliquée · −${fmtMAD(amount)}`);
          return;
        }

        const id = targetTableId;
        if (!id || !tables[id]) { closeRemiseModal(); return; }
        const t = tables[id];
        // Re-clamp against the live gross at approval time.
        const lines = generateOrder(id, t);
        const gross = lines.reduce((s, l) => s + l.total, 0);
        let amount = targetKind === 'pct'
          ? money(gross * (targetValue || 0) / 100)
          : money(targetValue || 0);
        amount = money(Math.max(0, Math.min(amount, money(gross))));
        if (amount <= 0) { toast('Remise sans effet'); return; }
        t.discount = {
          kind:   targetKind,
          value:  targetValue,
          amount: amount,
          reason: targetReason,
          actorId: String(window.KiwiCaissePairing?.lastManager?.()?.id || currentCashier?.id || '').slice(0, 96),
          accounted: false,
        };
        closeRemiseModal();
        if (selectedId === id) renderRightPanel(id);
        refreshTableNode(id);
        toast(`Remise appliquée · −${fmtMAD(amount)}`);
      });
    }

    function removeRemise() {
      const target = remiseState.target;
      const targetTableId = remiseState.tableId;
      if (target === 'vrap') {
        vrapDiscount = null;
        closeRemiseModal();
        renderCart();
        toast('Remise supprimée');
        return;
      }
      const id = targetTableId;
      if (id && tables[id]) {
        delete tables[id].discount;
        closeRemiseModal();
        if (selectedId === id) renderRightPanel(id);
        refreshTableNode(id);
        toast('Remise supprimée');
      } else {
        closeRemiseModal();
      }
    }

    remiseModal.addEventListener('click', (e) => {
      if (e.target === remiseModal) { closeRemiseModal(); return; }
      const typeBtn = e.target.closest('[data-rm-type]');
      if (typeBtn) {
        remiseState.kind = typeBtn.dataset.rmType;
        // Reset the value when switching modes so stale figures don't carry over.
        if (remiseState.kind === 'pct') {
          remiseState.value = 0;
          $$('#rm-pct-chips .rm-pct-chip').forEach(c => c.classList.remove('is-active'));
        } else {
          remiseState.value = parseFloat($('#rm-amount').value) || 0;
        }
        syncRemiseType();
        renderRemisePreview();
        return;
      }
      const pctChip = e.target.closest('[data-rm-pct]');
      if (pctChip) {
        const next = parseFloat(pctChip.dataset.rmPct) || 0;
        if (window.KiwiDiscountPolicy?.configured() && !window.KiwiDiscountPolicy.allowed(next)) {
          toast('Pourcentage non autorisé'); return;
        }
        remiseState.value = next;
        $$('#rm-pct-chips .rm-pct-chip').forEach(c => c.classList.toggle('is-active', c === pctChip));
        renderRemisePreview();
        return;
      }
      const reasonBtn = e.target.closest('[data-rm-reason]');
      if (reasonBtn) {
        remiseState.reason = reasonBtn.dataset.rmReason;
        $$('#rm-reasons .rm-reason').forEach(b => b.classList.toggle('is-active', b === reasonBtn));
        return;
      }
      if (e.target.closest('#rm-cancel'))  { closeRemiseModal(); return; }
      if (e.target.closest('#rm-remove'))  { removeRemise(); return; }
      if (e.target.closest('#rm-confirm')) { applyRemise(); return; }
    });
    $('#rm-amount').addEventListener('input', () => {
      if (remiseState.kind === 'amount') {
        remiseState.value = parseFloat($('#rm-amount').value) || 0;
        renderRemisePreview();
      }
    });

    /* ===========================================================
       REMBOURSEMENT · manager-gated refund of a past transaction
       -----------------------------------------------------------
       The cashier picks a sale from the day's journal and refunds
       it (full or partial) with a reason. The refund is recorded as
       a NEW journal entry with a NEGATIVE amount and kind:'refund' ·
       so journalTotals() (revenue / card / cash) and every reader
       (renderShiftStats, the Clôture report) reflect it for free.
       The original entry is tagged `refunded = true`.
         journal refund entry = {
           id, time, label:'Remboursement · '+orig.label,
           amount: -refundAmount,   // NEGATIVE
           method: orig.method,     // refunded on the same tender
           ref, kind:'refund', refundOf: orig.ref,
         }
       =========================================================== */
    const refundModal = $('#refund-modal');
    const refundState = { search: '', orig: null, amount: 0, reason: 'Erreur de saisie' };

    function refundApprovalExpiry(entry) {
      try {
        const token = String(entry && entry.refundActor && entry.refundActor.approval || '');
        const raw = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
        if (!raw) return 0;
        const padded = raw + '='.repeat((4 - raw.length % 4) % 4);
        const bytes = Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
        const payload = JSON.parse(new TextDecoder().decode(bytes));
        return Number(payload && payload.exp) || 0;
      } catch (_) { return 0; }
    }
    function refundHasCashException(entry) {
      return !!(entry && (entry.cashHandedOut === true || Number(entry.cashHandedOutAt) > 0
        || entry.refundReconciliation === 'cash-handed-out'));
    }
    function applyAcceptedRefund(entry) {
      if (!entry || entry.refundSyncStatus !== 'accepted' || !entry.refundLedgerReversed) return;
      const amount = money(Math.abs(Number(entry.amount) || 0));
      const original = refundOriginalFor(entry);
      if (original) {
        original.refundedAmount = money(refundedSoFar(original) + amount);
        original.refunded = refundableLeft(original) <= 0;
      }
      shift.refunds = money((shift.refunds || 0) + amount);
      delete entry.refundLedgerReversed;
    }
    function markRejectedRefund(entry, status) {
      if (!entry || entry.kind !== 'refund') return;
      entry.refundSyncStatus = 'rejected';
      entry.refundRejectedStatus = Number(status) || 0;
      entry.refundRejectedAt = Date.now();
      entry.refundSyncNeedsApproval = false;
      /* Keep the rejected negative receipt as evidence. If cash really left the
         drawer, retain that exception instead of rewriting the physical fact. */
      if (refundHasCashException(entry)) {
        entry.refundReconciliation = 'cash-handed-out';
        entry.refundLedgerReversed = false;
        return;
      }
      if (entry.refundLedgerReversed) return;
      const amount = money(Math.abs(Number(entry.amount) || 0));
      const original = refundOriginalFor(entry);
      if (original) {
        original.refundedAmount = money(Math.max(0, refundedSoFar(original) - amount));
        original.refunded = refundableLeft(original) <= 0;
      }
      shift.refunds = money(Math.max(0, (shift.refunds || 0) - amount));
      entry.refundLedgerReversed = true;
    }
    function refundRecoveryCandidates() {
      if (!storeIsReal()) return [];
      return journal.filter((entry) => entry && entry.kind === 'refund' && Number(entry.amount) < 0
        && !entry.voided && !entry.refundSynced && entry.refundSyncStatus !== 'rejected'
        && (entry.refundSyncNeedsApproval || refundApprovalExpiry(entry) <= Date.now() + 30000));
    }
    function renderRefundRecovery() {
      const host = $('#rf-recovery');
      if (!host) return;
      const rows = refundRecoveryCandidates();
      host.hidden = rows.length === 0;
      if (!rows.length) { host.innerHTML = ''; return; }
      host.innerHTML = `<div class="rf-recovery-head"><strong>Remboursements à synchroniser</strong>`
        + `<span class="rf-recovery-count mono">${rows.length}</span></div>`
        + `<p>Ils sont déjà déduits de cette caisse, mais pas encore des rapports. Un manager doit confirmer chaque montant.</p>`
        + rows.map((entry) => {
          const original = refundOriginalFor(entry);
          const label = original ? original.label : (entry.refundOf || 'Vente introuvable');
          return `<div class="rf-recovery-row"><span class="rf-recovery-main">`
            + `<b>${escTeam(label)}</b><span>${escTeam(entry.refundOf || '')} · <bdi dir="ltr">−${fmtMAD(Math.abs(Number(entry.amount) || 0))}</bdi></span></span>`
            + `<button type="button" class="ma-btn danger rf-recovery-btn" data-rf-recover="${escTeam(entry.id || entry.ref)}">Autoriser et synchroniser</button></div>`;
        }).join('');
      try { window.KiwiCaisseLang?.apply?.(host); } catch (_) {}
    }

    function recoverRefund(entry) {
      const original = refundOriginalFor(entry);
      if (!original) { toast('Ticket original introuvable · aucune écriture envoyée'); return; }
      const amountCents = Math.abs(Math.round(Number(entry.amount) * 100));
      const originalSaleId = String(original.serverSaleId || window.KiwiLive?.moneyId?.(original) || '');
      const refundServerId = String(entry.serverSaleId || window.KiwiLive?.moneyId?.(entry) || '');
      if (!amountCents || !originalSaleId || !refundServerId) {
        toast('Synchronisation impossible · aucune écriture envoyée'); return;
      }
      window.KiwiAuthAct?.({ kind: 'refund', key: 'act.refund', args: { amount: fmtMAD(amountCents / 100) } });
      requireManager('Synchroniser le remboursement · ' + fmtMAD(amountCents / 100), () => {
        const manager = window.KiwiCaissePairing?.lastManager?.() || {};
        if (!manager.approval) { toast('Autorisation manager non reçue'); return; }
        entry.refundActor = {
          id: String(manager.id || '').slice(0, 96), name: String(manager.name || '').slice(0, 80),
          role: String(manager.role || '').slice(0, 80), approval: String(manager.approval).slice(0, 1400),
        };
        entry.refundSyncNeedsApproval = false;
        entry.refundSyncStatus = 'pending';
        entry.refundRecoveryRequestedAt = Date.now();
        const queued = window.KiwiLive?.postRefund?.(entry, original, manager, { replaceExisting: true }) || null;
        if (queued && queued.id) entry.serverSaleId = queued.id;
        try { persistShift(); } catch (_) {}
        try { saveProvisional(true); } catch (_) {}
        renderRefundRecovery();
        toast(queued && queued.ok !== false
          ? 'Remboursement autorisé · synchronisation en cours'
          : 'Remboursement conservé · synchronisation impossible');
      }, { kind: 'refund', refundId: refundServerId, originalSaleId, amountCents });
    }

    function refundedSoFar(entry) {
      if (!entry) return 0;
      if (entry.refundedAmount != null) return money(Math.max(0, entry.refundedAmount));
      return entry.refunded ? money(entry.amount) : 0;   // legacy full-refund flag
    }
    function refundableLeft(entry) { return money(Math.max(0, money(entry.amount) - refundedSoFar(entry))); }

    function refundOriginalFor(entry) {
      if (!entry || entry.kind !== 'refund') return null;
      const id = String(entry.refundOfId || '').trim();
      if (id) return journal.find((sale) => sale && sale.kind !== 'refund' && sale.id === id) || null;
      /* Legacy refunds kept only the printed ref. It is not a payment ID:
         split parts share it, so never attach an ambiguous old refund to the
         first matching receipt. */
      const ref = String(entry.refundOf || '').trim();
      if (!ref) return null;
      const matches = journal.filter((sale) => {
        if (!sale || sale.kind === 'refund') return false;
        let cloudId = '';
        try { cloudId = String(window.KiwiLive?.saleIdFor?.(sale, currentMerchantSlug()) || ''); } catch (_) {}
        return [sale.ref, sale.id, sale.serverSaleId, cloudId]
          .some((value) => String(value || '').trim() === ref);
      });
      return matches.length === 1 ? matches[0] : null;
    }

    function refundableJournal() {
      // Newest first · only real sales (positive, not already refunded).
      return journal.slice().reverse()
        .filter(e => !e.voided && e.kind !== 'refund' && e.amount > 0);
    }
    function renderRefundList() {
      const q    = refundState.search.trim().toLowerCase();
      const list = refundableJournal().filter(e =>
        !q ||
        e.label.toLowerCase().includes(q) ||
        e.ref.toLowerCase().includes(q) ||
        String(e.amount).includes(q)
      );
      const body = $('#rf-list');
      if (!body) return;
      if (list.length === 0) {
        body.innerHTML = '<div class="rf-empty">Walo, aucune transaction ne correspond.</div>';
        return;
      }
      body.innerHTML = list.map(e => {
        const hh = String(e.time.getHours()).padStart(2, '0');
        const mm = String(e.time.getMinutes()).padStart(2, '0');
        const icon   = e.method === 'cash' ? 'banknote' : 'credit-card';
        const mLabel = e.method === 'cash' ? 'Espèces'  : 'Carte';
        const done   = refundableLeft(e) <= 0;
        return `<button class="rf-entry" data-rf-id="${escTeam(e.id || '')}"${done || !e.id ? ' disabled' : ''}>`
             + `<span class="rf-entry-ic rf-entry-ic--${e.method}"><i data-lucide="${icon}"></i></span>`
             + `<span class="rf-entry-main">`
             +   `<span class="rf-entry-label">${escTeam(e.label)}`
             +     (done ? `<span class="rf-done-tag">remboursé</span>` : '')
             +   `</span>`
             +   `<span class="rf-entry-meta">${hh}:${mm} · ${mLabel} · ${escTeam(e.ref)}</span>`
             + `</span>`
             + `<span class="rf-entry-amount">${fmtMAD(e.amount)}</span>`
             + `</button>`;
      }).join('');
      if (window.lucide) lucide.createIcons();
    }
    function renderRefundPreview() {
      const o  = refundState.orig;
      const pv = $('#rf-preview');
      if (!o) return;
      const amt  = refundState.amount;
      const left = money(refundableLeft(o) - amt);
      pv.innerHTML =
        `<span class="rf-pv-from mono">Vente ${fmtMAD(o.amount)}</span>`
        + `<span class="rf-pv-arrow">→</span>`
        + `<span class="rf-pv-to mono">${left > 0 ? 'Reste ' + fmtMAD(left) : 'Remboursé en entier'}</span>`
        + `<span class="rf-pv-cut mono">−${fmtMAD(amt)}</span>`;
      $('#rf-confirm-label').textContent = 'Rembourser ' + fmtMAD(amt);
    }
    function showRefundStep(step) {
      $('#rf-step-pick').hidden    = step !== 'pick';
      $('#rf-step-confirm').hidden = step !== 'confirm';
    }
    function openRefundConfirm(orig) {
      refundState.orig   = orig;
      refundState.amount = refundableLeft(orig);  // default · remaining refundable amount
      refundState.reason = 'Erreur de saisie';
      const hh = String(orig.time.getHours()).padStart(2, '0');
      const mm = String(orig.time.getMinutes()).padStart(2, '0');
      const icon   = orig.method === 'cash' ? 'banknote' : 'credit-card';
      const mLabel = orig.method === 'cash' ? 'Espèces'  : 'Carte';
      $('#rf-picked').innerHTML =
        `<span class="rf-picked-ic rf-picked-ic--${orig.method}"><i data-lucide="${icon}"></i></span>`
        + `<span class="rf-picked-main">`
        +   `<span class="rf-picked-label">${orig.label}</span>`
        +   `<span class="rf-picked-meta">${hh}:${mm} · ${mLabel} · ${orig.ref}</span>`
        + `</span>`
        + `<span class="rf-picked-amount">${fmtMAD(orig.amount)}</span>`;
      $('#rf-amount').value = String(refundState.amount);
      $('#rf-amount').max   = String(refundableLeft(orig));
      $$('#rf-reasons .rf-reason').forEach(b =>
        b.classList.toggle('is-active', b.dataset.rfReason === 'Erreur de saisie'));
      renderRefundPreview();
      showRefundStep('confirm');
      if (window.lucide) lucide.createIcons();
    }
    function openRefund() {
      if (isFeatureOff('remboursement') || isFeatureOff('refund')) {
        toast('Remboursements désactivés pour cet établissement');
        return;
      }
      refundState.search = '';
      refundState.orig   = null;
      $('#rf-search-input').value = '';
      renderRefundRecovery();
      renderRefundList();
      showRefundStep('pick');
      refundModal.classList.add('is-open');
      if (window.lucide) lucide.createIcons();
      // A hardware keyboard gets the search focused; a touch screen does not
      // get its keyboard thrown over the list it came to scan.
      if (!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) setTimeout(() => { const s = $('#rf-search-input'); if (s) s.focus(); }, 60);
    }
    function closeRefund() { refundModal.classList.remove('is-open'); }

    function clampRefundAmount() {
      const o = refundState.orig;
      if (!o) return;
      let amt = money(parseFloat($('#rf-amount').value) || 0);
      const left = refundableLeft(o);
      amt = left <= 0 ? 0 : Math.max(0.01, Math.min(amt, left));
      refundState.amount = money(amt);
    }
    function confirmRefund() {
      const orig = refundState.orig;
      if (!orig) { showRefundStep('pick'); return; }
      if (refundableLeft(orig) <= 0) { toast('Transaction déjà remboursée'); return; }
      clampRefundAmount();
      const amount = refundState.amount;
      if (amount <= 0) { toast('Saisis un montant'); return; }
      const refundLocalId = 'refund-' + Date.now() + '-' + journal.length;
      const originalSaleId = String(orig.serverSaleId || window.KiwiLive?.moneyId?.(orig) || '');
      const refundServerId = String(window.KiwiLive?.moneyId?.({ id: refundLocalId }) || '');
      window.KiwiAuthAct?.({ kind: 'refund', key: 'act.refund', args: { amount: fmtMAD(amount) } });
      requireManager('Remboursement', () => {
        if (refundableLeft(orig) <= 0) { toast('Transaction déjà remboursée'); return; }
        /* Un autre remboursement du même ticket a pu être accepté pendant la
           validation : le montant validé dépasserait alors ce qui reste. */
        if (Math.round(amount * 100) > Math.round(refundableLeft(orig) * 100)) {
          toast('Le ticket a changé pendant la validation · relancez le remboursement'); return;
        }
        const manager = window.KiwiCaissePairing?.lastManager?.() || {};
        // NEGATIVE journal entry · NOT via recordSale (it rejects amount<=0).
        const entry = {
          id: refundLocalId,
          time: new Date(),
          label: 'Remboursement · ' + orig.label,
          amount: -amount,
          method: orig.method,
          ref: genRef(),
          kind: 'refund',
          refundOf: orig.ref,
          refundOfId: orig.id,
          reason: refundState.reason,
          refundSyncStatus: 'pending',
          refundLedgerReversed: false,
          cashier: (currentCashier && currentCashier.name) || '',
          refundActor: {
            id: String(manager.id || '').slice(0, 96),
            name: String(manager.name || '').slice(0, 80),
            role: String(manager.role || '').slice(0, 80),
            approval: String(manager.approval || '').slice(0, 1400),
          },
          /* Le panier remboursé, quand le ticket d'origine le portait · un
             remboursement partiel n'en reprend pas les lignes (le montant seul
             est vrai), un remboursement total les reprend toutes. */
          lines: (amount === orig.amount && Array.isArray(orig.lines)) ? orig.lines : null,
        };
        /* Un remboursement est un reçu comme un autre : le client repart avec.
           Il porte son propre numéro, la référence du ticket d'origine, et il
           se fige au même titre. */
        attachReceipt(entry);
        window.KiwiTillTenant?.stamp(entry);
        journal.push(entry);
        orig.refundedAmount = money(refundedSoFar(orig) + amount);
        orig.refunded = refundableLeft(orig) <= 0;
        shift.refunds = money(shift.refunds + amount); // positive · Clôture renders it as a row
        lastSaleId = entry.id;
        try { persistShift(); } catch (_) {}
        renderShiftStats();
        /* Un remboursement change le TOTAL. Il passe par son endpoint append-only
           (l'endpoint vente continue de refuser les montants ≤ 0), puis le même
           flux alimente Caisse, Dashboard et God Mode avec le contre-mouvement. */
        let refundQueued = null;
        try {
          refundQueued = window.KiwiLive?.postRefund?.(entry, orig, manager) || null;
          if (refundQueued && refundQueued.id) entry.serverSaleId = refundQueued.id;
        } catch (_) {}
        try { persistShift(); } catch (_) {}
        try { saveProvisional(true); } catch (_) {}
        if ($('#journal-drawer').classList.contains('is-open')) renderJournal();
        refreshOpenReconciliationModals();
        closeRefund();
        if (window.KiwiEnv?.isReal?.() && (!refundQueued || refundQueued.ok === false)) {
          toast('Remboursement enregistré ici · synchronisation à reprendre');
        } else toast('Remboursement · −' + fmtMAD(amount));
      }, { kind: 'refund', refundId: refundServerId, originalSaleId, amountCents: Math.round(amount * 100) });
    }

    refundModal.addEventListener('click', (e) => {
      if (e.target === refundModal) { closeRefund(); return; }
      if (e.target.closest('#rf-cancel') || e.target.closest('#rf-confirm-cancel')) {
        closeRefund(); return;
      }
      if (e.target.closest('#rf-back')) {
        refundState.orig = null;
        renderRefundList();
        showRefundStep('pick');
        if (window.lucide) lucide.createIcons();
        return;
      }
      const reasonBtn = e.target.closest('[data-rf-reason]');
      if (reasonBtn) {
        refundState.reason = reasonBtn.dataset.rfReason;
        $$('#rf-reasons .rf-reason').forEach(b => b.classList.toggle('is-active', b === reasonBtn));
        return;
      }
      const recoveryBtn = e.target.closest('[data-rf-recover]');
      if (recoveryBtn) {
        const refund = journal.find((item) => item && String(item.id || item.ref) === recoveryBtn.dataset.rfRecover);
        if (refund) recoverRefund(refund);
        return;
      }
      if (e.target.closest('#rf-confirm')) { confirmRefund(); return; }
      const entry = e.target.closest('[data-rf-id]');
      if (entry && !entry.disabled) {
        const orig = journal.find(j => j && j.kind !== 'refund' && j.id === entry.dataset.rfId);
        if (orig) openRefundConfirm(orig);
        return;
      }
    });
    $('#rf-search-input').addEventListener('input', (e) => {
      refundState.search = e.target.value;
      renderRefundList();
    });
    $('#rf-amount').addEventListener('input', () => {
      const o = refundState.orig;
      if (!o) return;
      let amt = money(parseFloat($('#rf-amount').value) || 0);
      if (!amt) { refundState.amount = 0; }   // keep preview live while typing
      else      { amt = Math.max(0.01, Math.min(amt, refundableLeft(o))); refundState.amount = money(amt); }
      renderRefundPreview();
    });
    $('#rf-amount').addEventListener('blur', () => {
      if (!refundState.orig) return;
      clampRefundAmount();
      $('#rf-amount').value = String(refundState.amount);
      renderRefundPreview();
    });

    /* ===========================================================
       PASSATION DE CAISSE · cashier shift handover
       -----------------------------------------------------------
       Two cashiers share a business day. At the shift change the
       OUTGOING cashier counts the drawer; the INCOMING cashier
       recounts to verify; only when the two counts agree does the
       handover go through. Both names land on a printable "bon de
       passation" so any end-of-day shortfall is bracketed to the
       right poste · the mutual count IS the control (no manager PIN).
       =========================================================== */
    function cashierInitials(name) {
      return (name || '?').trim().split(/\s+/)
             .map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
    }
    function fmtEcart(e) {
      e = money(e);
      if (e === 0) return '0 MAD';
      return (e > 0 ? '+ ' : '− ') + fmtMAD(Math.abs(e));
    }
    function pad2HO(n) { return String(n).padStart(2, '0'); }

    /* Roll up journal + cash movements for ONE poste (entries since `sinceMs`). */
    function posteRollup(sinceMs) {
      return rollupLedger(sinceMs);
    }

    /* Apply the live cashier identity to the sidebar card. */
    function renderCashierCard() {
      const nameEl = document.querySelector('.cashier-name');
      const roleEl = document.querySelector('.cashier-role');
      if (nameEl) nameEl.textContent = currentCashier.name;
      if (roleEl) roleEl.textContent = currentCashier.role
        + (handovers.length > 0 ? ' · poste ' + (handovers.length + 1) : '');
    }

    /* Stable, read-only operational identity for vertical modules. The PIN is
       deliberately absent: a folio charge carries the named roster member,
       open shift and signed terminal id, never the unlock secret. */
    window.KiwiCaisseContext = Object.freeze({
      current: function () {
        let terminalId = '', merchant = '';
        try { terminalId = String(localStorage.getItem('kiwi:caisse:terminal-id:v1') || '').trim(); } catch (_) {}
        try {
          merchant = String(window.KiwiCloudDoc?.currentSlug?.()
            || window.KiwiLive?.merchant?.()
            || window.KiwiPlatform?.pairedVenue?.()?.merchant
            || '').trim();
        } catch (_) {}
        return {
          merchant,
          terminalId,
          cashierId: cashActorId(currentCashier && currentCashier.id),
          cashierName: String(currentCashier && currentCashier.name || '').slice(0, 100),
          shiftId: shiftOpenedAt ? cashSessionId() : '',
          shiftOpenedAt: shiftOpenedAt ? shiftOpenedAt.getTime() : 0,
        };
      },
    });
    const terminalIdButton = document.getElementById('caisse-terminal-id');
    /* The pill only means something once the till is paired: until then it
       hid a dead control (tap → "must be paired first"). Once paired it shows
       the id's tail so support can read it off the screen. */
    function syncTerminalIdButton() {
      if (!terminalIdButton) return;
      const id = window.KiwiCaisseContext.current().terminalId;
      terminalIdButton.hidden = !id;
      if (id) terminalIdButton.textContent = 'ID · ' + id.slice(-6).toUpperCase();
    }
    try {
      syncTerminalIdButton();
      window.addEventListener('storage', syncTerminalIdButton);
      window.addEventListener('focus', syncTerminalIdButton);
    } catch (_) {}
    if (terminalIdButton) terminalIdButton.addEventListener('click', async () => {
      const id = window.KiwiCaisseContext.current().terminalId;
      if (!id) { toast('Cette caisse doit d’abord être appairée'); return; }
      try { await navigator.clipboard.writeText(id); toast('Identifiant de caisse copié'); }
      catch (_) { window.prompt('Identifiant de cette caisse', id); }
    });

    const handoverModal = $('#handover-modal');
    const handoverState = { expected: 0, counted: 0, incoming: null, verifyCount: 0 };

    function showHandoverStep(step) {
      $('#ho-step-count').hidden  = step !== 'count';
      $('#ho-step-verify').hidden = step !== 'verify';
      $('#ho-step-done').hidden   = step !== 'done';
    }

    /* Step 1 · outgoing cashier's poste recap + drawer reconciliation. */
    function renderHandoverCount(preserveCount = false) {
      const now      = new Date();
      const openedAt = posteOpenedAt || shiftOpenedAt || now;
      const durMin   = Math.max(0, Math.floor((now - openedAt) / 60000));
      const r        = posteRollup(openedAt.getTime());
      handoverState.expected = major(minor(posteOpeningFloat) + r.cashC + r.cashTipsC + r.movesInC - r.movesOutC);

      $('#ho-count-sub').textContent =
        `${currentCashier.name} termine son poste, compte le tiroir.`;

      const recap = [
        ['Poste ouvert à', `${pad2HO(openedAt.getHours())}:${pad2HO(openedAt.getMinutes())}`],
        ['Durée du poste', fmtDur(durMin)],
        ['Transactions',   String(r.txns)],
        ['Encaissé',       fmtMAD(r.revenue)],
      ];
      $('#ho-recap').innerHTML = recap.map(x =>
        `<div class="ho-recap-row"><span class="k">${x[0]}</span><span class="v">${x[1]}</span></div>`
      ).join('');

      const lines = [
        ['Fond du poste',      fmtMAD(posteOpeningFloat), ''],
        ['Espèces encaissées', '+ ' + fmtMAD(r.cash),     ''],
      ];
      if (r.cashTips > 0) lines.push(['Pourboires espèces', '+ ' + fmtMAD(r.cashTips), '']);
      if (r.movesIn  > 0) lines.push(['Entrées de caisse',  '+ ' + fmtMAD(r.movesIn),  '']);
      if (r.movesOut > 0) lines.push(['Sorties de caisse',  '− ' + fmtMAD(r.movesOut), '']);
      lines.push(['Attendu en caisse', fmtMAD(handoverState.expected), 'is-total']);
      $('#ho-recon').innerHTML = lines.map(l =>
        `<div class="ho-recon-line ${l[2]}"><span>${l[0]}</span><span class="mono">${l[1]}</span></div>`
      ).join('');

      if (!preserveCount) {
        const inp = $('#ho-count');
        if (inp) inp.value = '';
      }
      updateHandoverEcart();
    }

    function updateHandoverEcart() {
      const box = $('#ho-ecart'), out = $('#ho-ecart-val'), inp = $('#ho-count');
      if (!box || !out) return;
      box.classList.remove('is-ok', 'is-off');
      const raw = inp ? inp.value : '';
      if (raw === '' || raw == null) { out.textContent = '·'; return; }
      /* Le comptage physique se fait à la pièce : il y a des 5 et des 10
         centimes dans le tiroir. Arrondir au dirham fabriquait jusqu'à 0,50 MAD
         d'écart sur un tiroir pourtant juste · et le caissier repartait chercher
         une erreur qui n'existait pas. On garde le centime. */
      handoverState.counted = money(parseFloat(raw) || 0);
      const ecart = major(minor(handoverState.counted) - minor(handoverState.expected));
      out.textContent = fmtEcart(ecart);
      box.classList.add(Math.abs(ecart) <= 5 ? 'is-ok' : 'is-off');
    }

    /* Step 2 · incoming cashier picker + verification recount. */
    function renderHandoverVerify() {
      const list = CASHIER_ROSTER.filter(c => c.id !== currentCashier.id);
      /* Sans repreneur enregistré, la passation ne peut aboutir : on le dit et on
         indique où ajouter un poste, plutôt que de laisser une liste vide. */
      $('#ho-cashiers').innerHTML = list.length ? list.map(c =>
        `<button class="ho-cashier" data-ho-cashier="${c.id}">`
        + `<span class="ho-cashier-av">${escTeam(cashierInitials(c.name))}</span>`
        + `<span class="ho-cashier-main">`
        +   `<span class="ho-cashier-name">${escTeam(c.name)}</span>`
        +   `<span class="ho-cashier-role">${escTeam(c.role)}</span>`
        + `</span>`
        + `<span class="ho-cashier-tick"><i data-lucide="check-circle-2"></i></span>`
        + `</button>`
      ).join('') : '<div class="ho-empty">Aucun autre poste enregistré sur cette caisse. Ajoutez un caissier depuis le tableau de bord (Équipe) avant de passer la main.</div>';
      if (handoverState.incoming) {
        const card = $(`#ho-cashiers [data-ho-cashier="${handoverState.incoming.id}"]`);
        if (card) card.classList.add('is-active');
      }
      $('#ho-takeover-val').textContent = fmtMAD(handoverState.counted);
      $('#ho-verify').value = '';
      handoverState.verifyCount = 0;
      updateHandoverVerdict();
    }

    function updateHandoverVerdict() {
      const v   = $('#ho-verdict');
      const btn = $('#ho-verify-confirm');
      if (!v || !btn) return;
      v.classList.remove('is-idle', 'is-ok', 'is-warn');
      const raw = $('#ho-verify') ? $('#ho-verify').value : '';
      let icon, msg, cls, enabled = false;
      if (!handoverState.incoming) {
        cls = 'is-idle'; icon = 'info';
        msg = 'Choisis le caissier entrant.';
      } else if (raw === '' || raw == null) {
        cls = 'is-idle'; icon = 'calculator';
        msg = `<b>${escTeam(handoverState.incoming.name)}</b> recompte le tiroir pour vérifier.`;
      } else {
        handoverState.verifyCount = money(parseFloat(raw) || 0);
        if (minor(handoverState.verifyCount) === minor(handoverState.counted)) {
          cls = 'is-ok'; icon = 'shield-check'; enabled = true;
          msg = `Les deux comptes concordent, <b>${fmtMAD(handoverState.counted)}</b>. Caisse vérifiée.`;
        } else {
          cls = 'is-warn'; icon = 'alert-triangle';
          const diff = major(minor(handoverState.verifyCount) - minor(handoverState.counted));
          msg = `Écart de <b>${fmtEcart(diff)}</b> avec le sortant, recomptez ensemble.`;
        }
      }
      v.classList.add(cls);
      v.innerHTML = `<i data-lucide="${icon}"></i><span>${msg}</span>`;
      btn.disabled = !enabled;
      if (window.lucide) lucide.createIcons();
    }

    /* Step 3 · the printable handover slip. */
    function renderHandoverSlip(rec) {
      const d        = new Date(rec.time);
      const opened   = new Date(rec.posteOpenedAt);
      const ecartCls = Math.abs(rec.ecart) <= 5 ? 'is-ok' : 'is-off';
      $('#ho-done-sub').textContent =
        `${rec.toName} reprend la caisse, ${rec.fromName} est dégagé de toute responsabilité sur la suite.`;
      $('#ho-slip').innerHTML =
          `<div class="ho-slip-head">`
        +   `<div class="ho-slip-title">Bon de passation</div>`
        +   `<div class="ho-slip-date">${storeName()} · ${pad2HO(d.getDate())}/${pad2HO(d.getMonth()+1)}/${d.getFullYear()} · ${pad2HO(d.getHours())}:${pad2HO(d.getMinutes())}</div>`
        + `</div>`
        + `<div class="ho-slip-row"><span class="k">Poste ouvert à</span><span class="v mono">${pad2HO(opened.getHours())}:${pad2HO(opened.getMinutes())}</span></div>`
        + `<div class="ho-slip-row"><span class="k">Attendu en caisse</span><span class="v mono">${fmtMAD(rec.expected)}</span></div>`
        + `<div class="ho-slip-row"><span class="k">Espèces comptées</span><span class="v mono">${fmtMAD(rec.counted)}</span></div>`
        + `<div class="ho-slip-ecart ${ecartCls}"><span>Écart constaté</span><span class="mono">${fmtEcart(rec.ecart)}</span></div>`
        + `<div class="ho-slip-row" style="margin-top:8px;"><span class="k">Caisse transmise</span><span class="v mono">${fmtMAD(rec.counted)}</span></div>`
        + `<div class="ho-slip-sign">`
        +   `<div class="ho-slip-sign-col"><div class="ho-slip-sign-name">${rec.fromName}</div><div class="ho-slip-sign-role">Caissier sortant</div></div>`
        +   `<div class="ho-slip-sign-col"><div class="ho-slip-sign-name">${rec.toName}</div><div class="ho-slip-sign-role">Caissier entrant</div></div>`
        + `</div>`;
    }

    function openHandover() {
      if (isFeatureOff('passation')) {
        toast('Passation de caisse désactivée pour cet établissement');
        return;
      }
      handoverState.counted = 0;
      handoverState.incoming = null;
      handoverState.verifyCount = 0;
      renderHandoverCount(false);
      showHandoverStep('count');
      handoverModal.classList.add('is-open');
      if (window.lucide) lucide.createIcons();
      setTimeout(() => { const i = $('#ho-count'); if (i) i.focus(); }, 80);
    }
    function closeHandover() { handoverModal.classList.remove('is-open'); }

    function handoverIdentity(value) {
      return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    /* Qui peut confirmer une passation : le caissier entrant, avec SON code. Le
       pavé l'applique (requireTillOperator › validate) avant de se fermer ;
       confirmHandover la rejoue pour tout appelant qui ne passe pas par le pavé. */
    function handoverApprovalRefusal(who) {
      if (!storeIsReal()) return null;
      const inc = handoverState.incoming;
      if (!who || !who.actorProof) return 'Le caissier entrant doit confirmer avec son code personnel';
      if (!inc || !handoverIdentity(who.name) || handoverIdentity(who.name) !== handoverIdentity(inc.name)) {
        return 'Code différent de celui du caissier entrant';
      }
      return null;
    }

    function confirmHandover(who) {
      const inc = handoverState.incoming;
      if (!inc) { toast('Choisis le caissier entrant'); return; }
      const refusal = handoverApprovalRefusal(who);
      if (refusal) { toast(refusal); return false; }
      if ($('#ho-verify').value === '' ||
          minor(handoverState.verifyCount) !== minor(handoverState.counted)) {
        toast('Les deux comptes doivent concorder'); return false;
      }
      const now = new Date();
      const openedAt = posteOpenedAt || shiftOpenedAt || now;
      const r = posteRollup(openedAt.getTime());
      const freshExpected = major(minor(posteOpeningFloat) + r.cashC + r.cashTipsC + r.movesInC - r.movesOutC);
      handoverState.expected = freshExpected;
      const ecart = major(minor(handoverState.counted) - minor(freshExpected));
      const rec = {
        id: 'ho-' + Date.now(),
        time: now,
        fromName: currentCashier.name,
        toName: inc.name,
        posteOpenedAt: openedAt,
        expected: freshExpected,
        counted: handoverState.counted,
        ecart: ecart,
        confirmedById: (who && who.id) || inc.id,
        confirmedByName: (who && who.name) || inc.name,
      };
      handovers.push(rec);
      emitCashSession({
        sessionId: cashSessionId(), eventType: 'handover',
        expectedCents: minor(rec.expected), countedCents: minor(rec.counted),
        gapCents: minor(rec.ecart), actorId: cashActorId(currentCashier.id),
        counterpartyActorId: cashActorRef((who && who.id) || inc.id), openedAt: shiftOpenedAt.getTime(), occurredAt: now.getTime()
      });
      // The incoming cashier takes the counted drawer over as their float.
      currentCashier    = { id: inc.id, name: inc.name, role: inc.role };
      posteOpenedAt     = now;
      posteOpeningFloat = handoverState.counted;
      renderCashierCard();
      renderHandoverSlip(rec);
      showHandoverStep('done');
      persistShift();
      if (window.lucide) lucide.createIcons();
      toast('Passation enregistrée · ' + inc.name + ' prend la caisse');
      return true;
    }

    /* Operational accounting API exposed for verification and cross-module inspection */
    window.KiwiCaisseAccounting = Object.freeze({
      rollupLedger,
      journalTotals,
      posteRollup,
      handoverGapCents,
      drawerExpected,
      renderHandoverCount,
      confirmHandover,
      renderCloture,
      reconcileVoids,
      refreshOpenReconciliationModals,
    });

    handoverModal.addEventListener('click', (e) => {
      if (e.target === handoverModal)            { closeHandover(); return; }
      if (e.target.closest('#ho-count-cancel'))  { closeHandover(); return; }
      if (e.target.closest('#ho-done-close'))    { closeHandover(); return; }
      /* Le bon de passation est déjà peint dans #ho-slip · c'est la pièce que
         les deux caissiers signent. Il annonçait son envoi à l'imprimante sans
         rien envoyer. Il n'existe pas d'encodeur ESC/POS pour ce format ; on le
         donne donc au pilote du système, qui est de toute façon le bon support
         pour un document qu'on signe à deux. */
      if (e.target.closest('#ho-slip-print')) {
        const slip = document.getElementById('ho-slip');
        const KP = window.KiwiPrinter;
        if (!slip || !KP || !KP.browserPrintHTML) { toast('Impression indisponible sur cet appareil'); return; }
        try {
          Promise.resolve(KP.browserPrintHTML(slip.innerHTML, '80', 'Bon de passation')).then(
            /* Ce chemin est l'impression du système (ou le PDF dans l'app) : rien
               n'est « envoyé à l'imprimante » tant que personne n'a confirmé. */
            (r) => toast(!(r && r.ok) ? 'Impression échouée'
              : r.via === 'pdf' ? 'Bon de passation prêt · imprimer ou partager le PDF'
              : 'Bon de passation ouvert dans l\'impression système'),
            () => toast('Impression échouée')
          );
        } catch (_) { toast('Impression échouée'); }
        return;
      }

      const add = e.target.closest('[data-ho-add]');
      if (add) {
        $('#ho-count').value = (parseFloat($('#ho-count').value) || 0) + parseFloat(add.dataset.hoAdd);
        updateHandoverEcart();
        return;
      }
      const vadd = e.target.closest('[data-ho-vadd]');
      if (vadd) {
        $('#ho-verify').value = (parseFloat($('#ho-verify').value) || 0) + parseFloat(vadd.dataset.hoVadd);
        handoverState.verifyCount = money(parseFloat($('#ho-verify').value) || 0);
        updateHandoverVerdict();
        return;
      }
      if (e.target.closest('#ho-count-next')) {
        if ($('#ho-count').value === '') { toast('Compte le tiroir'); return; }
        updateHandoverEcart();
        renderHandoverVerify();
        showHandoverStep('verify');
        if (window.lucide) lucide.createIcons();
        return;
      }
      if (e.target.closest('#ho-verify-back')) {
        const keep = handoverState.counted;
        renderHandoverCount();
        $('#ho-count').value = keep ? String(keep) : '';
        updateHandoverEcart();
        showHandoverStep('count');
        return;
      }
      if (e.target.closest('#ho-verify-confirm')) {
        const inc = handoverState.incoming;
        if (!inc) { toast('Choisis le caissier entrant'); return; }
        /* Le caissier ENTRANT confirme, personne d'autre : le pavé le dit, et un
           « oui » du serveur pour une autre personne est refusé sur le pavé.
           Sur un vrai commerce la preuve de l'acteur ne vient que du serveur. */
        window.KiwiAuthAct?.({ kind: 'shift_change', key: 'act.shift_change', args: { name: inc.name } });
        requireTillOperator(`Confirmer la passation · code personnel de ${inc.name}`, confirmHandover, {
          needsServer: storeIsReal(),
          incoming: { name: inc.name },
          validate: handoverApprovalRefusal,
          hint: 'Le caissier entrant confirme avec son propre code',
        });
        return;
      }

      const pick = e.target.closest('[data-ho-cashier]');
      if (pick) {
        handoverState.incoming = CASHIER_ROSTER.find(c => c.id === pick.dataset.hoCashier) || null;
        $$('#ho-cashiers .ho-cashier').forEach(b => b.classList.toggle('is-active', b === pick));
        updateHandoverVerdict();
        return;
      }
    });
    $('#ho-count').addEventListener('input', updateHandoverEcart);
    $('#ho-verify').addEventListener('input', () => {
      handoverState.verifyCount = money(parseFloat($('#ho-verify').value) || 0);
      updateHandoverVerdict();
    });

    /* ===========================================================
       RP actions: reassign + split resume/cancel
       =========================================================== */
    document.addEventListener('click', (e) => {
      const act = e.target.closest('[data-action]');
      if (!act) return;
      const name = act.dataset.action;
      if (name === 'reassign-server' && selectedId) {
        openReassignModal(selectedId);
      } else if (name === 'discount') {
        if (mode === 'vrap') {
          openVrapRemise();
        } else if (selectedId) {
          openRemiseModal(selectedId);
        } else {
          toast('Sélectionne une table');
        }
      } else if (name === 'edit-discount') {
        if (mode === 'vrap') {
          openVrapRemise();
        } else if (selectedId) {
          openRemiseModal(selectedId);
        }
      } else if (name === 'remove-table-discount' && selectedId && tables[selectedId]) {
        e.stopPropagation();
        delete tables[selectedId].discount;
        renderRightPanel(selectedId);
        refreshTableNode(selectedId);
        toast('Remise supprimée');
      } else if (name === 'remove-vrap-discount') {
        e.stopPropagation();
        vrapDiscount = null;
        renderCart();
        toast('Remise supprimée');
      } else if (name === 'resume-split' && selectedId) {
        openSplitModal(selectedId);
      } else if (name === 'cancel-split' && selectedId) {
        const pending = tableSplits.get(selectedId);
        if (pending && pending.paidCount > 0) {
          /* Deleting the flow here kept the paid tenders in the ledger but put
             the full bill back on screen, so the remainder could be charged a
             second time. Once money has entered, the split must be completed. */
          toast('Split déjà encaissé en partie · termine les parts restantes');
          return;
        }
        if (!confirm('Annuler le split en cours ?')) return;
        tableSplits.delete(selectedId);
        const t = tables[selectedId];
        if (t && t.status !== 'khlass') {
          t.status = 'bgha-ykhlass';  // split cancelled → mesa stays Addition
          refreshTableNode(selectedId);
        }
        renderRightPanel(selectedId);
        toast('Split annulé');
      }
    });

    /* ---------- Bootstrap menu (vente rapida) ---------- */
    /* La carte du commerçant, avant le premier rendu : le miroir local d'abord
       · instantané, et il marche hors ligne · puis le serveur, qui repeindra si
       le patron a changé quelque chose depuis. */
    try { rebuildCarte(); } catch (_) {}
    renderCatPills();
    renderMenu();
    updateTeamCount();
    renderPinDots();

    /* Trois réveils : maintenant ; à l'appairage, parce que la caisse démarre
       avant de savoir à quel établissement elle appartient ; et au retour sur
       l'onglet, qui est exactement le geste du patron venant de changer un prix
       au bureau et qui repasse au comptoir. */
    try { fetchCarte(true); } catch (_) {}
    window.addEventListener('storage', (e) => {
      if (e && e.key && e.key.indexOf(CARTE_MIRROR) === 0) { try { rebuildCarte(); } catch (_) {} }
    });
    document.addEventListener('kiwi-paired', () => { try { rebuildCarte(); fetchCarte(true); } catch (_) {} });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { try { fetchCarte(false); } catch (_) {} }
    });
    /* Keep an open till aligned with menu edits made on the owner's dashboard
       over the local Wi-Fi. The mirror still serves the last known menu during
       an outage; this poll only replaces it after a successful cloud read. */
    setInterval(() => {
      if (!document.hidden) { try { fetchCarte(false); } catch (_) {} }
    }, 6000);

    /* Les fiches techniques arrivent par un autre document, `costs`, que rien
       n'ouvrait avant la PREMIÈRE vente : c'est inventory-consumption.js qui le
       lisait, au moment d'encaisser. Une caisse sans copie locale (tablette
       neuve, stockage vidé) vendait donc ce premier article avec une copie
       vide, et ne consommait aucun ingrédient. Tant qu'il n'est pas ouvert, le
       relevé toutes les 30 s de caisse-refresh.js (KiwiCloudDoc.pullAll) ne le
       connaît pas non plus. On l'ouvre au démarrage et à chaque appairage :
       get() lit la copie serveur une fois, puis pullAll() la tient à jour. */
    function bindRecipes() {
      try { window.KiwiCost && window.KiwiCost.store && window.KiwiCost.store.get(); } catch (_) {}
    }
    /* cost.js est différé : pendant l'analyse il n'existe pas encore. */
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindRecipes);
    else setTimeout(bindRecipes, 0);
    document.addEventListener('kiwi-paired', bindRecipes);

    /* ===========================================================
       ÉCRAN CUISINE · KDS (kitchen display, full-screen)
       -----------------------------------------------------------
       The dashboard's kitchen screen ported faithfully: an order
       board with the accept / ready flow. Orders move nouvelle →
       Accepter → en préparation → Prête → Historique. À emporter
       orders sent from the bill panel land here as new tickets.
       =========================================================== */
    /* Les sept postes de Café Atlas. Ils restent la vérité de la DÉMO, et d'elle
       seule : chez un vrai commerçant, les postes sont ceux qu'il a déclarés au
       tableau de bord (carteState.stations). */
    const KDS_STATIONS_DEMO = [
      { id: 'cuisson',  name: 'Cuisson chaude', raw: '#1F5D3C' },
      { id: 'salade',   name: 'Salade froide',  raw: '#3FB67A' },
      { id: 'pastry',   name: 'Pâtisserie',     raw: '#D99A2B' },
      { id: 'boissons', name: 'Boissons',       raw: '#3677A6' },
      { id: 'bar',      name: 'Bar cocktails',  raw: '#164A2F' },
      { id: 'bbq',      name: 'Barbecue',       raw: '#C24A2E' },
      { id: 'crepes',   name: 'Crêpes bar',     raw: '#C97A4A' },
    ];
    /* Un café qui n'a rien déclaré n'a pas zéro poste : il en a UN, sa cuisine.
       Lui inventer les sept postes de la démo mettrait sept filtres vides dans
       sa barre ; ne rien lui mettre casserait le filtrage. */
    const KDS_STATION_SOLO = { id: 'cuisson', name: 'Cuisine', raw: STATION_PALETTE[0] };
    try { window.kdsStations = kdsStations; window.KiwiCaisseStations = kdsStations; } catch (_) {}
    /* caisse menu category -> kitchen station · la table de la DÉMO, qui ne
       connaît que les catégories de Café Atlas. */
    const KDS_CAT_STATION = { entrees: 'salade', tajines: 'cuisson', couscous: 'cuisson',
      pastillas: 'cuisson', sandwiches: 'cuisson', boissons: 'boissons', desserts: 'pastry' };

    /* Recipe catalog for the KDS recipe popup. Keyed by dish name (the same
     * string the kitchen ticket renders). Each entry has a yield (portions
     * the listed quantities produce), an ingredients list (qty + name), and
     * a prep one-liner. Used to train new cuisiniers · they tap a dish on
     * a ticket and the recipe appears. */
    /* Recettes de la démo, indexées par le nom des plats de Café Atlas. Chez un
       vrai commerçant aucune clé ne peut correspondre · et si par hasard il
       vendait un « Couscous royal », lui afficher NOTRE recette serait pire que
       de n'en afficher aucune. Les siennes viendront du tableau de bord. */
    const KDS_RECIPES = IS_DEMO ? {
      'Couscous royal': { yield: 1, ingredients: [
        { q: '150 g',  n: 'Semoule fine' },
        { q: '400 ml', n: 'Bouillon de légumes' },
        { q: '180 g',  n: 'Agneau épaule' },
        { q: '150 g',  n: 'Poulet entier' },
        { q: '80 g',   n: 'Carottes' },
        { q: '80 g',   n: 'Courgettes' },
        { q: '60 g',   n: 'Navets' },
        { q: '40 g',   n: 'Pois chiches' },
      ], prep: 'Cuisson vapeur 35-40 min · agneau d\'abord, poulet 15 min plus tard, légumes en couscoussier. Beurre + bouillon sur la semoule au service.' },
      'Tajine kefta œuf': { yield: 1, ingredients: [
        { q: '180 g',  n: 'Viande hachée bœuf' },
        { q: '2 u',    n: 'Œufs' },
        { q: '120 g',  n: 'Tomates concassées' },
        { q: '50 g',   n: 'Oignons hachés' },
        { q: '4 g',    n: 'Persil' },
        { q: '3 g',    n: 'Épices kefta' },
        { q: '10 ml',  n: 'Huile d\'olive' },
      ], prep: 'Boulettes de 25 g, mijotage 12 min dans sauce tomate-épices, œufs cassés en surface 3 min avant service. Couvrir cuvette tajine au service.' },
      'Tajine poulet citron': { yield: 1, ingredients: [
        { q: '200 g',  n: 'Poulet entier (cuisses)' },
        { q: '40 g',   n: 'Citrons confits' },
        { q: '15 g',   n: 'Olives violettes' },
        { q: '40 g',   n: 'Oignons émincés' },
        { q: '3 g',    n: 'Safran (pistils)' },
        { q: '3 g',    n: 'Gingembre' },
        { q: '10 ml',  n: 'Huile d\'olive' },
      ], prep: 'Mariner poulet 20 min (safran + gingembre + ail). Mijoter 35 min, ajouter citrons + olives en fin de cuisson. Réduire sauce 5 min.' },
      'Tajine agneau pruneaux': { yield: 1, ingredients: [
        { q: '220 g',  n: 'Agneau épaule' },
        { q: '80 g',   n: 'Pruneaux dénoyautés' },
        { q: '15 g',   n: 'Amandes effilées' },
        { q: '20 g',   n: 'Sucre' },
        { q: '50 g',   n: 'Oignons' },
        { q: '5 g',    n: 'Cannelle' },
      ], prep: 'Sauter agneau, mijoter 50 min avec oignons + épices. Pruneaux trempés ajoutés 15 min avant fin avec sucre. Amandes grillées au moment du service.' },
      'Pastilla poulet': { yield: 1, ingredients: [
        { q: '3 feuilles', n: 'Brick' },
        { q: '180 g',  n: 'Poulet effiloché' },
        { q: '2 u',    n: 'Œufs' },
        { q: '40 g',   n: 'Amandes grillées' },
        { q: '30 g',   n: 'Beurre fondu' },
        { q: '15 g',   n: 'Sucre glace' },
        { q: '2 g',    n: 'Cannelle' },
      ], prep: 'Cuisson poulet (oignons + safran) 25 min. Brouiller œufs dans le jus. Monter pastilla beurre + amandes, four 8-10 min à 200°C. Saupoudrer sucre + cannelle au service.' },
      'Briouates viande': { yield: 4, ingredients: [
        { q: '8 feuilles', n: 'Brick' },
        { q: '240 g',  n: 'Viande hachée bœuf' },
        { q: '40 g',   n: 'Oignons hachés' },
        { q: '6 g',    n: 'Persil' },
        { q: '4 g',    n: 'Cumin' },
        { q: '20 g',   n: 'Beurre fondu' },
      ], prep: 'Farce viande + oignons + épices 8 min. Pliage triangle classique, badigeonner beurre. Friture 2 min par face dans huile chaude. Servir bien chaud.' },
      'Méchoui': { yield: 1, ingredients: [
        { q: '240 g',  n: 'Agneau épaule' },
        { q: '8 g',    n: 'Beurre rance (smen)' },
        { q: '4 g',    n: 'Cumin' },
        { q: '3 g',    n: 'Sel marin' },
        { q: '2 g',    n: 'Paprika' },
      ], prep: 'Frotter agneau au smen + épices, rôtir 18-22 min à 220°C selon cuisson demandée. Reposer 4 min sous papier alu. Servir avec cumin + sel à part.' },
      'Salade marocaine': { yield: 1, ingredients: [
        { q: '120 g',  n: 'Tomates' },
        { q: '80 g',   n: 'Concombre' },
        { q: '40 g',   n: 'Oignon rouge' },
        { q: '8 g',    n: 'Persil' },
        { q: '8 g',    n: 'Coriandre' },
        { q: '10 ml',  n: 'Huile d\'olive' },
        { q: '5 ml',   n: 'Jus de citron' },
      ], prep: 'Couper tomates + concombre en petits dés (5 mm), oignon finement émincé. Herbes ciselées au dernier moment. Assaisonner juste avant service.' },
      'Caviar d\'aubergine': { yield: 1, ingredients: [
        { q: '180 g',  n: 'Aubergines' },
        { q: '15 ml',  n: 'Huile d\'olive' },
        { q: '6 g',    n: 'Ail haché' },
        { q: '8 g',    n: 'Persil' },
        { q: '5 ml',   n: 'Jus de citron' },
        { q: '2 g',    n: 'Cumin' },
      ], prep: 'Aubergines rôties 25 min à 200°C, chair évidée et écrasée fourchette. Mélanger huile + ail + cumin + citron. Servir frais avec pain.' },
      'Msemen beurre & miel': { yield: 2, ingredients: [
        { q: '140 g',  n: 'Farine T55' },
        { q: '20 g',   n: 'Semoule fine' },
        { q: '90 ml',  n: 'Eau tiède' },
        { q: '3 g',    n: 'Sel' },
        { q: '20 g',   n: 'Beurre' },
        { q: '30 ml',  n: 'Miel' },
      ], prep: 'Pétrir pâte 5 min, repos 20 min. Étaler très fin, pliage 4 fois avec beurre fondu. Cuisson plancha 1 min par face. Servir avec beurre + miel séparément.' },
      'Crêpe complète': { yield: 1, ingredients: [
        { q: '90 g',   n: 'Pâte à crêpe blé noir' },
        { q: '1 u',    n: 'Œuf' },
        { q: '40 g',   n: 'Jambon' },
        { q: '50 g',   n: 'Fromage râpé' },
        { q: '10 g',   n: 'Beurre' },
      ], prep: 'Étaler pâte fine sur bilig 220°C. Casser œuf au centre, parsemer jambon + fromage. Plier en 4 quand le fromage fond. Servir aussitôt.' },
      'Cornes de gazelle': { yield: 6, ingredients: [
        { q: '200 g',  n: 'Amandes en poudre' },
        { q: '100 g',  n: 'Sucre glace' },
        { q: '15 ml',  n: 'Eau de fleur d\'oranger' },
        { q: '150 g',  n: 'Farine T55' },
        { q: '60 g',   n: 'Beurre fondu' },
        { q: '50 ml',  n: 'Eau' },
      ], prep: 'Pâte d\'amande : amandes + sucre + fleur d\'oranger. Pâte fine étalée, garniture en cornes, soudure pincée. Cuisson 12 min à 170°C, blanches.' },
      'Sandwich kefta': { yield: 1, ingredients: [
        { q: '1 u',    n: 'Pain rond (kesra)' },
        { q: '150 g',  n: 'Viande hachée bœuf' },
        { q: '40 g',   n: 'Oignons' },
        { q: '30 g',   n: 'Tomates' },
        { q: '5 ml',   n: 'Harissa douce' },
        { q: '4 g',    n: 'Cumin' },
      ], prep: 'Boulettes plates grillées 4 min par face. Pain tiède ouvert, garnir kefta + tomates + oignons. Filet harissa selon goût.' },
      'Thé à la menthe': { yield: 1, ingredients: [
        { q: '4 g',    n: 'Thé vert Gunpowder' },
        { q: '15 g',   n: 'Menthe fraîche' },
        { q: '12 g',   n: 'Sucre' },
        { q: '250 ml', n: 'Eau bouillante' },
      ], prep: 'Rincer thé à l\'eau bouillante 30 s, jeter cette eau. Infuser thé + sucre 3 min, ajouter menthe 2 min. Servir avec hauteur (oxygéner).' },
      'Café noir double': { yield: 1, ingredients: [
        { q: '18 g',   n: 'Café arabica moulu' },
        { q: '60 ml',  n: 'Eau filtrée' },
      ], prep: 'Mouture fine, extraction 25-30 s à 9 bar. Pré-infusion 4 s avant extraction principale. Servir aussitôt en tasse réchauffée.' },
      'Orange pressée': { yield: 1, ingredients: [
        { q: '3 u',    n: 'Oranges fraîches' },
      ], prep: 'Presser à l\'extracteur juste avant service. Ne pas filtrer (pulpe). Servir glacé dans verre 300 ml.' },
      'Limonade traditionnelle': { yield: 1, ingredients: [
        { q: '40 ml',  n: 'Jus de citron frais' },
        { q: '20 g',   n: 'Sucre' },
        { q: '200 ml', n: 'Eau plate fraîche' },
        { q: '3 g',    n: 'Zeste de citron' },
        { q: '4 g',    n: 'Menthe' },
      ], prep: 'Dissoudre sucre dans eau tiède, ajouter jus + zeste. Refroidir avec glaçons. Décorer menthe au service.' },
      'Cocktail mocktail': { yield: 1, ingredients: [
        { q: '60 ml',  n: 'Jus d\'ananas' },
        { q: '40 ml',  n: 'Jus de cranberry' },
        { q: '20 ml',  n: 'Sirop de grenadine' },
        { q: '15 ml',  n: 'Jus de citron vert' },
        { q: '60 ml',  n: 'Eau pétillante' },
      ], prep: 'Shaker tous les jus avec glaçons 12 s. Filtrer dans verre highball glacé. Compléter eau pétillante au sommet. Pailles + rondelle citron.' },
      'Jus d\'orange': { yield: 1, ingredients: [
        { q: '3 u',    n: 'Oranges fraîches' },
      ], prep: 'Presser à l\'extracteur juste avant service. Servir glacé dans verre 300 ml.' },
    } : {};

    const kdsOrders   = [];
    /* La démo reprend sa numérotation là où son board s'arrête. Un vrai café
       ouvert ce matin n'a pas servi 52 commandes : il imprimerait « bon #53 »
       sur son premier ticket. Il commence donc à 1. */
    let   kdsOrderSeq = IS_DEMO ? 52 : 0;
    let   kdsActiveStation = 'all';
    let   kdsHistoryOpen   = false;
    let   kdsTimer = null;
    const kdsEl = $('#kds-screen');

    /* Le board de démonstration. Avant le correctif du passage de main
       (2026-10), une caisse réelle pouvait démarrer en démo puis s'appairer :
       ce board était alors sauvegardé dans le service du VRAI commerçant, et
       sa page « À emporter » proposait d'encaisser une Pastilla à 205 MAD qui
       n'a jamais été commandée. On garde la liste ici pour reconnaître ces
       restes à la reprise du service et les écarter. */
    const KDS_DEMO_SEED = [
      { num: 38, type: 'dineIn', table: '3', status: 'ready', ago: 1880, readyAt: '13:46', items: [
        { q: 2, n: 'Couscous royal', stations: ['cuisson'] }, { q: 2, n: 'Thé à la menthe', stations: ['boissons'] } ] },
      { num: 39, type: 'glovo', code: '2904', status: 'ready', ago: 1645, readyAt: '13:58', items: [
        { q: 1, n: 'Tajine poulet citron', stations: ['cuisson'] }, { q: 1, n: 'Salade marocaine', stations: ['salade'] } ] },
      { num: 40, type: 'dineIn', table: '8', status: 'ready', ago: 1390, readyAt: '14:10', items: [
        { q: 3, n: 'Briouates viande', stations: ['cuisson'] }, { q: 2, n: 'Msemen beurre & miel', stations: ['pastry'] } ] },
      { num: 41, type: 'takeaway', status: 'ready', ago: 1155, readyAt: '14:22', total: 280, items: [
        { q: 2, n: 'Méchoui', p: 120, note: 'bien cuit', stations: ['bbq'] }, { q: 2, n: 'Orange pressée', p: 20, stations: ['boissons'] } ] },
      { num: 42, type: 'dineIn', table: '4', status: 'cooking', ago: 1010, items: [
        { q: 2, n: 'Tajine kefta œuf', note: 'sans coriandre', stations: ['cuisson'] }, { q: 1, n: 'Salade marocaine', stations: ['salade'] }, { q: 3, n: 'Thé à la menthe', stations: ['boissons'] } ] },
      { num: 43, type: 'glovo', code: '3412', status: 'cooking', ago: 742, items: [
        { q: 2, n: 'Tajine poulet citron', stations: ['cuisson'] }, { q: 1, n: 'Cornes de gazelle', stations: ['pastry'] } ] },
      { num: 44, type: 'dineIn', table: '7', status: 'cooking', ago: 620, items: [
        { q: 1, n: 'Couscous royal', stations: ['cuisson'] }, { q: 1, n: 'Pastilla poulet', stations: ['cuisson', 'pastry'] } ] },
      { num: 45, type: 'yassir', code: '8821', status: 'cooking', ago: 388, items: [
        { q: 3, n: 'Tajine kefta œuf', stations: ['cuisson'] }, { q: 2, n: 'Cocktail mocktail', stations: ['bar'] } ] },
      { num: 46, type: 'dineIn', table: '2', status: 'cooking', ago: 256, items: [
        { q: 2, n: 'Crêpe complète', stations: ['crepes'] }, { q: 4, n: 'Café noir double', note: '2 sans sucre', stations: ['boissons'] } ] },
      { num: 47, type: 'dineIn', table: '9', status: 'new', ago: 184, items: [
        { q: 4, n: 'Briouates viande', stations: ['cuisson'] }, { q: 2, n: "Caviar d'aubergine", stations: ['salade'] } ] },
      { num: 48, type: 'glovo', code: '3590', status: 'new', ago: 92, items: [
        { q: 1, n: 'Méchoui', stations: ['bbq'] }, { q: 1, n: 'Limonade traditionnelle', stations: ['boissons'] } ] },
      { num: 49, type: 'dineIn', table: '1', status: 'new', ago: 38, items: [
        { q: 1, n: 'Tajine agneau pruneaux', stations: ['cuisson'] } ] },
      { num: 50, type: 'takeaway', status: 'cooking', ago: 360, total: 130, items: [
        { q: 2, n: 'Sandwich kefta', p: 50, stations: ['cuisson'] }, { q: 2, n: 'Café noir double', p: 15, stations: ['boissons'] } ] },
      { num: 51, type: 'takeaway', status: 'ready', ago: 690, readyAt: '14:30', paid: true, total: 205, items: [
        { q: 1, n: 'Pastilla poulet', p: 145, stations: ['cuisson', 'pastry'] }, { q: 2, n: 'Thé à la menthe', p: 30, note: 'bien chaud svp', stations: ['boissons'] } ] },
      { num: 52, type: 'takeaway', status: 'ready', ago: 1500, readyAt: '14:02', paid: true, pickedUp: true, pickedUpAt: '14:09', total: 230, items: [
        { q: 3, n: 'Briouates viande', p: 65, stations: ['cuisson'] }, { q: 1, n: "Jus d'orange", p: 35, stations: ['boissons'] } ] },
    ];

    const KDS_SVG = {
      clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
      check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg>',
      eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
      note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
      book: '<svg class="kit-recipe-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
      close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    };

    /* ── kiwiSkin2027:till · le board de la caisse sur les couloirs du kit ──
       (assets/kit/kds-board.js, étape 3b). Drapeau éteint, le kit n'est pas
       chargé et rien de ceci ne tourne. Allumé : Nouvelles et En préparation
       sont deux couloirs, l'historique des bons prêts un troisième, dans son
       volet qui défile. Le board reste à la racine de la caisse (16 px) et
       défile comme avant (fit none) ; chaque geste revient ici par son nom
       (kdsAccept, kdsReady, kdsRecall, kdsOpenRecipe). Pas de « servi » ici :
       la remise se constate ailleurs, et un bon remis ne se rappelle pas. */
    let kdsKit = false;

    $('#open-kds').addEventListener('click', openKds);
    $('#kds-close-btn').addEventListener('click', () => {
      // In kitchen-display mode the close button is "Verrouiller" · back to PIN.
      if (document.body.classList.contains('is-kitchen')) { lockoutKitchen(); return; }
      closeKds();
    });
    kdsEl.addEventListener('click', (e) => {
      const st = e.target.closest('[data-kit-st]');
      if (st) { kdsActiveStation = st.dataset.kitSt; kdsPaint(); return; }
      const ht = e.target.closest('[data-kit-history-toggle]');
      if (ht) {
        kdsHistoryOpen = !kdsHistoryOpen;
        $('#kit-history').classList.toggle('open', kdsHistoryOpen);
        $('#kit-history-toggle').classList.toggle('on', kdsHistoryOpen);
        return;
      }
      const eye = e.target.closest('[data-kit-eye]');
      if (eye) { const o = kdsOrders.find(x => x.num === Number(eye.dataset.kitEye)); if (o) kdsOpenZoom(o); return; }
      const rec = e.target.closest('[data-kit-recipe]');
      if (rec) { kdsOpenRecipe(rec.dataset.kitRecipe); return; }
      const acc = e.target.closest('[data-kit-accept]');
      if (acc) { kdsAccept(Number(acc.dataset.kitAccept)); return; }
      const rdy = e.target.closest('[data-kit-ready]');
      if (rdy) { kdsReady(Number(rdy.dataset.kitReady)); return; }
    });

    /* ============================================================
       STOCK & APPROVISIONNEMENT · cashier inventory + supply orders
       ============================================================ */
    const SK_CATS = { legumes:'Légumes', viandes:'Viandes', poissons:'Poisson', boissons:'Boissons', epicerie:'Épicerie', laitiers:'Laitiers', cafe:'Café', consommables:'Conso' };
    const SK_ORD_STATUS = { 'en-attente':['En attente','pending'], 'confirmee':['Confirmée','ok'], 'recue':['Reçue','done'] };

    function skStatusOf(it){ if (it.stock <= 0) return 'out'; if (it.stock <= it.reorder) return 'low'; return 'ok'; }
    function skAlertCount(){ return stockItems.filter(i => skStatusOf(i) !== 'ok').length; }
    function skTotalValue(){ return Math.round(stockItems.reduce((s,i) => s + i.stock * i.cost, 0)); }
    function updateStockBadge(){ const el = $('#stock-alert-count'); if (el){ const n = skAlertCount(); el.textContent = n; el.classList.toggle('warn', n > 0); } }

    function renderStock(){
      $$('#sk-tabs .sk-tab').forEach(t => t.classList.toggle('on', t.dataset.skTab === stockTab));
      const body = $('#sk-body');
      if      (stockTab === 'apercu')     body.innerHTML = renderSkApercu();
      else if (stockTab === 'articles')   body.innerHTML = renderSkArticles();
      else if (stockTab === 'appro')      body.innerHTML = renderSkAppro();
      else if (stockTab === 'inventaire') body.innerHTML = renderSkInventaire();
      updateStockBadge();
      if (window.lucide) lucide.createIcons();
    }

    function renderSkApercu(){
      const alerts = stockItems.filter(i => skStatusOf(i) !== 'ok')
        .sort((a,b) => (skStatusOf(a)==='out'?0:1) - (skStatusOf(b)==='out'?0:1));
      const out = stockItems.filter(i => skStatusOf(i)==='out').length;
      const next = supplyOrders.find(o => o.status !== 'recue');
      const kpis = `<div class="sk-kpis">
        <div class="sk-kpi"><div class="sk-kpi-l">Valeur du stock<span class="sk-kpi-ico"><i data-lucide="wallet"></i></span></div><div class="sk-kpi-v">${fmtMAD(skTotalValue())}</div><div class="sk-kpi-sub">${stockItems.length} articles suivis</div></div>
        <div class="sk-kpi"><div class="sk-kpi-l">En alerte<span class="sk-kpi-ico ${alerts.length?'warn':'ok'}"><i data-lucide="alert-triangle"></i></span></div><div class="sk-kpi-v ${alerts.length?'warn':''}">${alerts.length}</div><div class="sk-kpi-sub">${out} en rupture</div></div>
        <div class="sk-kpi"><div class="sk-kpi-l">Prochaine livraison<span class="sk-kpi-ico"><i data-lucide="truck"></i></span></div><div class="sk-kpi-v" style="font-size:19px">${next ? next.when : '·'}</div><div class="sk-kpi-sub">${next ? kdsEsc(next.supplier) : 'Aucune commande active'}</div></div>
        <div class="sk-kpi"><div class="sk-kpi-l">Fournisseurs<span class="sk-kpi-ico"><i data-lucide="contact"></i></span></div><div class="sk-kpi-v">${suppliers.length}</div><div class="sk-kpi-sub">actifs</div></div>
      </div>`;
      const quickActs = `<div class="sk-quick-acts" style="display:flex;gap:10px;margin-bottom:18px;">
        <button class="ma-btn primary" data-sk-newwaste style="background:#dc2626;border-color:#b91c1c;padding:12px 18px;font-size:14px;border-radius:12px;font-weight:600;"><i data-lucide="trash-2"></i>Déclarer une perte</button>
        <button class="ma-btn secondary" id="sk-apercu-recept-btn" data-sk-recept-act style="padding:12px 18px;font-size:14px;border-radius:12px;font-weight:600;"><i data-lucide="scan-line"></i>Réceptionner du stock</button>
      </div>`;
      const list = alerts.length
        ? `<div class="sk-section"><div class="sk-section-head"><h3>Alertes stock</h3><span class="sk-badge warn">${alerts.length}</span></div><div class="sk-alerts">${alerts.map(it=>{
            const st = skStatusOf(it);
            return `<div class="sk-alert ${st}"><div class="sk-alert-ico"><i data-lucide="${st==='out'?'x-octagon':'alert-triangle'}"></i></div>
              <div class="sk-alert-body"><div class="sk-alert-top"><span class="sk-alert-name">${kdsEsc(it.name)}</span><span class="sk-alert-cat">${SK_CATS[it.cat]||it.cat}</span><span class="sk-alert-status ${st}">${st==='out'?'Rupture':'Bas'}</span></div>
              <div class="sk-alert-meta">${it.stock} ${it.unit} en stock · niveau par ${it.par} ${it.unit} · ${kdsEsc(it.supplier)}</div></div>
              <div style="display:flex;gap:6px;">
                <button class="ma-btn secondary sk-mini" data-sk-waste="${it.id}" style="color:#b91c1c;"><i data-lucide="trash-2"></i>Perte</button>
                <button class="ma-btn primary sk-mini" data-sk-order="${it.id}"><i data-lucide="truck"></i>Commander</button>
              </div></div>`;
          }).join('')}</div></div>`
        : `<div class="sk-section"><div class="sk-empty"><i data-lucide="check-circle-2"></i>Tout est au niveau, aucune alerte.</div></div>`;

      // Dernières pertes (20 plus récentes, journée commerciale d'abord)
      const recentWaste = (function(){
        const I = window.KiwiInventory;
        if (!I || !I.history) return [];
        const rows = (I.history() || []).filter(r => r && (r.refType === 'waste' || ['loss','expiry','gift','staff-meal'].includes(r.reason)));
        const curDay = (window.KiwiDayReport && window.KiwiDayReport.businessDay) ? window.KiwiDayReport.businessDay(Date.now()) : '';
        return rows.slice(0, 20).map(r => {
          const it = stockItems.find(i => i.id === r.itemId) || { name: r.itemId, unit: 'unité', cost: r.unitCost || 0 };
          const rDay = (window.KiwiDayReport && window.KiwiDayReport.businessDay) ? window.KiwiDayReport.businessDay(r.occurredTs) : '';
          const isToday = curDay && rDay === curDay;
          const cost = r.unitCost != null ? r.unitCost : (it.cost || 0);
          const valMAD = Math.abs(r.qty) * cost;
          const reasonLabel = (function(why){
            if (why === 'perime' || r.reason === 'expiry') return 'Périmé';
            if (why === 'casse') return 'Casse';
            if (why === 'avarie') return 'Avarié / Abîmé';
            if (why === 'offert' || r.reason === 'gift') return 'Offert';
            if (why === 'repas-equipe' || r.reason === 'staff-meal') return 'Repas équipe';
            return 'Autre perte';
          })(r.meta && r.meta.wasteReason);
          return {
            id: r.id,
            itemId: r.itemId,
            name: it.name,
            qty: Math.abs(r.qty),
            unit: it.unit,
            valMAD: valMAD,
            actor: r.actor || (r.meta && r.meta.actor) || 'Caissier',
            reason: reasonLabel,
            note: r.note || '',
            ts: r.occurredTs,
            isToday: isToday
          };
        });
      })();

      const wasteSection = recentWaste.length ? `
        <div class="sk-section" style="margin-top:20px;">
          <div class="sk-section-head">
            <h3>Dernières pertes</h3>
            <span class="sk-badge" style="background:rgba(220,38,38,0.1);color:#991b1b;">${recentWaste.length}</span>
          </div>
          <div class="sk-tbl-wrap">
            <table class="sk-tbl">
              <thead><tr><th>Date &amp; heure</th><th>Article</th><th>Quantité</th><th>Motif</th><th>Valeur</th><th>Employé</th></tr></thead>
              <tbody>
                ${recentWaste.map(w => {
                  const d = new Date(w.ts);
                  const timeStr = (w.isToday ? "Aujourd'hui " : (d.toLocaleDateString('fr-FR') + ' ')) + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                  return `<tr>
                    <td class="sk-mono" style="font-size:12px;color:var(--n-600);">${timeStr}</td>
                    <td><div class="sk-cell-name">${kdsEsc(w.name)}</div>${w.note ? `<div class="sk-cell-sub">${kdsEsc(w.note)}</div>` : ''}</td>
                    <td class="sk-mono" style="color:#b91c1c;font-weight:600;">−${w.qty} ${kdsEsc(w.unit)}</td>
                    <td><span class="sk-badge warn" style="font-size:11px;">${kdsEsc(w.reason)}</span></td>
                    <td class="sk-mono">${fmtMAD(w.valMAD)}</td>
                    <td style="font-size:12px;color:var(--n-600);">${kdsEsc(w.actor)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>` : '';

      // Lots proches de la DLC (7 jours) · un geste pour déclarer la perte, motif pré-rempli « Périmé »
      const dlcSection = (function(){
        if (!storeIsReal()) return '';
        let lots = [];
        try { lots = (window.KiwiInventoryConsumption?.expiring && window.KiwiInventoryConsumption.expiring({ horizonDays: 7 })) || []; } catch (_) { lots = []; }
        if (!lots.length) return '';
        const expired = lots.filter(l => l.status === 'expired').length;
        return `<div class="sk-section" style="margin-top:20px;">
          <div class="sk-section-head"><h3>Dates limites</h3><span class="sk-badge warn">${lots.length}</span></div>
          <div class="sk-alerts">${lots.slice(0, 12).map(l => {
            const d = new Date(l.expiresAt).toLocaleDateString('fr-FR');
            const tag = l.status === 'expired' ? 'Périmé' : (l.status === 'critical' ? `J-${Math.max(0, l.daysLeft)}` : `J-${l.daysLeft}`);
            return `<div class="sk-alert ${l.status === 'expired' ? 'out' : 'low'}"><div class="sk-alert-ico"><i data-lucide="${l.status === 'expired' ? 'x-octagon' : 'clock'}"></i></div>
              <div class="sk-alert-body"><div class="sk-alert-top"><span class="sk-alert-name">${kdsEsc(l.name)}</span><span class="sk-alert-status ${l.status === 'expired' ? 'out' : 'low'}">${tag}</span></div>
              <div class="sk-alert-meta">${l.remainingQty} ${kdsEsc(l.unit)} · DLC ${d}${l.supplierName ? ' · ' + kdsEsc(l.supplierName) : ''}</div></div>
              <button class="ma-btn secondary sk-mini" data-sk-dlc-waste="${kdsEsc(l.itemId)}" data-sk-dlc-lot="${kdsEsc(l.lotId || '')}" data-sk-dlc-qty="${l.remainingQty}" style="color:#b91c1c;"><i data-lucide="trash-2"></i>Déclarer en perte</button>
            </div>`;
          }).join('')}</div>
          ${expired ? `<div class="sk-kpi-sub" style="margin-top:6px;">${expired} lot${expired > 1 ? 's' : ''} déjà périmé${expired > 1 ? 's' : ''} · à sortir du stock.</div>` : ''}
        </div>`;
      })();
      return kpis + quickActs + list + dlcSection + wasteSection;
    }

    function skFilteredItems(){
      const q = skSearch.trim().toLowerCase();
      return stockItems.filter(i=>{
        if (skCat !== 'all' && i.cat !== skCat) return false;
        if (skStatus !== 'all' && skStatusOf(i) !== skStatus) return false;
        if (q && !(`${i.name} ${i.supplier} ${SK_CATS[i.cat]||''}`.toLowerCase().includes(q))) return false;
        return true;
      });
    }
    function skRowsHTML(){
      const items = skFilteredItems();
      if (!items.length) return `<tr class="sk-empty-row"><td colspan="8">Aucun article.</td></tr>`;
      return items.map(it=>{
        const st = skStatusOf(it);
        const pct = Math.min(100, Math.round(it.stock / Math.max(1, it.par) * 100));
        const bar = st==='out'?'bad':(st==='low'?'warn':'ok');
        return `<tr>
          <td><div class="sk-cell-name">${kdsEsc(it.name)}</div><div class="sk-cell-sub">${it.unit} · ${fmtMAD(it.cost)}/${it.unit}</div></td>
          <td>${SK_CATS[it.cat]||it.cat}</td>
          <td><div class="sk-cell-stock">${it.stock} ${it.unit}</div><div class="sk-bar"><div class="sk-bar-fill ${bar}" style="width:${pct}%"></div></div></td>
          <td class="sk-mono">${it.par}</td>
          <td class="sk-mono">${fmtMAD(it.stock * it.cost)}</td>
          <td class="sk-cell-sup">${kdsEsc(it.supplier)}</td>
          <td><span class="sk-status ${st}"><span class="sd"></span>${st==='out'?'Rupture':(st==='low'?'Bas':'OK')}</span></td>
          <td class="r"><div class="sk-actions"><button class="sk-icon-btn" data-sk-waste="${it.id}" title="Déclarer une perte" style="color:#b91c1c;"><i data-lucide="trash-2"></i></button><button class="sk-icon-btn" data-sk-order="${it.id}" title="Commander"><i data-lucide="truck"></i></button></div></td>
        </tr>`;
      }).join('');
    }
    function renderSkRows(){ const tb = $('#sk-tbl-body'); if (tb){ tb.innerHTML = skRowsHTML(); if (window.lucide) lucide.createIcons(); } }

    function renderSkArticles(){
      const cats = ['all', ...Object.keys(SK_CATS).filter(c => stockItems.some(i => i.cat === c))];
      const catPills = cats.map(c => `<button class="sk-pill ${skCat===c?'on':''}" data-sk-cat="${c}">${c==='all'?'Tout':SK_CATS[c]}</button>`).join('');
      const statusPills = [['all','Tous'],['ok','En stock'],['low','Bas'],['out','Rupture']].map(([v,l])=>`<button class="sk-pill ${skStatus===v?'on':''}" data-sk-status="${v}">${l}</button>`).join('');
      return `<div class="sk-toolbar">
          <div class="sk-search-wrap"><i data-lucide="search"></i><input class="sk-search" id="sk-search-input" placeholder="Chercher un article, fournisseur…" value="${kdsEsc(skSearch)}"></div>
          <span class="sk-dashboard-only">Articles et prix se gèrent dans le tableau de bord</span>
        </div>
        <div class="sk-filters">${catPills}</div>
        <div class="sk-filters">${statusPills}</div>
        <div class="sk-tbl-wrap"><table class="sk-tbl"><thead><tr><th>Article</th><th>Catégorie</th><th>Stock</th><th>Par</th><th>Valeur</th><th>Fournisseur</th><th>Statut</th><th class="r">Actions</th></tr></thead><tbody id="sk-tbl-body">${skRowsHTML()}</tbody></table></div>`;
    }

    function renderSkAppro(){
      const active = supplyOrders.filter(o => o.status !== 'recue');
      const past = supplyOrders.filter(o => o.status === 'recue');
      const card = o => { const [lbl,cls] = SK_ORD_STATUS[o.status] || ['',''];
        return `<div class="sk-ord ${o.status==='en-attente'?'urgent':''}">
          <div class="sk-ord-top"><span class="sk-ord-id">#${o.id}</span><span class="sk-ord-status ${cls}">${lbl}</span></div>
          <div class="sk-ord-sup">${kdsEsc(o.supplier)}</div>
          <div class="sk-ord-when"><i data-lucide="clock"></i>${kdsEsc(o.when)}</div>
          <div class="sk-ord-items">${o.items.map(i=>`${i.qty} ${i.unit} ${kdsEsc(i.name)}`).join(' · ')}</div>
          <div class="sk-ord-foot"><span class="sk-ord-total">${fmtMAD(o.total)}</span><div class="sk-ord-acts">
            ${o.status==='en-attente'?`<button class="ma-btn secondary sk-mini" data-sk-confirm="${o.id}">Confirmer</button>`:''}
            <button class="ma-btn primary sk-mini" data-sk-receive="${o.id}"><i data-lucide="check"></i>Reçue</button>
          </div></div></div>`; };
      return `<div class="sk-toolbar">
          <div class="sk-section-head" style="margin:0"><h3>Commandes en cours</h3><span class="sk-badge">${active.length}</span></div>
          <button class="ma-btn primary sk-add" data-sk-neworder><i data-lucide="plus"></i>Nouvelle commande</button>
        </div>
        <div class="sk-ord-grid">${active.length ? active.map(card).join('') : `<div class="sk-empty"><i data-lucide="truck"></i>Aucune commande en cours.</div>`}</div>
        ${past.length ? `<div class="sk-section"><div class="sk-section-head"><h3>Historique</h3></div><div class="sk-tbl-wrap"><table class="sk-tbl"><thead><tr><th>#</th><th>Fournisseur</th><th>Articles</th><th>Total</th><th>Statut</th></tr></thead><tbody>${past.map(o=>`<tr><td class="sk-mono">#${o.id}</td><td>${kdsEsc(o.supplier)}</td><td>${o.items.length} article${o.items.length>1?'s':''}</td><td class="sk-mono">${fmtMAD(o.total)}</td><td><span class="sk-status ok"><span class="sd"></span>Reçue</span></td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
    }

    function renderSkInventaire(){
      return `
        <div class="sk-section" style="padding:28px 16px;text-align:center;">
          <div style="width:56px;height:56px;border-radius:16px;background:rgba(5,150,105,0.1);color:#059669;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:28px;">
            <i data-lucide="clipboard-check"></i>
          </div>
          <h3 style="font-size:18px;margin-bottom:6px;">Inventaire physique à l'aveugle</h3>
          <p style="font-size:13.5px;color:var(--n-600);max-width:500px;margin:0 auto 18px;">
            Comptez les quantités réelles en rayon ou en réserve sans biais visuel. Votre saisie sera transmise au propriétaire pour revue et validation.
          </p>
          <div style="display:flex;gap:10px;justify-content:center;">
            <button class="ma-btn primary" id="sk-start-blind-count" data-sk-blind-count style="background:#059669;border-color:#047857;padding:12px 24px;font-size:15px;border-radius:12px;font-weight:600;">
              <i data-lucide="scan-barcode"></i>Démarrer le comptage aveugle
            </button>
          </div>
        </div>
      `;
    }

    /* ---- stock modal (edit · add · new order) ---- */
    function openSkModal(html){ $('#sk-modal-box').innerHTML = html; $('#sk-modal').classList.add('is-open'); if (window.lucide) lucide.createIcons(); }
    function closeSkModal(){ $('#sk-modal').classList.remove('is-open'); }
    function skSupplierOptions(sel){ return suppliers.map(s=>`<option value="${kdsEsc(s.name)}" ${s.name===sel?'selected':''}>${kdsEsc(s.name)}</option>`).join(''); }
    function skCatOptions(sel){ return Object.entries(SK_CATS).map(([v,l])=>`<option value="${v}" ${v===sel?'selected':''}>${l}</option>`).join(''); }

    function openEditItem(id){
      toast('Les articles et prix se gèrent dans le tableau de bord.');
      return;
      const it = stockItems.find(i=>i.id===id); if (!it) return;
      openSkModal(`<div class="split-badge">Article</div><h3 class="modal-title" style="margin-bottom:12px;">${kdsEsc(it.name)}</h3>
        <div class="sk-field-row">
          <div class="sk-field"><label>Stock actuel (${it.unit})</label><input class="sk-input" id="sk-f-stock" type="number" min="0" value="${it.stock}"></div>
          <div class="sk-field"><label>Niveau par (${it.unit})</label><input class="sk-input" id="sk-f-par" type="number" min="0" value="${it.par}"></div>
        </div>
        <div class="sk-field-row">
          <div class="sk-field"><label>Seuil d'alerte</label><input class="sk-input" id="sk-f-reorder" type="number" min="0" value="${it.reorder}"></div>
          <div class="sk-field"><label>Coût/${it.unit} (MAD)</label><input class="sk-input" id="sk-f-cost" type="number" min="0" value="${it.cost}"></div>
        </div>
        <div class="nt-actions"><button class="ma-btn secondary" data-sk-cancel style="flex:1;">Annuler</button><button class="ma-btn primary" data-sk-save-item="${it.id}" style="flex:2;"><i data-lucide="check"></i>Enregistrer</button></div>`);
    }
    function saveEditItem(id){
      toast('Les articles et prix se gèrent dans le tableau de bord.');
      return;
      const it = stockItems.find(i=>i.id===id); if (!it) return;
      const patch = {
        stock: Math.max(0, parseFloat($('#sk-f-stock').value) || 0),
        par: Math.max(0, parseFloat($('#sk-f-par').value) || 0),
        reorder: Math.max(0, parseFloat($('#sk-f-reorder').value) || 0),
        cost: Math.max(0, parseFloat($('#sk-f-cost').value) || 0),
      };
      if (storeIsReal() && window.KiwiCaisseStock) window.KiwiCaisseStock.updateItem(id, patch);
      else Object.assign(it, patch);
      syncSharedStock(false);
      closeSkModal(); renderStock(); toast(`${it.name} mis à jour`);
    }
    function openAddItem(){
      toast('Ajoutez les articles et prix depuis le tableau de bord.');
      return;
      openSkModal(`<div class="split-badge">Nouvel article</div><h3 class="modal-title" style="margin-bottom:12px;">Ajouter un article</h3>
        <div class="sk-field"><label>Nom</label><input class="sk-input" id="sk-f-name" placeholder="ex. Citrons confits" autocomplete="off"></div>
        <div class="sk-field-row">
          <div class="sk-field"><label>Catégorie</label><select class="sk-select" id="sk-f-cat">${skCatOptions('legumes')}</select></div>
          <div class="sk-field"><label>Unité</label><input class="sk-input" id="sk-f-unit" value="kg"></div>
        </div>
        <div class="sk-field"><label>Fournisseur</label><select class="sk-select" id="sk-f-supplier">${skSupplierOptions((suppliers[0] || {}).name || '')}</select></div>
        <div class="sk-field-row">
          <div class="sk-field"><label>Stock</label><input class="sk-input" id="sk-f-stock" type="number" min="0" value="0"></div>
          <div class="sk-field"><label>Par</label><input class="sk-input" id="sk-f-par" type="number" min="0" value="10"></div>
          <div class="sk-field"><label>Coût (MAD)</label><input class="sk-input" id="sk-f-cost" type="number" min="0" value="0"></div>
        </div>
        <div class="nt-actions"><button class="ma-btn secondary" data-sk-cancel style="flex:1;">Annuler</button><button class="ma-btn primary" data-sk-add-save style="flex:2;"><i data-lucide="plus"></i>Ajouter</button></div>`);
    }
    function saveNewItem(){
      toast('Ajoutez les articles et prix depuis le tableau de bord.');
      return;
      const name = ($('#sk-f-name').value || '').trim();
      if (!name){ $('#sk-f-name').focus(); toast("Donne un nom à l'article"); return; }
      const par = Math.max(0, parseInt($('#sk-f-par').value) || 0);
      const item = { id:'usr-'+Date.now().toString(36), name, cat:$('#sk-f-cat').value, unit:($('#sk-f-unit').value||'unité').trim(),
        supplier:$('#sk-f-supplier').value, stock:Math.max(0, parseInt($('#sk-f-stock').value)||0),
        par, reorder:Math.max(1, Math.round(par * 0.4)), cost:Math.max(0, parseFloat($('#sk-f-cost').value)||0) };
      if (storeIsReal() && window.KiwiCaisseStock) window.KiwiCaisseStock.addItem(item);
      else stockItems.push(item);
      syncSharedStock(false);
      closeSkModal(); stockTab = 'articles'; renderStock(); toast(`${name} ajouté au stock`);
    }

    function skOrderLinesHTML(supplierName, prefillId){
      const items = stockItems.filter(i => i.supplier === supplierName);
      if (!items.length) return `<div class="sk-empty" style="padding:14px 0">Aucun article pour ce fournisseur.</div>`;
      return items.map(it=>{
        const sugg = (prefillId === it.id) ? Math.max(1, it.par - it.stock) : 0;
        return `<div class="sk-ord-line"><span class="sk-ord-line-name">${kdsEsc(it.name)} <small>${it.stock}/${it.par} ${it.unit}</small></span><input class="sk-count-input" type="number" min="0" data-sk-oline="${it.id}" value="${sugg}"><span class="sk-unit">${it.unit}</span></div>`;
      }).join('');
    }
    function openNewOrder(prefillSupplier, prefillId){
      const sup = prefillSupplier || (suppliers[0] || {}).name || '';
      openSkModal(`<div class="split-badge">Approvisionnement</div><h3 class="modal-title" style="margin-bottom:12px;">Nouvelle commande</h3>
        <div class="sk-field"><label>Fournisseur</label><select class="sk-select" id="sk-order-supplier">${skSupplierOptions(sup)}</select></div>
        <div class="sk-field"><label>Articles &amp; quantités</label><div id="sk-order-lines">${skOrderLinesHTML(sup, prefillId)}</div></div>
        <div class="nt-actions"><button class="ma-btn secondary" data-sk-cancel style="flex:1;">Annuler</button><button class="ma-btn primary" data-sk-create-order style="flex:2;"><i data-lucide="check"></i>Créer la commande</button></div>`);
    }
    function createOrder(){
      const supplier = $('#sk-order-supplier').value;
      const lines = []; let total = 0;
      $$('#sk-order-lines [data-sk-oline]').forEach(inp=>{
        const qty = parseInt(inp.value) || 0;
        if (qty > 0){ const it = stockItems.find(i => i.id === inp.dataset.skOline); if (it){ lines.push({ name:it.name, qty, unit:it.unit }); total += qty * it.cost; } }
      });
      if (!lines.length){ toast('Ajoute au moins une quantité'); return; }
      supplyOrders.unshift({ id:String(++skOrderSeq), supplier, items:lines, total:Math.round(total), status:'en-attente', when:'À planifier' });
      closeSkModal(); stockTab = 'appro'; renderStock(); toast(`Commande #${skOrderSeq} créée · ${supplier}`);
    }
    function confirmOrder(id){ const o = supplyOrders.find(x=>x.id===id); if (!o) return; o.status = 'confirmee'; renderStock(); toast(`Commande #${id} confirmée`); }
    function receiveOrder(id){
      const o = supplyOrders.find(x=>x.id===id); if (!o) return;
      let added = 0, failed = false;
      const receiptRef = 'purchase-' + id;
      o.items.forEach((li, lineIndex)=>{ const it = stockItems.find(i => i.name === li.name); if (it){
        if (storeIsReal() && window.KiwiCaisseStock) {
          const card = window.KiwiCaisseStock.resolveSupplierCard ? window.KiwiCaisseStock.resolveSupplierCard(it.id, o.supplier) : null;
          const supRank = card && card.rank != null ? card.rank : 999;
          const supId = card && card.id ? card.id : (o.supplier ? 'sup-' + Date.now().toString(36) : '');
          const factor = card && card.factor > 0 ? card.factor : 1;
          const stockQty = Math.round(li.qty * factor * 1000) / 1000;
          const unitCost = card && card.defaultPrice != null ? card.defaultPrice : (it.cost || null);
          const meta = {
            supplierId: supId,
            supplierName: o.supplier || '',
            rank: supRank,
            receiptRef: receiptRef,
            operationId: 'order:' + id + ':line:' + lineIndex,
            receivedAt: Date.now(),
            purchaseQty: li.qty,
            purchaseUnit: card?.purchaseUnit || it.unit || 'unité',
            factor: factor,
          };
          const movement = window.KiwiCaisseStock.move(it.id, stockQty, 'receipt', 'order:' + id + ':line:' + lineIndex, unitCost, meta);
          if (!movement) { failed = true; return; }
        }
        else it.stock += li.qty;
        added++;
      } });
      if (failed) { toast(added ? 'Réception partielle · relance la même réception pour reprendre les lignes acceptées' : 'Réception refusée · vérifie la référence et la quantité'); return; }
      o.status = 'recue'; o.when = 'Reçue';
      syncSharedStock(false);
      renderStock(); toast(`Commande #${id} reçue · ${added} article${added>1?'s':''} réapprovisionné${added>1?'s':''}`);
    }
    function validateInventory(){
      if (window.KiwiPosInventoryCount) {
        window.KiwiPosInventoryCount.open({ engine: 'ledger' });
      } else if (storeIsReal() && window.KiwiCaisseStock && window.KiwiCaisseStock.count) {
        // Fallback si module non chargé
      }
    }

    /* ---- Réception · real photo reference or manual entry ---- */
    let skReceptMode = 'photo';  // 'photo' | 'manual'
    let skReceptState = 'idle';  // 'idle' | 'scanning' | 'done'
    let skReceptLines = [];      // [{ name, qty, cost }]
    let skReceptPhoto = null;
    let skReceptSupplier = '';
    let skReceptRef = '';
    let skReceptIntentId = '';
    let skWasteIntentId = '';
    function stockIntentId(prefix){
      try { if (window.crypto && window.crypto.randomUUID) return prefix + ':' + window.crypto.randomUUID(); } catch (_) {}
      return prefix + ':' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2, 14);
    }
    function openRecept(){ skReceptMode = 'photo'; skReceptState = 'idle'; skReceptLines = []; skReceptPhoto = null; skReceptSupplier = ''; skReceptRef = ''; skReceptIntentId = stockIntentId('receipt'); openSkModal(renderReceptModal()); }
    function renderReceptModal(){
      const sups = storeIsReal() && window.KiwiCaisseStock?.suppliers ? window.KiwiCaisseStock.suppliers() : [];
      const supOptions = (Array.isArray(sups) ? sups : []).map(s => `<option value="${kdsEsc(s.name || s)}">`).join('');
      return `<div class="split-badge">Réception</div><h3 class="modal-title" style="margin-bottom:4px;">Entrer du stock</h3>
        <p class="modal-subtle" style="margin:0 0 14px;">Sélectionne le fournisseur, renseigne les quantités reçues et vérifie le prix unitaire facturé.</p>
        <div class="sk-field" style="margin-bottom:10px;">
          <label style="font-size:12px;font-weight:600;color:var(--n-600);display:block;margin-bottom:4px;">Fournisseur &amp; Réf. bon</label>
          <div style="display:flex;gap:8px;">
            <input class="sk-input" id="sk-recept-sup" placeholder="Fournisseur…" list="sk-sup-list" value="${kdsEsc(skReceptSupplier || '')}" style="flex:2;" autocomplete="off">
            <datalist id="sk-sup-list">${supOptions}</datalist>
            <input class="sk-input" id="sk-recept-ref" placeholder="Réf. bon / facture" value="${kdsEsc(skReceptRef || '')}" style="flex:1;">
          </div>
        </div>
        <div class="sk-recept-modes">
          <button class="sk-rmode ${skReceptMode==='photo'?'on':''}" data-sk-rmode="photo"><i data-lucide="scan-line"></i>Photo du bon</button>
          <button class="sk-rmode ${skReceptMode==='manual'?'on':''}" data-sk-rmode="manual"><i data-lucide="keyboard"></i>Saisie manuelle</button>
        </div>
        <div id="sk-recept-body">${skReceptBodyHTML()}</div>`;
    }
    function skReceptBodyHTML(){
      if (skReceptMode === 'photo'){
        if (skReceptState === 'idle')
          return `<div class="sk-dropzone"><i data-lucide="receipt-text"></i><div class="sk-dz-t">Photo du bon de livraison</div><div class="sk-dz-s">Prends une photo ou importe le reçu ; elle restera la référence de cette réception.</div><button class="ma-btn primary sk-mini" data-sk-scan style="margin-top:6px"><i data-lucide="camera"></i>Prendre / importer</button></div>`;
        if (skReceptState === 'scanning')
          return `<div class="sk-scanning"><div class="sk-spinner"></div>Analyse du bon…</div>`;
        return `<div class="sk-recept-note"><i data-lucide="check-circle-2"></i>Bon joint comme référence. Saisis les articles et vérifie les quantités.</div>${skReceptPhoto ? `<img src="${skReceptPhoto.dataUrl}" alt="Bon de livraison" style="display:block;width:100%;max-height:150px;object-fit:contain;border:1px solid var(--line);border-radius:12px;margin:10px 0;">` : ''}${skReceptLinesHTML()}${skReceptFootHTML()}`;
      }
      return skReceptLinesHTML() + `<div class="sk-rline-add" data-sk-rline-add><i data-lucide="plus"></i>Ajouter une ligne</div>` + skReceptFootHTML();
    }
    function skReceptLinesHTML(){
      if (!skReceptLines.length) skReceptLines = [{ name:'', qty:'', cost:'' }];
      return skReceptLines.map((l,idx)=>{
        const it = stockItems.find(i => i.name.toLowerCase() === (l.name || '').toLowerCase());
        const unit = it ? it.unit : 'unité';
        const costVal = l.cost !== '' && l.cost != null ? l.cost : (it && it.cost != null ? it.cost : '');
        return `<div class="sk-rline" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
          <input class="sk-rl-name" data-sk-rl-name="${idx}" placeholder="Article" value="${kdsEsc(l.name)}" list="sk-items-list" autocomplete="off" style="flex:2;">
          <div style="display:flex;align-items:center;gap:4px;flex:1.2;">
            <input class="sk-rl-qty" data-sk-rl-qty="${idx}" type="number" min="0" step="any" placeholder="Qté" value="${l.qty}" style="width:100%;">
            <span style="font-size:11px;color:var(--n-500);white-space:nowrap;">${kdsEsc(unit)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:4px;flex:1.4;">
            <input class="sk-rl-cost" data-sk-rl-cost="${idx}" type="number" min="0" step="any" placeholder="Prix unit." value="${costVal}" style="width:100%;">
            <span style="font-size:11px;color:var(--n-500);white-space:nowrap;">MAD</span>
          </div>
          <input class="sk-rl-dlc" data-sk-rl-dlc="${idx}" type="date" title="DLC / DDM (optionnel)" value="${kdsEsc(l.dlc || '')}" style="flex:1.3;min-width:0;">
          <button class="sk-rl-del" data-sk-rl-del="${idx}" aria-label="Retirer"><i data-lucide="x"></i></button>
        </div>`;
      }).join('') + `<datalist id="sk-items-list">${stockItems.map(i=>`<option value="${kdsEsc(i.name)}">`).join('')}</datalist>`;
    }
    function skReceptFootHTML(){
      return `<div class="nt-actions" style="margin-top:14px"><button class="ma-btn secondary" data-sk-cancel style="flex:1;">Annuler</button><button class="ma-btn primary" data-sk-commit-recept style="flex:2;"><i data-lucide="plus-circle"></i>Ajouter au stock</button></div>`;
    }
    function refreshReceptModal(){ $('#sk-modal-box').innerHTML = renderReceptModal(); if (window.lucide) lucide.createIcons(); }
    function rerenderReceptBody(){ const b = $('#sk-recept-body'); if (b){ b.innerHTML = skReceptBodyHTML(); if (window.lucide) lucide.createIcons(); } }
    async function skScan(){
      if (!window.KiwiImageProof){ toast('Appareil photo indisponible'); return; }
      try {
        const photo = await KiwiImageProof.pick({ maxDimension: 960, quality: 0.72 });
        if (!photo) return;
        skReceptPhoto = photo;
        skReceptLines = [{ name:'', qty:'', cost:'' }];
        skReceptState = 'done'; rerenderReceptBody();
      } catch (_){ toast('Photo non jointe · vérifie l’accès à l’appareil'); }
    }
    function commitRecept(){
      const supInput = $('#sk-recept-sup');
      const refInput = $('#sk-recept-ref');
      const supplier = (supInput ? supInput.value : skReceptSupplier || '').trim();
      const externalRef = (refInput ? refInput.value : skReceptRef || '').trim();

      if (!supplier) {
        toast('Indique le fournisseur pour enregistrer la réception');
        if (supInput) supInput.focus();
        return;
      }

      $$('#sk-recept-body .sk-rline').forEach((row,idx)=>{
        const n = row.querySelector('[data-sk-rl-name]');
        const q = row.querySelector('[data-sk-rl-qty]');
        const c = row.querySelector('[data-sk-rl-cost]');
        const dl = row.querySelector('[data-sk-rl-dlc]');
        if (skReceptLines[idx]){
          skReceptLines[idx].name = (n ? n.value : '').trim();
          skReceptLines[idx].qty = q ? q.value : '';
          skReceptLines[idx].cost = c && c.value !== '' ? parseFloat(c.value) : null;
          skReceptLines[idx].dlc = dl ? dl.value : '';
        }
      });
      let added = 0, unknown = 0, failed = false;
      const receiptIntentId = skReceptIntentId || (skReceptIntentId = stockIntentId('receipt'));
      skReceptLines.forEach((l, lineIndex)=>{
        const qty = parseFloat(l.qty) || 0; const name = (l.name || '').trim();
        if (!name || qty <= 0) return;
        const it = stockItems.find(i => i.name.toLowerCase() === name.toLowerCase());
        if (it){
          if (storeIsReal() && window.KiwiCaisseStock) {
            const card = window.KiwiCaisseStock.resolveSupplierCard ? window.KiwiCaisseStock.resolveSupplierCard(it.id, supplier) : null;
            const supRank = card && card.rank != null ? card.rank : 999;
            const supId = card && card.id ? card.id : (supplier ? 'sup-' + Date.now().toString(36) : '');
            const factor = card && card.factor > 0 ? card.factor : 1;
            const stockQty = Math.round(qty * factor * 1000) / 1000;
            const unitCost = l.cost != null && !isNaN(l.cost) && l.cost >= 0
              ? Math.round((l.cost / factor) * 10000) / 10000
              : (card && card.defaultPrice != null ? card.defaultPrice : (it.cost || null));

            const meta = {
              supplierId: supId,
              supplierName: supplier,
              rank: supRank,
              externalRef: externalRef,
              receiptRef: externalRef || receiptIntentId,
              operationId: receiptIntentId + ':line:' + lineIndex,
              receivedAt: Date.now(),
              purchaseQty: qty,
              purchaseUnit: card?.purchaseUnit || it.unit || 'unité',
              factor: factor,
              // DLC / DDM du lot reçu · lue par KiwiInventoryConsumption.expiring()
              expiresAt: l.dlc ? new Date(l.dlc + 'T23:59:59').getTime() : null,
            };
            const movement = window.KiwiCaisseStock.move(it.id, stockQty, 'receipt', receiptIntentId + ':line:' + lineIndex, unitCost, meta);
            if (!movement) { failed = true; return; }
            if (unitCost != null && unitCost > 0 && window.KiwiCaisseStock.updateSupplierPrice) {
              window.KiwiCaisseStock.updateSupplierPrice(it.id, supplier, unitCost);
            }
          } else {
            it.stock += qty;
            if (l.cost != null && l.cost > 0) it.cost = l.cost;
          }
          added++;
        }
        else unknown++;
      });
      if (failed){
        toast(added ? 'Réception partielle · relance la même réception pour reprendre les lignes acceptées' : 'Réception refusée · vérifie la référence et la quantité');
        return;
      }
      if (!added){
        toast(unknown ? 'Article inconnu · créez-le dans le tableau de bord avant la réception.' : 'Aucune ligne valide');
        return;
      }
      syncSharedStock(false); closeSkModal(); stockTab = 'articles'; renderStock();
      toast(`Stock mis à jour · ${added} article${added>1?'s':''}`);
    }

    /* ---- Pertes de stock (Waste Management) ---- */
    function openWasteModal(prefillItemId, prefillLotId, prefillQty, prefillReason){
      skWasteIntentId = stockIntentId('waste');
      const items = stockItems.slice();
      const selItem = prefillItemId ? items.find(i => i.id === prefillItemId) : items[0];
      const selId = selItem ? selItem.id : (items[0] ? items[0].id : '');
      const unit = selItem ? selItem.unit : 'unité';
      const initialQty = prefillQty != null ? prefillQty : '';
      const initialReason = prefillReason || 'casse';
      const initialLot = prefillLotId || '';
      
      const itemOptions = items.map(it => `<option value="${it.id}" ${it.id === selId ? 'selected' : ''}>${kdsEsc(it.name)} (${it.stock} ${it.unit} en stock)</option>`).join('');
      
      const cashierName = (currentCashier && currentCashier.name) || 'Caissier';
      const now = new Date();
      const nowISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

      const html = `
        <div class="split-badge" style="background:rgba(220,38,38,0.12);color:#991b1b;"><i data-lucide="trash-2"></i> Perte de stock</div>
        <h3 class="modal-title" style="margin-bottom:6px;">Déclarer une perte</h3>
        <p class="modal-subtle" style="margin:0 0 16px;">Enregistre les produits sortis pour casse, péremption, avarie ou repas équipe. Le stock sera déduit immédiatement.</p>
        
        <div class="sk-field" style="margin-bottom:12px;">
          <label style="font-size:12px;font-weight:600;color:var(--n-600);display:block;margin-bottom:4px;">Article / Ingrédient</label>
          <select class="sk-select" id="sk-w-item" style="width:100%;">${itemOptions}</select>
        </div>

        <div class="sk-field-row" style="display:flex;gap:10px;margin-bottom:12px;">
          <div class="sk-field" style="flex:1;">
            <label style="font-size:12px;font-weight:600;color:var(--n-600);display:block;margin-bottom:4px;">Quantité perdue</label>
            <div style="display:flex;align-items:center;gap:6px;">
              <input class="sk-input" id="sk-w-qty" type="number" min="0.001" step="any" placeholder="0" value="${initialQty}" style="flex:1;">
              <span id="sk-w-unit" style="font-size:13px;font-weight:600;color:var(--n-700);">${kdsEsc(unit)}</span>
            </div>
          </div>
          <div class="sk-field" style="flex:1.2;">
            <label style="font-size:12px;font-weight:600;color:var(--n-600);display:block;margin-bottom:4px;">Motif</label>
            <select class="sk-select" id="sk-w-reason" style="width:100%;">
              <option value="perime" ${initialReason==='perime'?'selected':''}>Périmé (DLC dépassée)</option>
              <option value="casse" ${initialReason==='casse'?'selected':''}>Casse</option>
              <option value="avarie" ${initialReason==='avarie'?'selected':''}>Avarié / Abîmé</option>
              <option value="offert" ${initialReason==='offert'?'selected':''}>Offert / Geste commercial</option>
              <option value="repas-equipe" ${initialReason==='repas-equipe'?'selected':''}>Repas équipe</option>
              <option value="autre" ${initialReason==='autre'?'selected':''}>Autre perte</option>
            </select>
          </div>
        </div>

        <div class="sk-field-row" style="display:flex;gap:10px;margin-bottom:12px;">
          <div class="sk-field" style="flex:1;">
            <label style="font-size:12px;font-weight:600;color:var(--n-600);display:block;margin-bottom:4px;">Lot / Réf. (optionnel)</label>
            <input class="sk-input" id="sk-w-lot" placeholder="Ex: LOT-2026-08" value="${kdsEsc(initialLot)}" style="width:100%;">
          </div>
          <div class="sk-field" style="flex:1;">
            <label style="font-size:12px;font-weight:600;color:var(--n-600);display:block;margin-bottom:4px;">Date &amp; Heure</label>
            <input class="sk-input" id="sk-w-time" type="datetime-local" value="${nowISO}" style="width:100%;">
          </div>
        </div>

        <div class="sk-field" style="margin-bottom:12px;">
          <label style="font-size:12px;font-weight:600;color:var(--n-600);display:block;margin-bottom:4px;">Employé</label>
          <input class="sk-input" value="${kdsEsc(cashierName)}" readonly style="width:100%;background:var(--n-100);cursor:not-allowed;">
        </div>

        <div class="sk-field" style="margin-bottom:16px;">
          <label style="font-size:12px;font-weight:600;color:var(--n-600);display:block;margin-bottom:4px;">Note ou commentaire (optionnel)</label>
          <input class="sk-input" id="sk-w-note" placeholder="Détails sur la perte…" maxlength="500" style="width:100%;">
        </div>

        <div class="nt-actions" style="display:flex;gap:8px;">
          <button class="ma-btn secondary" data-sk-cancel style="flex:1;">Annuler</button>
          <button class="ma-btn primary" id="sk-commit-waste-btn" data-sk-commit-waste style="flex:2;background:#dc2626;border-color:#b91c1c;"><i data-lucide="trash-2"></i>Confirmer la perte</button>
        </div>
      `;
      openSkModal(html);
      
      const itemSel = $('#sk-w-item');
      if (itemSel) {
        itemSel.addEventListener('change', () => {
          const chosen = stockItems.find(i => i.id === itemSel.value);
          const uEl = $('#sk-w-unit');
          if (chosen && uEl) uEl.textContent = chosen.unit;
        });
      }
    }

    function commitWaste(){
      const itemSel = $('#sk-w-item');
      const itId = itemSel ? itemSel.value : '';
      const it = stockItems.find(i => i.id === itId);
      if (!it) { toast('Sélectionne un article'); return; }
      const qty = parseFloat($('#sk-w-qty').value) || 0;
      if (qty <= 0) { toast('Indique une quantité valide'); return; }
      if (qty > it.stock) {
        if (!confirm(`La quantité saisie (${qty} ${it.unit}) est supérieure au stock disponible (${it.stock} ${it.unit}). Confirmer quand même ?`)) {
          return;
        }
      }
      const fineReason = $('#sk-w-reason').value || 'casse';
      const ledgerReasonMap = {
        'perime': 'expiry',
        'casse': 'loss',
        'avarie': 'loss',
        'offert': 'gift',
        'repas-equipe': 'staff-meal',
        'autre': 'loss'
      };
      const ledgerReason = ledgerReasonMap[fineReason] || 'loss';
      const lotId = ($('#sk-w-lot').value || '').trim();
      const note = ($('#sk-w-note').value || '').trim();
      const timeVal = $('#sk-w-time').value;
      let occurredTs = Date.now();
      if (timeVal) {
        const parsed = new Date(timeVal).getTime();
        if (!isNaN(parsed) && parsed > 0) occurredTs = parsed;
      }
      
      let unitCost = it.cost || null;
      if (window.KiwiInventoryConsumption && window.KiwiInventoryConsumption.allocateCost) {
        const alloc = window.KiwiInventoryConsumption.allocateCost(it.id, qty, it.cost);
        if (alloc != null) unitCost = alloc;
      } else if (window.KiwiInventoryConsumption && window.KiwiInventoryConsumption.deriveLots) {
        const lots = window.KiwiInventoryConsumption.deriveLots(it.id) || [];
        if (lots.length && lots[0].unitCost != null) unitCost = lots[0].unitCost;
      }

      const wasteRef = skWasteIntentId || (skWasteIntentId = stockIntentId('waste'));
      const meta = {
        operationId: wasteRef,
        wasteReason: fineReason,
        lotId: lotId || undefined,
        actorId: (currentCashier && currentCashier.id) || '',
        note: note || undefined,
      };
      
      if (storeIsReal() && window.KiwiCaisseStock) {
        const movement = window.KiwiCaisseStock.move(it.id, -qty, ledgerReason, wasteRef, unitCost, meta, currentCashier);
        if (!movement) { toast('Perte refusée · la quantité ou le lot a changé'); return; }
      } else if (window.KiwiInventory && window.KiwiInventory.add) {
        window.KiwiInventory.add({
          itemId: it.id,
          qty: -qty,
          reason: ledgerReason,
          refType: 'waste',
          refId: wasteRef,
          note: note || 'Déclaration de perte',
          unitCost: unitCost,
          actor: (currentCashier && currentCashier.name) || 'Caissier',
          occurredTs: occurredTs,
          meta: meta
        });
        it.stock = Math.max(0, it.stock - qty);
      } else {
        it.stock = Math.max(0, it.stock - qty);
      }
      
      syncSharedStock(false);
      closeSkModal();
      renderStock();
      toast(`Perte de ${qty} ${it.unit} enregistrée`);
    }

    /* ---- open / close + delegation ---- */
    function openStock(){
      bindSharedStock(); syncSharedStock(false); renderStock();
      $('#stock-screen').classList.add('is-open');
      if (window.lucide) lucide.createIcons();
      /* Opening Stock is also a manual freshness boundary. The local ledger
       * renders immediately; the shared cloud document then reconciles any
       * dashboard edits made on another tab or device. */
      if (storeIsReal() && window.KiwiCaisseStock?.pull) {
        window.KiwiCaisseStock.pull().then(()=>{ syncSharedStock(false); renderStock(); }).catch(()=>{});
      }
    }
    function closeStock(){ $('#stock-screen').classList.remove('is-open'); }
    const stockRailTrigger = $('#open-stock');
    if (stockRailTrigger) stockRailTrigger.addEventListener('click', openStock);
    $('#stock-close-btn').addEventListener('click', closeStock);
    $('#stock-screen').addEventListener('click', (e)=>{
      const tab = e.target.closest('[data-sk-tab]');    if (tab){ stockTab = tab.dataset.skTab; renderStock(); return; }
      const cat = e.target.closest('[data-sk-cat]');    if (cat){ skCat = cat.dataset.skCat; renderStock(); return; }
      const stf = e.target.closest('[data-sk-status]'); if (stf){ skStatus = stf.dataset.skStatus; renderStock(); return; }
      const ed  = e.target.closest('[data-sk-edit]');   if (ed){ openEditItem(ed.dataset.skEdit); return; }
      const ord = e.target.closest('[data-sk-order]');  if (ord){ const it = stockItems.find(i=>i.id===ord.dataset.skOrder); openNewOrder(it && it.supplier, it && it.id); return; }
      if (e.target.closest('[data-sk-additem]'))     { openAddItem(); return; }
      if (e.target.closest('[data-sk-neworder]'))    { openNewOrder(); return; }
      if (e.target.closest('[data-sk-newwaste]') || e.target.id === 'sk-new-waste-btn'){ openWasteModal(); return; }
      if (e.target.closest('[data-sk-waste]')){ openWasteModal(e.target.closest('[data-sk-waste]').dataset.skWaste); return; }
      if (e.target.closest('[data-sk-dlc-waste]')){ const b = e.target.closest('[data-sk-dlc-waste]'); openWasteModal(b.dataset.skDlcWaste, b.dataset.skDlcLot || '', parseFloat(b.dataset.skDlcQty) || null, 'perime'); return; }
      if (e.target.closest('[data-sk-recept-act]') || e.target.id === 'sk-apercu-recept-btn'){ openRecept(); return; }
      if (e.target.closest('[data-sk-blind-count]') || e.target.id === 'sk-start-blind-count'){ if (window.KiwiPosInventoryCount) window.KiwiPosInventoryCount.open({ engine: 'ledger' }); return; }
      const cf = e.target.closest('[data-sk-confirm]'); if (cf){ confirmOrder(cf.dataset.skConfirm); return; }
      const rc = e.target.closest('[data-sk-receive]'); if (rc){ receiveOrder(rc.dataset.skReceive); return; }
      if (e.target.closest('[data-sk-validate-inv]')){ validateInventory(); return; }
    });
    $('#stock-screen').addEventListener('input', (e)=>{ if (e.target.id === 'sk-search-input'){ skSearch = e.target.value; renderSkRows(); } });
    $('#sk-modal').addEventListener('click', (e)=>{
      if (e.target.closest('[data-sk-cancel]') || e.target === $('#sk-modal')){ closeSkModal(); return; }
      const si = e.target.closest('[data-sk-save-item]'); if (si){ saveEditItem(si.dataset.skSaveItem); return; }
      if (e.target.closest('[data-sk-add-save]'))   { saveNewItem(); return; }
      if (e.target.closest('[data-sk-create-order]')){ createOrder(); return; }
      if (e.target.closest('[data-sk-commit-waste]')){ commitWaste(); return; }
      const rm = e.target.closest('[data-sk-rmode]'); if (rm){ skReceptMode = rm.dataset.skRmode; if (skReceptMode==='manual' && !skReceptLines.length) skReceptLines=[{name:'',qty:'',cost:''}]; refreshReceptModal(); return; }
      if (e.target.closest('[data-sk-scan]')){ skScan(); return; }
      if (e.target.closest('[data-sk-rline-add]')){ skReceptLines.push({name:'',qty:'',cost:''}); rerenderReceptBody(); return; }
      const rd = e.target.closest('[data-sk-rl-del]'); if (rd){ skReceptLines.splice(+rd.dataset.skRlDel,1); if (!skReceptLines.length) skReceptLines=[{name:'',qty:'',cost:''}]; rerenderReceptBody(); return; }
      if (e.target.closest('[data-sk-commit-recept]')){ commitRecept(); return; }
    });
    $('#sk-modal').addEventListener('input', (e)=>{
      const nm = e.target.closest('[data-sk-rl-name]'); if (nm){ const i=+nm.dataset.skRlName; if (skReceptLines[i]) skReceptLines[i].name = nm.value; return; }
      const qt = e.target.closest('[data-sk-rl-qty]'); if (qt){ const i=+qt.dataset.skRlQty; if (skReceptLines[i]) skReceptLines[i].qty  = qt.value; return; }
      const cs = e.target.closest('[data-sk-rl-cost]'); if (cs){ const i=+cs.dataset.skRlCost; if (skReceptLines[i]) skReceptLines[i].cost = cs.value; return; }
      if (e.target.id === 'sk-recept-sup') skReceptSupplier = e.target.value;
      if (e.target.id === 'sk-recept-ref') skReceptRef = e.target.value;
    });
    $('#sk-modal').addEventListener('change', (e)=>{ if (e.target.id === 'sk-order-supplier'){ $('#sk-order-lines').innerHTML = skOrderLinesHTML(e.target.value); if (window.lucide) lucide.createIcons(); } });
    $('#sk-recept-btn').addEventListener('click', openRecept);
    updateStockBadge();
    $('#rp-send-kitchen').addEventListener('click', sendToKitchen);

    kdsSeed();
    updateKdsCount();
    /* À partir d'ici l'écran cuisine est monté : une carte qui arrive du bureau
       peut repeindre sa barre de postes (voir rebuildCarte). */
    carteState.kdsReady = true;
    try { kdsRepaintStations(); } catch (_) {}

    /* ===========================================================
       À EMPORTER · orders board (landing) + builder toggle
       -----------------------------------------------------------
       À emporter opens on the orders board: every takeaway order
       sent to the kitchen, with its kitchen status (en préparation
       / prête, synced from the KDS), payment and pickup status.
       "Nouvelle commande" reveals the menu builder. Served orders
       drop into the history.
       =========================================================== */
    let vrapView = 'board';  // 'board' | 'builder'
    let vrapSelectedPaidNum = null;

    $('#vrap-board').addEventListener('click', (e) => {
      if (e.target.closest('#vrap-new-order')) {
        // Start a fresh order · drop any edit state and the working cart
        vrapEditingNum = null;
        clearCart();
        setVrapView('builder');
        if (window.lucide) lucide.createIcons();
        return;
      }
      const rdy = e.target.closest('[data-vrap-ready]');
      if (rdy) { vrapMarkReady(Number(rdy.dataset.vrapReady)); return; }
      const cancel = e.target.closest('[data-vrap-cancel]');
      if (cancel) {
        cancelOrderProTakeaway(kdsOrders.find(x => x && x.num === Number(cancel.dataset.vrapCancel)));
        return;
      }
      const send = e.target.closest('[data-vrap-send]');
      if (send) {
        const order = kdsOrders.find(x => x && x.num === Number(send.dataset.vrapSend));
        if (order && dispatchHeldTakeaway(order, false, true)) {
          renderVrapBoard();
          toast(`Commande ${ticketNo(order)} envoyée en cuisine · paiement en attente`);
        }
        return;
      }
      const ho = e.target.closest('[data-vrap-handover]');
      if (ho) { vrapHandover(Number(ho.dataset.vrapHandover)); return; }
      const archive = e.target.closest('[data-vrap-archive]');
      if (archive) { vrapArchivePaid(Number(archive.dataset.vrapArchive)); return; }
      const exp = e.target.closest('[data-exp-reprendre]');
      if (exp) { reprendreExpired(exp.dataset.expReprendre); return; }
      const dismiss = e.target.closest('[data-exp-dismiss]');
      if (dismiss) {
        dismissExpired(dismiss.dataset.expDismiss);
        renderVrapBoard();
        toast('Commande retirée des expirées');
        return;
      }
      // Any other click on an order card opens it (unpaid → edit + checkout).
      const card = e.target.closest('.vrap-order');
      if (card) {
        const num = Number(card.dataset.vrapNum);
        const order = kdsOrders.find(x => x.num === num);
        if (order && order.paid) {
          vrapSelectedPaidNum = vrapSelectedPaidNum === num ? null : num;
          renderVrapBoard();
        } else openVrapOrder(num);
        return;
      }
    });

    $('#vrap-back-board').addEventListener('click', () => {
      if (vrapEditingNum != null) {
        saveVrapEdits();
        vrapEditingNum = null;
        clearCart();         // empties cart + réduction, panel → empty
      }
      setVrapView('board');
    });

    /* keep "il y a X min" fresh while the board is on screen */
    setInterval(() => {
      if (mode === 'vrap' && vrapView === 'board' && document.body.classList.contains('is-unlocked')) {
        renderVrapBoard();
      }
    }, 25000);

    /* ═══════════════════════════════════════════════════════════════════════
       LE PONT · la commande du téléphone devient un ticket de cette caisse
       ═══════════════════════════════════════════════════════════════════════
       assets/orderpro-inbox.js relève déjà la file du serveur toutes les six
       secondes et sait l'afficher dans son propre panneau. Ce qu'il ne pouvait
       pas faire, c'est ENTRER : `kdsOrders`, `kdsPaint`, `renderVrapBoard` sont
       des déclarations locales de ce script · jamais posées sur `window` · donc
       un fichier séparé n'a aucun moyen de les atteindre. Le bouton
       « Accepter · envoyer en cuisine » POSTait l'état au serveur et s'arrêtait
       là : rien n'apparaissait sur l'écran cuisine, rien sur le tableau À
       emporter. Il disait vrai au serveur et faux au cuisinier.
       Ce pont est la porte manquante, et la SEULE : tout ce qui vient du
       téléphone passe par ici.

       Deux numéros, et il faut les garder distincts. `num` est le compteur
       local (kdsOrderSeq), dont dépendent la recherche par numéro et les clés
       du DOM ; `opNum` est le numéro que le SERVEUR a donné, c'est-à-dire le
       seul que le client connaisse et prononcera au comptoir. On affiche le
       second, on indexe sur le premier · sans quoi une commande client n°7 et
       une vente au comptoir n°7 se seraient écrasées l'une l'autre. */
    const opTickets = new Map();   // id serveur → ticket local
    let expiredOrders = [];        // refus récents du serveur, lecture seule (reprise)
    let archivedTakeawayScope = '';
    let archivedTakeawayIds = new Set();

    /* Ce que orderpro-inbox.js appelle à chaque tour de sondage. */
    window.KiwiCaisseKitchen = {
      /* `delta` = ce qui a changé depuis le dernier sondage (c'est le curseur
         `since` qui le décide) ; `all` = tout ce que la caisse connaît encore.
         La distinction n'est pas cosmétique : compter les commandes en attente
         sur le DELTA aurait éteint la pastille d'une table dès le sondage
         suivant, puisqu'une commande qui n'a pas bougé n'y figure plus · la
         table aurait clignoté six secondes puis se serait tue, avec la commande
         toujours en attente. Les sessions, elles, arrivent en instantané
         complet et se relisent telles quelles. */
      ingest(delta, all, sessions, closedSessions, expired) {
        let touched = false;
        /* ── LES MORTS NE PAIENT PLUS ─────────────────────────────────────
         * Le serveur expose ses refus récents (voir `expired` dans queue.js) :
         * un ticket local encore `held` dont le serveur dit « refusée » est
         * une commande morte que le TTL a tranchée. Sans ce deuil, elle
         * restait payable : on encaissait une commande que le serveur
         * refuserait (409), après avoir imprimé la cuisine en local. On
         * l'enterre donc ici, en le DISANT (numéro + reprise possible), et
         * jamais en silence. Un refus autoritaire retire aussi une commande
         * déjà connue en préparation ; il ne réécrit jamais son paiement. */
        try {
          const dead = new Set((expired || []).map(e => e && String(e.id || '')));
          if (dead.size) {
            for (let i = kdsOrders.length - 1; i >= 0; i--) {
              const t = kdsOrders[i];
              if (!t || !t.opId || !dead.has(String(t.opId))) continue;
              const gone = (expired || []).find(e => e && String(e.id || '') === String(t.opId));
              retireRejectedKitchenTicket(t);
              try { toast(`${ticketNo(t)} refusée ou annulée · retirée de la cuisine`); } catch (_) {}
              void gone;
              touched = true;
            }
            if (touched) { try { persistShift(); } catch (_) {} }
          }
          const freshExpired = (Array.isArray(expired) ? expired.slice(0, 50) : [])
            .filter(e => e && e.id && !dismissedExpiredIds.has(String(e.id)));
          if (JSON.stringify(freshExpired.map(e => e && e.id)) !== JSON.stringify(expiredOrders.map(e => e && e.id))) {
            expiredOrders = freshExpired;
            touched = true;
          }
        } catch (_) {}
        /* Qui est assis, et où une commande attend. Les deux viennent de la
           même réponse, donc le plan de salle ne se contredit jamais avec la
           file. On reconstruit les deux cartes à neuf plutôt que d'y ajouter :
           une table libérée doit s'éteindre, et un « ajout seulement » l'aurait
           laissée allumée pour le reste du service. */
        const seats = new Map();
        (sessions || []).forEach(s => {
          if (s.mode !== 'table' || !s.table) return;
          const k = tableKey(caisseTableId(s.table) || s.table);
          const localId = caisseTableId(s.table);
          if (localId && locallySettledVisit(localId, s.id)) {
            if (!recoveredPaidVisits.has(String(s.id))) {
              recoveredPaidVisits.add(String(s.id));
              document.dispatchEvent(new CustomEvent('kiwi-table-released', {
                detail: { table: localId, session: String(s.id), why: 'settle' },
              }));
            }
            return;
          }
          const closedAt = Number(tableClosedAt[k] || 0);
          const openTs = Number(s.opened_ts || 0);
          const move = phoneMovedVisits.get(String(s.id));
          // An older poll may still report the acknowledged visit at its source.
          if (move && move.from === k && move.to !== k && Number(s.seen_ts || 0) <= move.revision) return;
          const movedHere = move && move.to === k && move.closedAt === closedAt;
          // Si cette session a été ouverte à ou avant la fermeture/annulation locale de la table :
          if (!movedHere && closedAt > 0 && ((openTs > 0 && openTs <= closedAt) || (Date.now() - closedAt < 60000))) {
            if (openTs > 0 && openTs <= closedAt) {
              // The first kitchen relay can populate timerSession before the
              // floor poll supplies a seat. Once this visit is pruned, that
              // fallback must not resurrect it after phoneSeats is rebuilt.
              if (localId && tables[localId] && String(tables[localId].timerSession || '') === String(s.id)) {
                delete tables[localId].timerSession;
              }
              // Clore activement la session zombie côté serveur dans D1
              document.dispatchEvent(new CustomEvent('kiwi-table-released', {
                detail: { table: String(s.table), session: String(s.id || ''), why: 'prune-stale' },
              }));
            }
            return;
          }
          seats.set(k, { session: s.id, since: s.opened_ts, revision: Number(s.seen_ts) });
          /* S'asseoir depuis OrderPro réserve déjà réellement la table. Même
             avant l'acceptation du bon, le prochain tap doit ouvrir cette
             table et surtout pas recommencer par le nombre de couverts. */
          const id = caisseTableId(s.table);
          if (id && tables[id] && tables[id].status === 'khawya') {
            tables[id].status = 'ka-yaklo';
            resetTableTimer(tables[id]);
            touched = true;
          }
        });
        /* Install the current visit map BEFORE ingesting its changed orders.
           attachOrderProTable can then reject a stale order from an earlier
           visit to the same physical table. */
        const seatsChanged = !sameMap(seats, phoneSeats, (a, b) => a.session === b.session);
        phoneSeats.clear(); seats.forEach((v, k) => phoneSeats.set(k, v));
        /* Session closure is the durable settlement fact. It wins even when
           the shared floor document is busy and misses its best-effort close. */
        (closedSessions || []).forEach((closed) => {
          if (!closed || closed.mode !== 'table' || !closed.table) return;
          const id = caisseTableId(closed.table);
          if (!id || !tables[id]) return;
          const current = seats.get(tableKey(id));
          if (current && String(current.session) !== String(closed.id)) return;
          if (mode === 'order' && selectedId === id) return;
          if (billBelongsToOtherVisit(id, closed.id)) return;
          tables[id].status = 'khawya';
          tables[id].covers = 0;
          resetTableTimer(tables[id]);
          delete orders[id];
          delete tableOrders[id];
          delete tables[id].discount;
          delete tables[id].orderNo;
          if (selectedId === id) closeRightPanel();
          refreshTableNode(id);
          touched = true;
        });
        (delta || []).forEach(o => { opIngest(o); touched = true; });

        /* ── LA SECONDE CHANCE ────────────────────────────────────────────
         * `delta` ne présente une commande qu'UNE fois : c'est le curseur
         * `since` qui le décide. Or attachOrderProTable a le droit de refuser
         * · table absente du plan, session qui ne correspond pas, commande
         * antérieure à l'occupation. Un refus valait donc PERTE DÉFINITIVE :
         * la commande ne revenait jamais, et ses lignes n'entraient jamais
         * dans l'addition. Le client partait en ayant payé moins qu'il n'a
         * mangé, et rien ne le signalait.
         *
         * Le refus le plus fréquent n'est même pas un cas tordu : au tout
         * premier sondage après l'ouverture de la caisse, le plan de salle
         * n'est pas encore chargé, donc AUCUNE table ne résout · et tout ce
         * que ce tour-là présentait était perdu pour le service entier.
         *
         * On repasse donc sur `all` (ce que la caisse connaît encore, pas
         * seulement ce qui vient de changer) et on retente ce qui n'est pas
         * attaché. C'est sûr parce que l'attachement est idempotent : chaque
         * ligne porte le marqueur `<id de commande>:<rang>`, et une ligne déjà
         * présente est reconnue puis ignorée. Une commande refusée pour une
         * bonne raison sera refusée à nouveau, sans effet ; une commande
         * refusée pour une raison passagère rentre au tour suivant. */
        (all || []).forEach(o => {
          if (!o || o.mode !== 'table' || !o.table) return;
          if (o.channel === 'caisse' && !canRecoverCaisseTable(o)) return;
          if (o.paid || o.status === 'rejected') return;
          // Retry missing line markers too, not just entirely absent orders.
          /* Le plan de salle ne connaît pas cette table : renommée en plein
             service, ou pas encore chargée. On le DIT une fois · sans quoi
             c'est exactement le genre de perte qui ne se voit qu'au moment de
             l'addition · et on retentera au prochain tour. */
          if (!caisseTableId(o.table)) {
            const key = tableKey(o.table);
            if (!opUnmatchedTables.has(key)) {
              opUnmatchedTables.add(key);
              try { console.warn('[kiwi] commande sans table au plan de salle :', o.table, o.id); } catch (_) {}
              try { toast(`Table « ${o.table} » absente du plan de salle · commande non rattachée`, 6000); } catch (_) {}
            }
            return;
          }
          opUnmatchedTables.delete(tableKey(o.table));
          if (attachOrderProTable(o)) touched = true;
        });

        const pend = new Map();
        (all || []).forEach(o => {
          if (o.mode !== 'table' || o.status !== 'pending' || !o.table) return;
          const k = tableKey(caisseTableId(o.table) || o.table);
          pend.set(k, (pend.get(k) || 0) + 1);
        });

        const changed = seatsChanged || !sameMap(pend, phonePending, (a, b) => a === b);
        phonePending.clear(); pend.forEach((v, k) => phonePending.set(k, v));

        if (changed) { storeIsReal() ? renderRealGrid() : renderSalle(); }
        if (touched) {
          updateKdsCount();
          if (kdsEl.classList.contains('is-open')) kdsPaint();
          if (mode === 'vrap' && vrapView === 'board') renderVrapBoard();
        }
      },
      /* La caisse accepte une commande en salle : elle part en cuisine, au nom
         du serveur de cette table. */
      acceptTable(orderId) {
        const t = opTickets.get(orderId);
        const server = t ? t.server : '';
        try {
          if (window.KiwiOrderInbox && KiwiOrderInbox.setStatus) {
            KiwiOrderInbox.setStatus(orderId, 'accepted', { server });
          }
        } catch (_) {}
      },
      /* orderpro-inbox appelle ce pont uniquement après avoir obtenu la vraie
         transition pending → accepted. opIngest est idempotent sur opId : un
         bon déjà créé localement par le bouton de table ou l'encaissement est
         reconnu, jamais imprimé une seconde fois. */
      confirmAccepted(order) {
        if (!order || !order.id) return;
        /* This callback runs only on the caisse whose operator obtained the
           pending → accepted transition. It is therefore a local print action,
           not a passive remote-poll job requiring the hub lease. */
        opIngest(Object.assign({}, order, { status: 'accepted', localKitchenAction: true }));
      },
      checkoutOrder(orderId) {
        let remote = null;
        try {
          const orders = window.KiwiOrderInbox && KiwiOrderInbox.orders && KiwiOrderInbox.orders();
          remote = orders && orders[orderId];
        } catch (_) {}
        if (remote && (remote.paid || remote.status === 'rejected')) {
          toast('Commande déjà réglée ou annulée'); return false;
        }
        if (remote) opIngest(remote);
        const local = opTickets.get(orderId);
        if (remote && remote.mode === 'table') {
          const tableId = caisseTableId(remote.table);
          /* ── LA TABLE QUE LE PLAN NE CONNAÎT PAS ─────────────────────────
             Le serveur accepte, exprès, une table absente du plan : un QR
             imprimé avant une renumérotation, une étiquette « 2 » pour
             « Terrasse 2 », un restaurant qui n'a jamais dessiné sa salle. La
             commande part en cuisine, le client mange. Ici, on répondait
             « Table introuvable sur le plan » et il ne restait qu'Annuler : un
             repas servi qu'on ne pouvait plus encaisser. On l'encaisse donc au
             comptoir, comme une commande à emporter ; le paiement la clôt et
             ferme la visite de cette table (settleVrapPayment). */
          if (!tableId) {
            if (!local || !kdsOrders.includes(local) || local.paid || !vrapFinancialItems(local).length) {
              toast('Table absente du plan · envoyez d\'abord la commande en cuisine'); return false;
            }
            local.offPlan = true;
            local.type = 'takeaway';
            if (mode !== 'vrap') setMode('vrap');
            openVrapOrder(local.num);
            return vrapEditingNum === local.num && cart.length > 0;
          }
          if (remote.session && phoneSessionOf(tableId) !== String(remote.session)) {
            toast('Cette commande appartient à une autre visite'); return false;
          }
          const bill = generateOrder(tableId, tables[tableId]);
          if (!bill.length || !bill.every(l => Number.isFinite(l.total)) || bill.reduce((s, l) => s + l.total, 0) <= 0) {
            toast('Addition non disponible · actualisez la commande'); return false;
          }
          if (mode !== 'salle') setMode('salle');
          openTable(tableId);
          return true;
        }
        if (local && local.type === 'takeaway') {
          if (!kdsOrders.includes(local) || local.paid || local.pickedUp || !vrapFinancialItems(local).length) {
            toast('Commande indisponible pour encaissement'); return false;
          }
          if (mode !== 'vrap') setMode('vrap');
          openVrapOrder(local.num);
          return vrapEditingNum === local.num && cart.length > 0;
        }
        toast('Commande introuvable dans la caisse');
        return false;
      },
      printOrder(orderId) {
        const local = opTickets.get(orderId);
        if (local) {
          printKitchenTickets(local, local.items || [], { remote: false, force: true });
          toast('Impression du bon envoyée');
          return true;
        }
        let remote = null;
        try {
          const orders = window.KiwiOrderInbox && KiwiOrderInbox.orders && KiwiOrderInbox.orders();
          remote = orders && orders[orderId];
        } catch (_) {}
        if (remote) {
          opIngest(Object.assign({}, remote, { localKitchenAction: true }));
          const created = opTickets.get(orderId);
          if (created) {
            printKitchenTickets(created, created.items || [], { remote: false, force: true });
            toast('Impression du bon envoyée');
            return true;
          }
        }
        toast('Commande introuvable pour impression');
        return false;
      },
      sessionOf: phoneSessionOf,
      serverFor: serverNameFor,
    };

    /* ===========================================================
       === Persistence ===  (the shift survives a reload)
       =========================================================== */
    function kcStoreKey(slug) {
      const s = slug != null ? slug : currentMerchantSlug();
      return s ? ('kiwi-caisse-shift:' + s) : 'kiwi-caisse-shift';
    }
    const KC_STORE = {
      toString() { return kcStoreKey(); },
      valueOf() { return kcStoreKey(); },
      [Symbol.toPrimitive]() { return kcStoreKey(); },
    };
    let registerClosing = false;

    /* Un bon portant `opNum` vient du relais serveur. Les anciens instantanés
       n'ont pas tous gardé `opId`, mais ils ont gardé `opNum`. Une attente non
       acceptée expire après 30 minutes ; une préparation oubliée expire après
       six heures. Le snapshot local ne doit pas pouvoir ressusciter un bon que
       la file serveur a correctement laissé dans le service précédent. */
    function staleQueuedServerTicket(o, now) {
      if (!o || o.opNum == null) return false;
      if (o.opId && archivedTakeawaySet().has(String(o.opId))) return true;
      // Age is not cancellation or payment evidence. Keep active bills and
      // paid takeaway orders awaiting collection until a canonical terminal event.
      if (!o.pickedUp && (o.type === 'takeaway' || !o.paid)) return false;
      const at = new Date(o.sentAt).getTime();
      if (!Number.isFinite(at)) return false;
      const age = (now || Date.now()) - at;
      if (o.status === 'held') return age > 30 * 60 * 1000;
      return (o.status === 'new' || o.status === 'cooking') && age > 6 * 60 * 60 * 1000;
    }

    /* À QUEL commerçant appartient le service actuellement EN MÉMOIRE. Posé à
       l'ouverture et à la reprise, relu à chaque autosave. Sans lui, réappairer
       la caisse en cours de service laissait le journal de A en mémoire et le
       prochain autosave le réécrivait estampillé B : un enregistrement qui dit
       B en contenant A, et qui passe donc tous les contrôles au rechargement.
       Effacer le stockage à l'appairage (assets/caisse-pairing.js) ne suffit
       pas · cinq secondes plus tard il est reconstitué. */
    function currentMerchantSlug() {
      try { return (storePaired() || {}).merchant || ''; } catch (_) { return ''; }
    }
    /* The caisse owns the live table state. Geometry and assignments come from
       floorplan, but occupied / bill / paid are service facts and must travel
       back to every employee phone. A compact snapshot makes every transition
       observable, including paths (cash, card, split, cancel, waitlist) that do
       not share one click handler. The server diffs snapshots and keeps the
       resulting notification history. */
    let serviceFloorSignature = '';
    let serviceFloorPublishing = false;
    let serviceFloorSince = 0;
    let serviceFloorPolling = false;
    let serviceFloorPollQueued = false;
    const SERVICE_BILL_SYNC_VERSION = 4;
    const ORDER_BRIDGE_SYNC_VERSION = 2;
    const serviceFloorLegacyTables = new Set();
    const serviceFloorLocalVersion = Object.create(null);
    const serviceFloorRemoteVersion = Object.create(null);
    function serviceFloorSnapshot() {
      return Object.keys(tables).map((id) => ({
        table: String(id), status: String(tables[id].status || 'khawya'),
        covers: Math.max(0, Number(tables[id].covers) || 0),
        syncVersion: SERVICE_BILL_SYNC_VERSION,
        lines: (tableOrders[id] || []).filter((line) => !serviceFloorLegacyTables.has(String(id)) || line.sent === true).slice(0, 80).map((line) => ({
          key: String(line.orderProLine ? ('order:' + line.orderProLine) : (line.cloudKey || line.uid || line.id || '')), id: String(line.id || ''),
          name: String(line.name || ''), price: Math.max(0, Number(line.price) || 0),
          qty: Math.max(1, Number(line.qty) || 1), note: String(line.note || ''),
          sentQty: line.sent ? Math.max(1, Number(line.qty) || 1) : Math.max(0, Number(line.sentQty) || 0),
          opts: Array.isArray(line.opts) ? line.opts : [],
        })),
      })).sort((a, b) => a.table.localeCompare(b.table, undefined, { numeric: true }));
    }
    function publishServiceFloor() {
      if (operatorCaisseRequested() && !shiftOpenedAt) return;
      if (window.KiwiTillTenant?.mismatch()) return;
      if (serviceFloorPublishing || !storeIsReal()) return;
      const merchant = currentMerchantSlug();
      if (!merchant) return;
      const live = serviceFloorSnapshot();
      if (!live.length) return;
      const signature = JSON.stringify(live);
      if (signature === serviceFloorSignature) return;
      let before = [];
      try { before = JSON.parse(serviceFloorSignature || '[]'); } catch (_) { before = []; }
      const oldByTable = Object.create(null);
      before.forEach((state) => { oldByTable[state.table] = state; });
      const localAt = Date.now();
      live.forEach((state) => {
        const old = oldByTable[state.table];
        if (!old || old.status !== state.status || Number(old.covers || 0) !== state.covers
          || JSON.stringify(old.lines || []) !== JSON.stringify(state.lines || [])) {
          serviceFloorLocalVersion[state.table] = localAt;
        }
      });
      serviceFloorPublishing = true;
      fetch('/api/service/events', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant, snapshot: { tables: live } }),
      }).then((r) => {
        if (!r.ok) throw new Error('floor-sync-' + r.status);
        serviceFloorSignature = signature;
      }).catch(() => {}).finally(() => { serviceFloorPublishing = false; });
    }
    function pollEmployeeFloor() {
      /* A socket poke can arrive while the previous HTTP read is still in
         flight. Dropping that poke made the caisse wait for the eight-second
         live fallback even though the employee had already paid. Queue one
         immediate replay instead; one bit is enough because every read returns
         the complete latest table-state map. */
      if (serviceFloorPolling) { serviceFloorPollQueued = true; return; }
      if (!storeIsReal()) return;
      /* Lire la salle d'un autre commerce dans ce service mélangerait les
         deux : la réponse rattacherait ses tables aux additions d'ici. */
      if (window.KiwiTillTenant?.mismatch()) return;
      const merchant = currentMerchantSlug();
      if (!merchant) return;
      serviceFloorPolling = true;
      fetch('/api/service/events?merchant=' + encodeURIComponent(merchant) + '&role=caisse&since=' + serviceFloorSince, {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
      }).then((r) => r.ok ? r.json() : null).then((data) => {
        if (!data || !data.ok) return;
        serviceFloorSince = Number(data.now) || serviceFloorSince;
        if (merchant !== currentMerchantSlug()) return;
        if (shiftOpenedAt && document.body.classList.contains('is-unlocked') && !document.body.classList.contains('is-kitchen')) window.KiwiServiceRequests?.ingest(data, {
          merchant, notify: toast, refresh: pollEmployeeFloor,
          openTable: value => { const id = caisseTableId(value); if (id && tables[id]) openTable(id); },
        });
        else window.KiwiServiceRequests?.reset();
        if (data.locks && typeof data.locks === 'object') caisseTableLocks = data.locks;
        let changed = false;
        Object.keys(data.states || {}).forEach((key) => {
          const state = data.states[key] || {};
          if (state.source !== 'employee' && state.source !== 'guest') return;
          /* A brand-new till service must not resurrect the previous service's
             employee tables. Keep a 30-minute handover window so an employee
             order placed just before the till opens is still recovered. A
             restored till keeps its original shiftOpenedAt and therefore
             accepts every state from its own ongoing service. */
          const stateTs = Number(state.ts) || 0;
          const serviceCutoff = (shiftOpenedAt instanceof Date && !isNaN(shiftOpenedAt.getTime()))
            ? shiftOpenedAt.getTime() - 30 * 60 * 1000 : Date.now() - 12 * 60 * 60 * 1000;
          if (stateTs && stateTs < serviceCutoff) return;
          /* Older employee/caisse bills could contain the removed automatic
             menu generator. Never ingest one here: otherwise this caisse's
             four-second snapshot promotes the fake lines back into every
             employee phone. */
          if (Array.isArray(state.lines) && Number(state.syncVersion || 0) < SERVICE_BILL_SYNC_VERSION) return;
          const id = caisseTableId(state.table || key);
          if (!id || !tables[id] || !state.status) return;
          if (mode === 'order' && selectedId === id) return;
          /* Compare only server timestamps with server timestamps. The old
             non-terminal guard compared `state.ts` (Cloudflare's clock) with
             `serviceFloorLocalVersion` (this iPad's clock). An iPad even a few
             seconds ahead rejected Addition forever. The API now keeps every
             employee transition authoritative until this caisse echoes the
             exact state, so no client-clock arbitration belongs here. */
          const terminalEmployeeState = state.status === 'khawya' || state.status === 'khlass';
          const lastRemoteTs = Number(serviceFloorRemoteVersion[String(id)] || 0);
          if (stateTs && stateTs <= lastRemoteTs) return;
          const statusChanged = tables[id].status !== state.status;
          const terminalHadLocalBill = terminalEmployeeState
            && (!!orders[id] || Array.isArray(tableOrders[id]) && tableOrders[id].length > 0);
          if (state.status === 'bgha-ykhlass' && state.reopenSessionId
            && (!tables[id].timerSession || String(tables[id].timerSession) === String(state.reopenSessionId))
            && !(tableOrders[id] || []).length && !(orders[id] || []).length) {
            tables[id].reopenSessionId = String(state.reopenSessionId);
          } else if (terminalEmployeeState) delete tables[id].reopenSessionId;
          /* Remember even an already-matching free state. Otherwise opening a
             new party later would make that old close look new and close the
             freshly seated table. */
          serviceFloorRemoteVersion[String(id)] = Math.max(lastRemoteTs, stateTs);
          /* Employee snapshots synchronize OCCUPANCY, never the bill. Every
             sent employee line already travels through /api/order/queue, the
             same canonical ledger as caisse/KDS/OrderPro. Importing `lines`
             here created a second mutable copy of the bill; a later kitchen
             ready event could merge that copy back and manufacture products.
             Drafts stay on the employee phone until they are sent. */
          /* A terminal state also clears a stale local bill when occupancy is
             already free. Status equality must not skip that cleanup: this was
             the exact path that left the previous party's items in memory and
             attached the next party's order to the old bill. */
          if (!statusChanged && !terminalHadLocalBill) return;
          tables[id].status = state.status;
          tables[id].covers = state.status === 'khawya' ? 0 : Math.max(0, Number(state.covers) || tables[id].covers || 0);
          if (terminalEmployeeState) resetTableTimer(tables[id]);
          else if ((tableOrders[id] || []).length || (orders[id] || []).length) startTableTimer(id);
          serviceFloorLocalVersion[String(id)] = Number(state.ts) || Date.now();
          if (state.status === 'khawya' || state.status === 'khlass') {
            delete orders[id];
            delete tableOrders[id];
            delete tables[id].discount;
            if (selectedId === id) closeRightPanel();
          }
          refreshTableNode(id);
          changed = true;
        });
        if (changed) {
          /* Force one terminal echo back to the service-event store. That echo
             is the acknowledgement which releases the server-side settlement
             barrier and allows a genuinely new visit to open on this table. */
          serviceFloorSignature = '';
          try { persistShift(); } catch (_) {}
          setTimeout(publishServiceFloor, 0);
        }
      }).catch(() => {}).finally(() => {
        serviceFloorPolling = false;
        if (serviceFloorPollQueued) {
          serviceFloorPollQueued = false;
          pollEmployeeFloor();
        }
      });
    }
    let shiftMerchant = currentMerchantSlug();
    /* La caisse change de commerce par simple appairage, page ouverte
       (dépairer, le pavé « réappairer », le passage ?pair=1). Le service en
       mémoire reste celui de A pendant que le slug dit déjà autre chose.
       assets/till-tenant.js tient la question et le verrou ; ce crochet lui dit
       à qui appartient le service ouvert, chez qui la caisse est appairée, et
       comment écrire le service avant de le mettre de côté. */
    window.__kiwiTillTenantHook = {
      owner: () => (shiftOpenedAt ? (shiftMerchant || '') : ''),
      here: currentMerchantSlug,
      persist: () => persistShift(),
    };
    /* Les appels passent par window.KiwiTillTenant (mismatch, stamp) plutôt
       que par des fonctions d'ici : sans le module (un banc qui extrait
       quelques fonctions de cette page), ils ne font simplement rien. */
    document.addEventListener('kiwi-paired', () => {
      const here = currentMerchantSlug();
      if (!here) return;
      if (shiftOpenedAt) {
        /* Retour chez le commerce du service : l'autosave reprend, et la copie
           mise de côté n'a plus de raison d'être. */
        if (shiftMerchant === here) {
          persistShift._warned = false;
          try { persistShift(); } catch (_) {}
          try { window.KiwiTillTenant?.drop(here); } catch (_) {}
        }
        return;
      }
      /* Rien d'ouvert en mémoire (la page a été rechargée chez l'autre
         commerce entre-temps) : le service mis de côté pour CE commerce revient
         par la reprise normale, au rechargement. */
      try { if (window.KiwiTillTenant?.hasQuarantine(here)) location.reload(); } catch (_) {}
    });

    function persistShift() {
      if (registerClosing || !shiftOpenedAt) return;
      /* Le service en mémoire n'est plus celui de ce comptoir : on n'écrit pas.
         Rien de précieux n'est perdu · les ventes déjà encaissées sont dans la
         file de synchronisation, estampillées de LEUR commerçant au moment de
         la vente (live-link.js postSale), et le serveur refuse déjà de les
         classer ailleurs. */
      if (shiftMerchant !== currentMerchantSlug()) {
        /* Le refus est volontaire, mais il était muet : à partir de cet instant
           TOUTES les écritures de service échouent en silence, cinq secondes
           après l'autre, et rien à l'écran ne dit que la caisse a cessé de
           sauvegarder. Une ligne dans la console, une seule fois · pas un toast
           qui reviendrait toutes les cinq secondes · pour que le diagnostic soit
           possible au lieu d'être deviné. */
        if (!persistShift._warned) {
          persistShift._warned = true;
          try { console.warn('[kiwi] service ouvert chez « ' + shiftMerchant + ' », caisse appairée chez « ' + currentMerchantSlug() + ' » : sauvegarde du service suspendue.'); } catch (_) {}
        }
        return;
      }
      try {
        localStorage.setItem(KC_STORE, JSON.stringify({
          v: 1,
          savedAt: Date.now(),
          /* À QUI est ce service. Le blob ne portait aucun commerçant, et la
             relecture ne comparait donc rien : une caisse appairée chez A puis
             réappairée chez B rouvrait le service de A sous le nom de B. Ce
             n'est pas cosmétique · le rapport de journée se construit avec
             `sales: journal`, c'est-à-dire le journal RESTAURÉ de A, et avec le
             slug résolu depuis kiwiLiveMerchant, c'est-à-dire B. Le chiffre de
             A, ses tickets, son mix de paiement et ses lignes par caissier
             partaient donc dans le rapport de B · en local, puis sur le serveur,
             poussés par saveProvisional toutes les 90 secondes. Une tablette
             prêtée d'un commerce à l'autre suffisait. */
          merchant: shiftMerchant,
          serviceBillSyncVersion: SERVICE_BILL_SYNC_VERSION,
          orderBridgeSyncVersion: ORDER_BRIDGE_SYNC_VERSION,
          openedAt: shiftOpenedAt.toISOString(),
          openedBy: shiftOpenedBy,
          openingFloat: openingFloat,
          terminalCardTotal: typeof terminalCardTotal === 'number' ? terminalCardTotal : null,
          journal: journal,
          cashMovements: cashMovements,
          shift: shift,
          currentCashier: currentCashier,
          posteOpenedAt: posteOpenedAt ? posteOpenedAt.toISOString() : null,
          posteOpeningFloat: posteOpeningFloat,
          handovers: handovers,
          /* Offline settlement closes the physical table before the server can
             acknowledge it. Persist that close tombstone so a reload/reconnect
             cannot reattach an older kitchen row and charge it again. */
          tableClosedAt: tableClosedAt,
          /* A transfer may legitimately move an older visit onto a table that
             has a close tombstone. Keep the acknowledgement alongside the
             tombstone so reload does not mistake that moved visit for a ghost. */
          phoneMovedVisits: Array.from(phoneMovedVisits.entries()),
          tables: tables,
          /* ── ON N'ENREGISTRE PAS CE QUE LA FILE SAIT DÉJÀ ──────────────────
           * Les lignes venues du relais portent le marqueur `orderProLine`.
           * Les garder dans l'instantané du service en faisait une DEUXIÈME
           * mémoire de l'addition, à côté de la file · et un instantané ne
           * périme pas. C'est de là que venaient les additions fantômes au
           * démarrage : on ouvrait la caisse et une table portait déjà une
           * note que personne n'avait passée, ou une note déjà encaissée.
           *
           * Elles se reconstruisent seules au premier sondage : la file les
           * rend, et le rattrapage de `ingest` les rattache par leur marqueur.
           * Ce qu'on garde ici, c'est ce que la file NE connaît pas · les
           * lignes tapées au comptoir et pas encore envoyées en cuisine. Un
           * brouillon mérite de survivre à un F5 ; une addition déjà écrite
           * ailleurs n'a pas à être recopiée. */
          tableOrders: (function () {
            const kept = {};
            Object.keys(tableOrders).forEach(function (tid) {
              const local = (tableOrders[tid] || []).filter(function (l) { return !l.orderProLine; });
              if (local.length) kept[tid] = local;
            });
            return kept;
          })(),
          orders: orders,
          /* Une part déjà payée est de l'argent réel. Le flux de split vivait
             seulement dans une Map en mémoire : F5 l'oubliait et remettait la
             note entière à encaisser. */
          tableSplits: Array.from(tableSplits.entries()),
          vrapSplits: Array.from(vrapSplits.entries()),
          vrapSplit: vrapSplits.get('new') || null,
          cart: cart,
          vrapDiscount: vrapDiscount,
          vrapEditingNum: vrapEditingNum,
          /* Le board cuisine, chez un VRAI commerçant seulement. Les lignes
             envoyées portent un drapeau `sent` qui, lui, était déjà persisté :
             sans le board en face, un simple rechargement au comptoir effaçait
             les tickets tout en interdisant de les renvoyer · la cuisine perdait
             la commande pour de bon. La démo garde son board éphémère, réensemé
             à chaque chargement (kdsSeed), sinon les quinze commandes d'exemple
             se dupliqueraient à chaque visite. */
          kdsOrders: storeIsReal() ? kdsOrders.filter(o => !staleQueuedServerTicket(o)).map(o => Object.assign({}, o, {
            sentAt: o.sentAt instanceof Date ? o.sentAt.toISOString() : o.sentAt,
          })) : undefined,
          kdsOrderSeq: storeIsReal() ? kdsOrderSeq : undefined,
        }));
        /* Le service est écrit : la caisse 2027 lit ce oui (sync.saved_here) ;
           un stockage plein rend non (sync.not_saved, sync.screen_only). */
        return true;
      } catch (e) { return false; }
    }
    function migrateLegacyShift() {
      try {
        const legacyRaw = localStorage.getItem('kiwi-caisse-shift');
        if (!legacyRaw) return;
        const legacy = JSON.parse(legacyRaw);
        if (!legacy || legacy.v !== 1) return;
        const targetSlug = legacy.merchant || currentMerchantSlug();
        if (!targetSlug) return;
        const targetKey = 'kiwi-caisse-shift:' + targetSlug;
        if (!localStorage.getItem(targetKey)) {
          localStorage.setItem(targetKey, legacyRaw);
        }
        localStorage.removeItem('kiwi-caisse-shift');
      } catch (_) {}
    }
    function clearPersistedShift() {
      try {
        localStorage.removeItem(KC_STORE);
        localStorage.removeItem('kiwi-caisse-shift');
      } catch (e) {}
    }
    function loadPersistedShift() {
      migrateLegacyShift();
      try {
        let raw = localStorage.getItem(KC_STORE);
        /* Le service mis de côté au réappairage (assets/till-tenant.js) revient
           quand la caisse retrouve son commerce. take() ne rend que la copie de
           CE commerce, de moins de douze heures, et la retire. */
        if (!raw) {
          const kept = window.KiwiTillTenant && window.KiwiTillTenant.take(currentMerchantSlug());
          if (kept) { localStorage.setItem(KC_STORE, kept); raw = kept; }
        }
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (!d || d.v !== 1 || !d.openedAt) return null;
        if (Date.now() - (d.savedAt || 0) > 12 * 3600 * 1000) { clearPersistedShift(); return null; }
        return d;
      } catch (e) { return null; }
    }
    /* Un reçu relu depuis le stockage : le service sauvegardé (restoreShift)
       ou l'étagère des ventes retenues (heldSales). Les deux passent par ici
       pour qu'une vente ressorte de l'une ou de l'autre avec les MÊMES champs. */
    function reviveJournalEntry(e) {
      const entry = {
        id: e.id, time: new Date(e.time), label: e.label,
        amount: e.amount, method: e.method, ref: e.ref,
      };
      if (e.kind)            entry.kind     = e.kind;      // 'refund'
      if (e.refundOf)        entry.refundOf = e.refundOf;
      if (e.refundOfId)      entry.refundOfId = e.refundOfId;
      if (e.refunded)        entry.refunded = true;
      if (e.refundedAmount != null) entry.refundedAmount = money(e.refundedAmount);
      if (e.reason)          entry.reason   = e.reason;
      if (e.voided)          entry.voided   = true;
      if (e.voidConfirmed)   entry.voidConfirmed = true;
      if (e.voidAuthority)   entry.voidAuthority = String(e.voidAuthority).slice(0, 32);
      if (e.voidTs != null)  entry.voidTs   = Number(e.voidTs);
      if (e.voidAt != null)  entry.voidAt   = Number(e.voidAt);
      if (e.tip)             entry.tip      = e.tip;       // pourboire
      if (e.lines)           entry.lines    = e.lines;     // itemised receipt
      if (e.cashier)         entry.cashier  = e.cashier;   // ringing cashier
      /* Journal-only recovery must replay the payment as it was captured.
         Do not infer a visit, split or discount from today's mutable order;
         legacy receipts keep absent metadata absent. The API validates it. */
      if (e.serverSaleId)    entry.serverSaleId = e.serverSaleId;
      if (e.reopenSnapshot && typeof e.reopenSnapshot === 'object') entry.reopenSnapshot = e.reopenSnapshot;
      if (e.visitClosed === true) entry.visitClosed = true;
      ['orderId', 'table', 'session', 'split', 'settlementKind', 'amountCents', 'grossAmountCents',
        'discountAmountCents', 'discountReason', 'actorId', 'saleSyncPending', 'saleSyncError', 'saleHeldLocal'].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(e, key)) entry[key] = e[key];
      });
      if (e.refundActor && typeof e.refundActor === 'object') {
        entry.refundActor = {
          id: String(e.refundActor.id || '').slice(0, 96), name: String(e.refundActor.name || '').slice(0, 80),
          role: String(e.refundActor.role || '').slice(0, 80), approval: String(e.refundActor.approval || '').slice(0, 1400),
        };
      }
      if (e.refundSynced) entry.refundSynced = true;
      if (e.refundSyncNeedsApproval) entry.refundSyncNeedsApproval = true;
      if (e.refundSyncStatus) entry.refundSyncStatus = String(e.refundSyncStatus).slice(0, 24);
      if (e.refundLedgerReversed) entry.refundLedgerReversed = true;
      if (e.refundRejectedStatus != null) entry.refundRejectedStatus = Number(e.refundRejectedStatus) || 0;
      if (e.refundRejectedAt) entry.refundRejectedAt = Number(e.refundRejectedAt) || 0;
      if (e.refundReconciliation) entry.refundReconciliation = String(e.refundReconciliation).slice(0, 32);
      if (e.cashHandedOut) entry.cashHandedOut = true;
      if (e.cashHandedOutAt) entry.cashHandedOutAt = Number(e.cashHandedOutAt) || 0;
      if (e.refundRecoveryRequestedAt) entry.refundRecoveryRequestedAt = Number(e.refundRecoveryRequestedAt) || 0;
      if (e.channel)         entry.channel  = e.channel;   // dining / takeaway / OrderPro
      if (e.origin)          entry.origin   = e.origin;    // caisse / employee / OrderPro
      /* Le reçu figé au moment de la vente. Cette boucle recopie champ par
         champ (elle ne fait pas Object.assign), donc tout ce qui n'est pas
         nommé ici est PERDU au rechargement · et une caisse recharge tous les
         jours. Sans cette ligne, réimprimer le ticket d'hier ne ressortait
         plus l'enseigne et les mentions de l'époque : exactement ce que le
         figeage est censé garantir. */
      if (e.rc)              entry.rc       = e.rc;
      /* Le commerce où la vente a été encaissée : sans lui, postSale ne peut
         pas refuser de la poster ailleurs après un rechargement. */
      if (e.merchant)        entry.merchant = String(e.merchant).slice(0, 96);
      return entry;
    }
    function restoreShift(d) {
      shiftOpenedAt = new Date(d.openedAt);
      shiftOpenedBy = d.openedBy || '';
      /* `|| 500` transformait un fond de 0 en 500 à la reprise du poste : le
         tiroir ouvert vide se voyait alors réclamer 500 MAD d'écart à la
         clôture. Depuis que la saisie libre accepte 0, il faut le distinguer
         d'une valeur absente. */
      openingFloat  = (Number.isFinite(d.openingFloat) && d.openingFloat >= 0) ? d.openingFloat : 500;
      terminalCardTotal = (d.terminalCardTotal !== null && d.terminalCardTotal !== undefined &&
        Number.isFinite(Number(d.terminalCardTotal)) && Number(d.terminalCardTotal) >= 0)
        ? money(Number(d.terminalCardTotal)) : null;
      journal.length = 0;
      (d.journal || []).forEach(e => {
        const entry = reviveJournalEntry(e);
        // Une ligne d'avant ce champ prend le commerce du service entier.
        if (!entry.merchant && d.merchant) entry.merchant = String(d.merchant).slice(0, 96);
        journal.push(entry);
      });
      cashMovements.length = 0;
      (d.cashMovements || []).forEach(m => cashMovements.push({
        id: m.id, time: new Date(m.time), type: m.type, amount: m.amount, reason: m.reason,
        actorId: m.actorId, actorName: m.actorName,
      }));
      if (d.shift) {
        shift.discounts  = d.shift.discounts;
        shift.refunds    = d.shift.refunds;
        shift.tablesPaid = d.shift.tablesPaid;
        /* Postes enregistrés avant que le rapport ne compte les remises : on ne
           sait pas combien il y en avait, mais un montant non nul en implique au
           moins une. Mieux vaut « 1 remise · 95 MAD » que « 0 remise · 95 MAD »,
           qui se lit comme un bug. */
        shift.discountsCount = (d.shift.discountsCount != null)
          ? d.shift.discountsCount : (d.shift.discounts > 0 ? 1 : 0);
        shift.cancels = d.shift.cancels || 0;
      }
      if (d.currentCashier && d.currentCashier.name) {
        currentCashier = {
          id:   d.currentCashier.id   || 'othmane',
          name: d.currentCashier.name,
          role: d.currentCashier.role || 'Caissier',
        };
      }
      Object.keys(tableClosedAt).forEach(key => delete tableClosedAt[key]);
      if (d.tableClosedAt && typeof d.tableClosedAt === 'object') {
        const oldestUseful = Date.now() - 12 * 3600 * 1000;
        Object.keys(d.tableClosedAt).forEach(key => {
          const at = Number(d.tableClosedAt[key] || 0);
          if (at >= oldestUseful && at <= Date.now() + 60000) tableClosedAt[tableKey(key)] = at;
        });
      }
      phoneMovedVisits.clear();
      if (Array.isArray(d.phoneMovedVisits)) {
        d.phoneMovedVisits.forEach(pair => {
          if (!Array.isArray(pair) || pair.length !== 2 || !pair[0] || !pair[1]) return;
          const move = pair[1];
          if (!move.from || !move.to) return;
          phoneMovedVisits.set(String(pair[0]), {
            from: tableKey(move.from), to: tableKey(move.to),
            revision: Number(move.revision || 0), closedAt: Number(move.closedAt || 0),
          });
        });
      }
      posteOpenedAt     = d.posteOpenedAt ? new Date(d.posteOpenedAt) : shiftOpenedAt;
      posteOpeningFloat = (typeof d.posteOpeningFloat === 'number') ? d.posteOpeningFloat : openingFloat;
      handovers.length  = 0;
      (d.handovers || []).forEach(h => handovers.push({
        id: h.id, time: new Date(h.time),
        fromName: h.fromName, toName: h.toName,
        posteOpenedAt: new Date(h.posteOpenedAt),
        expected: h.expected, counted: h.counted, ecart: h.ecart,
        confirmedById: h.confirmedById || '', confirmedByName: h.confirmedByName || '',
      }));
      if (d.tables) Object.keys(d.tables).forEach(id => {
        if (tables[id]) Object.assign(tables[id], d.tables[id]);
      });
      if (d.tableOrders) {
        Object.keys(tableOrders).forEach(k => delete tableOrders[k]);
        Object.assign(tableOrders, d.tableOrders);
      }
      if (d.orders) {
        Object.keys(orders).forEach(k => delete orders[k]);
        Object.assign(orders, d.orders);
      }
      /* The payment receipt is the durable fact. A crash after recording cash
         but before markPaid() must not restore that same bill as payable. The
         order number/session ties this cleanup to this visit, not a later party
         that happens to use the same physical table. */
      Object.keys(tables).forEach(id => {
        const paid = paidReceiptForCurrentTable(id);
        if (!paid) return;
        tables[id].status = 'khawya';
        tables[id].covers = 0;
        resetTableTimer(tables[id]);
        delete tables[id].orderNo;
        delete tables[id].discount;
        delete tableOrders[id];
        delete orders[id];
      });
      tableSplits.clear();
      if (Array.isArray(d.tableSplits)) {
        d.tableSplits.forEach((pair) => {
          if (!Array.isArray(pair) || pair.length !== 2 || !pair[0] || !pair[1]) return;
          tableSplits.set(String(pair[0]), pair[1]);
        });
      }
      vrapSplits.clear();
      if (Array.isArray(d.vrapSplits)) {
        d.vrapSplits.forEach((pair) => {
          if (!Array.isArray(pair) || pair.length !== 2 || !pair[0] || !pair[1] || !Array.isArray(pair[1].parts)) return;
          vrapSplits.set(String(pair[0]), pair[1]);
        });
      } else if (d.vrapSplit && Array.isArray(d.vrapSplit.parts)) {
        /* Shift saved before per-order splits: one slot, keyed by its order. */
        vrapSplits.set(vrapSplitKey(d.vrapSplit.orderNum), d.vrapSplit);
      }
      if (Array.isArray(d.cart)) cart = d.cart;
      vrapDiscount = d.vrapDiscount || null;
      vrapEditingNum = d.vrapEditingNum != null ? d.vrapEditingNum : null;
      /* Le board cuisine. `sentAt` revient en texte du JSON alors que tout
         l'écran cuisine calcule un âge dessus (kdsElapsed lit .getTime()) :
         sans cette reprise en Date, la première peinture jetterait. */
      if (Array.isArray(d.kdsOrders) && storeIsReal()) {
        kdsOrders.length = 0;
        d.kdsOrders.forEach((o) => {
          if (!o || staleQueuedServerTicket(o) || isDemoSeedOrder(o)) return;
          const at = new Date(o.sentAt);
          kdsOrders.push(Object.assign({}, o, { sentAt: isNaN(at.getTime()) ? new Date() : at }));
        });
        if (typeof d.kdsOrderSeq === 'number') kdsOrderSeq = d.kdsOrderSeq;
        updateKdsCount();
      }
    }
    function signalTillServiceReady() {
      window.KiwiTillServiceReady = currentMerchantSlug();
      document.dispatchEvent(new CustomEvent('kiwi:caisse-service-ready'));
    }

    function enterShellDirectly() {
      const pin = $('#pin-screen');    if (pin) pin.style.display = 'none';
      const ci  = $('#clockin-screen'); if (ci)  ci.style.display = 'none';
      const greet = document.querySelector('[data-kiwi-greet]'); if (greet) greet.remove();
      document.body.classList.add('is-unlocked');
      renderSalle();
      /* Slice D · même atterrissage qu'après l'animation : le registre. */
      setMode('vrap');
      setVrapView('builder');
      /* A restored draft must show on the tiles too, not only in the bill. */
      try { renderMenu(); renderCart(); } catch (_) {}
      renderShiftStats();
      renderCashierCard();
      if (window.lucide) lucide.createIcons();
      signalTillServiceReady();
    }

    /* On load · if a recent shift was saved, resume straight into the shell */
    (function () {
      // A support URL must first present the explicit opening screen. Keep the
      // merchant's saved shift intact; never replay it merely by inspecting.
      if (operatorCaisseRequested()) return;
      const saved = loadPersistedShift();
      if (!saved) return;
      // A REAL / paired store must never surface DEMO shift data. A device that once
      // ran the pitch demo (or dev residue) persists a shift whose journal carries
      // seeded 'seed-*' entries (cashier "Othmane N.", café tables). On a real store,
      // STRIP every seed-* entry · FILTERING, not all-or-nothing: the earlier guard
      // used `.every(seed)`, so a single genuine 'sale-*' entry let all 47 demo seeds
      // ride along and the demo shift restored (the bug this hardens). Keep only
      // genuine entries; if none survive, discard the shift so the caisse opens clean
      // (0 transactions). When seeds are dropped, also reset the seed-derived
      // aggregates (tablesPaid + tables/orders) so the counters recompute from the
      // real journal. The next 5s autosave then rewrites the stored shift seed-free
      // (self-healing). The demo path (storeIsReal false) is untouched · verbatim.
      /* ── D'ABORD : est-ce le service de CE commerçant ? ────────────────────
         Avant toute autre question. Le filtre `seed-` qui suit protège la démo
         du réel ; il ne dit rien du réel contre le réel. Une caisse appairée
         chez A, puis réappairée chez B, restaurait le service de A · journal,
         tables, additions ouvertes, tickets cuisine · et le rapport de journée
         suivant partait chez B avec l'argent de A dedans, jusque sur le serveur
         (cf. la note dans persistShift).

         Le stockage est désormais compartimenté par commerçant (KC_STORE).
         Si le snapshot rechargé n'appartient pas à cet établissement, on ne le
         restaure pas, mais on ne l'efface surtout pas : ré-appairer la caisse
         ne doit pas détruire le service ouvert de l'autre commerce. */
      try {
        const here = (function () {
          try { return (storePaired() || {}).merchant || ''; } catch (_) { return ''; }
        })();
        /* Non appairée, la caisse n'a pas de commerce : elle n'en reprend le
           service d'aucun. Seul un blob sans commerce (démo, local) passe. */
        if (String(saved.merchant || '') !== here) {
          return;
        }
      } catch (_) {}
      try {
        if (storeIsReal()) {
          const originalJournal = saved.journal || [];
          const genuine = originalJournal.filter((e) => String(e && e.id || '').indexOf('seed-') !== 0);
          const hadDemoSeeds = genuine.length !== originalJournal.length;
          /* Un service réel peut parfaitement n'avoir encore AUCUNE vente : une
             table est ouverte, sa commande est partie en cuisine, mais personne
             n'a encore payé. L'ancien `if (!genuine.length)` supprimait alors
             tout le snapshot au F5 · table, addition et lignes · simplement parce
             que le journal d'encaissement était vide. On ne jette un journal vide
             que lorsqu'il est devenu vide APRÈS retrait de vraies lignes de démo.
             Zéro ligne au départ est un service en cours, pas une contamination. */
          if (hadDemoSeeds && !genuine.length) { localStorage.removeItem(KC_STORE); return; }
          if (hadDemoSeeds) {
            saved.journal = genuine;
            saved.tables = {}; saved.tableOrders = {}; saved.orders = {}; saved.kdsOrders = [];
            if (saved.shift) saved.shift.tablesPaid = 0;
          }
        }
      } catch (_) {}
      if (storeIsReal() && Number(saved.serviceBillSyncVersion || 0) < SERVICE_BILL_SYNC_VERSION) {
        Object.keys(saved.tableOrders || {}).forEach((id) => {
          serviceFloorLegacyTables.add(String(id));
          /* v3 imported the employee snapshot as a second bill. Those rows
             are identifiable by their employee uid; remove them once on
             restore while preserving genuine cashier lines and canonical
             orderPro/employee tickets. */
          saved.tableOrders[id] = (saved.tableOrders[id] || []).filter((line) =>
            !String(line && line.uid || '').startsWith('employee-'));
        });
      }
      if (storeIsReal() && Number(saved.orderBridgeSyncVersion || 0) < ORDER_BRIDGE_SYNC_VERSION) {
        /* Earlier bridge versions persisted every employee/OrderPro row under
           the physical table number, without the visit/session that owned it.
           Drop bridge rows once; the queue immediately reattaches only rows
           belonging to the currently open table session. Cashier-authored
           lines have no orderProLine marker and are deliberately preserved. */
        Object.keys(saved.tableOrders || {}).forEach((id) => {
          saved.tableOrders[id] = (saved.tableOrders[id] || []).filter((line) =>
            !String(line && line.orderProLine || ''));
        });
        saved.orderBridgeSyncVersion = ORDER_BRIDGE_SYNC_VERSION;
      }
      /* ── LA REPRISE NE DOIT PAS POUVOIR TUER LA CAISSE ────────────────────
       * `restoreShift` puis `enterShellDirectly` étaient appelés à nu, au
       * premier niveau du script en ligne. Ces deux fonctions relisent un
       * instantané et PEIGNENT tout de suite avec (renderSalle, setMode,
       * updateKdsCount) : un seul champ inattendu dans le snapshot · une ligne
       * de table sans nom, un ticket cuisine à moitié écrit, un split d'une
       * forme oubliée · et l'exception remontait hors de cette IIFE.
       *
       * Ce qui se trouve EN DESSOUS ne s'exécute alors jamais : l'autosave, le
       * beforeunload, le sondage de salle, tous les écouteurs. La page reste
       * blanche, sans un mot, et la caisse est morte pour de bon — c'est
       * exactement ce qu'a vu Pasta Corner à 00h55 (ticket #0069). Puis on
       * rouvre un service, et le premier autosave écrase l'instantané : les
       * commandes de la soirée disparaissent pour de vrai.
       *
       * Un instantané qu'on ne sait pas relire est un problème de support, pas
       * une raison de perdre le service. On en met donc une copie à l'abri, on
       * note que CE service-là fait tomber la caisse, et on recharge une fois :
       * la mémoire repart propre et le commerçant retrouve au moins une caisse
       * qui fonctionne. Le drapeau est en sessionStorage · s'il ne peut pas
       * s'écrire, on ne recharge pas, pour qu'aucune boucle ne soit possible. */
      const RESTORE_FAIL_FLAG = 'kiwiCaisseRestoreFailed';
      const restoreStamp = String(saved.savedAt || saved.openedAt || '');
      let alreadyFailed = '';
      try { alreadyFailed = sessionStorage.getItem(RESTORE_FAIL_FLAG) || ''; } catch (_) {}
      if (alreadyFailed && alreadyFailed === restoreStamp) {
        setTimeout(() => toast('Service non restauré · il est conservé, préviens le support', 'danger'), 800);
        return;
      }
      try {
        restoreShift(saved);
        try { adoptHeldSalesIntoJournal(); } catch (_) {}
        enterShellDirectly();
        setTimeout(() => toast('Service restauré · ' + journal.length + ' transactions'), 500);
      } catch (err) {
        try { console.error('[kiwi] reprise du service impossible', err); } catch (_) {}
        /* La copie de secours d'abord : elle doit exister AVANT que quoi que ce
           soit puisse réécrire KC_STORE. Elle ne remplace pas l'original, elle
           le double · un service rouvert écrase l'un, jamais l'autre. */
        let stashed = false;
        try {
          const raw = localStorage.getItem(KC_STORE);
          if (raw) { localStorage.setItem(KC_STORE + ':rescue', raw); stashed = true; }
        } catch (_) {}
        let flagged = false;
        try { sessionStorage.setItem(RESTORE_FAIL_FLAG, restoreStamp); flagged = true; } catch (_) {}
        if (flagged) { try { location.reload(); return; } catch (_) {} }
        setTimeout(() => toast(stashed
          ? 'Service non restauré · il est conservé, préviens le support'
          : 'Service non restauré · préviens le support', 'danger'), 800);
      }
    })();

    /* Autosave · covers refresh, tab close and crashes.
       Le rapport provisoire suit le même battement mais à son propre rythme
       (90 s, cf. saveProvisional) : il traverse le réseau, lui, et le pousser
       toutes les cinq secondes n'apprendrait rien de plus au tableau de bord. */
    window.addEventListener('beforeunload', persistShift);
    /* Held sales replay on the same beat, shift open or not: a sale from a
       closed shift still has to reach the queue. */
    setInterval(() => { persistShift(); try { saveProvisional(); } catch (_) {} try { retryHeldSales(); } catch (_) {} }, 5000);
    setTimeout(() => { try { paintHeldSales(); retryHeldSales(); } catch (_) {} }, 1500);
    setInterval(publishServiceFloor, 4000);
    /* Employee actions are interactive caisse state, not background reporting.
       Four seconds left a paid/closed table visibly open long enough for the
       cashier to reuse it or refresh the whole app. Read employee writes every
       second; publishing the full caisse snapshot can stay on its quieter
       cadence. The in-flight guard above prevents overlapping requests.

       La seconde reste la cadence de référence · c'est elle qui tient quand il
       n'y a pas de socket, et c'est le cas partout tant que le concentrateur
       n'est pas déployé. Quand une socket EST ouverte, un serveur qui libère une
       table réveille la caisse tout de suite : le sondage n'est plus la façon
       d'apprendre le changement, seulement le filet de sécurité, et il peut
       s'espacer. Il revient à la seconde de lui-même dès la coupure · la
       cadence se relit à chaque tour, on n'a rien à défaire. */
    const FLOOR_POLL_FAST = 1000;
    const FLOOR_POLL_LIVE = 8000;
    let employeeFloorTimer = null;
    /* L'abonnement se retente à chaque tour, et c'est voulu : live-socket.js est
       chargé en `defer` (donc après ce script), une caisse peut être appairée
       bien après le premier rendu, et elle peut CHANGER de commerçant sans
       qu'on repasse par une connexion. Un appel de plus quand tout est déjà en
       place ne coûte rien · KiwiLiveSocket.on ressort aussitôt si la salle est la
       bonne, et rouvre proprement si le slug a changé. */
    function joinFloorSocket() {
      try {
        if (!window.KiwiLiveSocket || !storeIsReal()) return;
        const slug = currentMerchantSlug();
        if (slug) KiwiLiveSocket.on(slug, 'caisse', pollEmployeeFloor);
      } catch (_) {}
    }
    function scheduleEmployeeFloor() {
      if (employeeFloorTimer) clearTimeout(employeeFloorTimer);
      const live = window.KiwiLiveSocket && KiwiLiveSocket.live();
      employeeFloorTimer = setTimeout(() => {
        joinFloorSocket();
        try { pollEmployeeFloor(); } catch (_) {}
        scheduleEmployeeFloor();
      }, live ? FLOOR_POLL_LIVE : FLOOR_POLL_FAST);
    }
    scheduleEmployeeFloor();
    setTimeout(publishServiceFloor, 800);
    setTimeout(pollEmployeeFloor, 250);

    /* ---------- Démo, dit à l'écran ----------
       Une caisse de démo montre des tables, des serveurs et un chiffre du jour
       plausibles. Le seul « DÉMO LIVE » vivait dans la barre du haut, masquée
       depuis : rien ne disait que ce n'était pas un vrai service. Un badge à
       côté du titre, tant que la caisse n'est ni un vrai compte ni appairée. */
    (function demoBadge() {
      function isDemo() {
        try { return !(window.KiwiEnv?.isReal?.() || window.KiwiCaissePairing?.isPaired?.()); } catch (_) { return false; }
      }
      function words() {
        const lang = String(document.documentElement.lang || 'fr');
        if (lang.startsWith('ar')) return ['تجريبي', 'بيانات نموذجية، ليست خدمة حقيقية'];
        if (lang.startsWith('en')) return ['Demo', 'Sample data, not a real service'];
        return ['Démo', 'Données d’exemple, pas un vrai service'];
      }
      function paint() {
        const demo = isDemo(), [label, hint] = words();
        document.querySelectorAll('.main-head .main-title').forEach((title) => {
          let badge = title.querySelector(':scope > .demo-badge');
          if (!demo) { if (badge) badge.remove(); return; }
          if (!badge) { badge = document.createElement('span'); badge.className = 'demo-badge'; title.appendChild(badge); }
          if (badge.textContent !== label) badge.textContent = label;
          badge.title = hint;
          badge.setAttribute('aria-label', label + ' · ' + hint);
        });
      }
      paint();
      document.addEventListener('kiwi-paired', paint);
      new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    })();

    /* ---------- Lucide first paint ---------- */
    document.addEventListener('DOMContentLoaded', () => {
      if (window.lucide) lucide.createIcons();
    });
    window.addEventListener('load', () => {
      if (window.lucide) lucide.createIcons();
    });
