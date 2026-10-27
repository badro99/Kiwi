    function kdsStations() {
      if (IS_DEMO) return KDS_STATIONS_DEMO;
      return carteState.stations.length ? carteState.stations : [KDS_STATION_SOLO];
    }

    /* La cuisine · le poste qui reçoit tout ce qu'aucune catégorie n'a envoyé
       ailleurs. Elle est nommée dans la carte (kitchenId) plutôt que déduite de
       l'ordre de la liste : un patron qui réordonne ses onglets ne doit pas
       détourner sa carte sans le savoir. Le premier poste reste le secours,
       pour une carte écrite avant que ce réglage existe. */
    function kdsKitchenId() {
      const list = kdsStations();
      if (!IS_DEMO) {
        const want = carteState.kitchenId;
        if (want && list.some(s => s.id === want)) return want;
      }
      return list[0].id;
    }
    /* Où part CE plat. Une seule réponse pour toute la caisse : le poste de sa
       catégorie s'il existe encore, la table par catégorie en démo, la cuisine
       sinon. Un plat n'atterrit jamais dans un filtre fantôme. */
    function kdsStationFor(m) {
      const list = kdsStations();
      const want = m && m.station;
      if (want && list.some(s => s.id === want || String(s.name).toLowerCase().trim() === String(want).toLowerCase().trim())) {
        const found = list.find(s => s.id === want || String(s.name).toLowerCase().trim() === String(want).toLowerCase().trim());
        return found ? found.id : want;
      }
      if (m && m.cat && carteState.cats) {
        const catObj = carteState.cats.find(c => c.id === m.cat || String(c.name).toLowerCase().trim() === String(m.cat).toLowerCase().trim());
        if (catObj && catObj.station) {
          const found = list.find(s => s.id === catObj.station || String(s.name).toLowerCase().trim() === String(catObj.station).toLowerCase().trim());
          if (found) return found.id;
        }
      }
      if (IS_DEMO && m && KDS_CAT_STATION[m.cat]) return KDS_CAT_STATION[m.cat];
      return kdsKitchenId();
    }
    /* Le patron a supprimé ou renommé un poste : refaire la barre, et rendre la
       vue « Toutes » si le filtre actif pointait vers un poste disparu · sinon
       l'écran cuisine resterait vide sans dire pourquoi. */
    function kdsRepaintStations() {
      if (kdsActiveStation !== 'all' && !kdsStations().some(s => s.id === kdsActiveStation)) kdsActiveStation = 'all';
      const bar = $('#kit-bar');
      if (bar) bar.innerHTML = kdsStationBar();
    }

    function kdsHasRecipe(name) {
      const r = KDS_RECIPES[name];
      return !!(r && r.ingredients && r.ingredients.length);
    }
    function isDemoSeedOrder(o) {
      if (!o) return false;
      if (o.demoSeed) return true;
      if (o.opId) return false;
      const s = KDS_DEMO_SEED.find(x => x.num === o.num);
      if (!s || !Array.isArray(o.items)) return false;
      return o.items.map(i => i && i.n).join('|') === s.items.map(i => i.n).join('|');
    }

    function kdsSeed() {
      // A REAL / paired store opens with an EMPTY order board · no demo orders
      // (Méchoui, Pastilla poulet, Thé à la menthe…). They arrive from real sales.
      if (storeIsReal()) return;
      KDS_DEMO_SEED.forEach(s => kdsOrders.push({
        demoSeed: true, num: s.num, type: s.type, table: s.table || null, code: s.code || null,
        status: s.status, readyAt: s.readyAt || null,
        items: s.items.map(i => Object.assign({}, i, { stations: i.stations.slice() })),
        sentAt: new Date(Date.now() - s.ago * 1000),
        paid: !!s.paid, pickedUp: !!s.pickedUp, pickedUpAt: s.pickedUpAt || null, total: s.total || 0,
      }));
    }

    function kdsEsc(v) {
      return String(v == null ? '' : v).replace(/[&<>"]/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }
    function kdsElapsed(o) { return Math.max(0, Math.floor((Date.now() - o.sentAt.getTime()) / 1000)); }
    function kdsUrgency(s) { return s < 480 ? 'ok' : s < 900 ? 'warn' : 'over'; }
    function kdsFmt(s) { return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
    function kdsNowHM() { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
    function kdsEnsureFormulaParents(o) {
      if (!o || !Array.isArray(o.items)) return [];
      const missing = new Map();
      o.items.forEach((item) => {
        if (!item || item.kind !== 'formula-part' || !item.formulaUid) return;
        if (o.items.some(parent => parent && parent.kind === 'formula' && parent.formulaUid === item.formulaUid)) return;
        if (!missing.has(item.formulaUid)) missing.set(item.formulaUid, item);
      });
      missing.forEach((child, formulaUid) => {
        const name = child.formulaName || '';
        const menuItem = menuLineFind(item => String(item.name || '') === String(name));
        if (!name) return;
        const inheritedVisuals = Array.isArray(child.visuals) ? child.visuals.slice() : [];
        o.items.unshift({
          q: child.q || 1, n: name, p: menuItem ? menuItem.price : 0,
          note: '', paperNote: '', visuals: inheritedVisuals,
          kind: 'formula', formulaUid, formulaName: name,
          stations: [kdsStationFor(menuItem)],
        });
        if (inheritedVisuals.length) {
          o.items.forEach((part) => {
            if (part && part.kind === 'formula-part' && part.formulaUid === formulaUid) part.visuals = [];
          });
        }
      });
      return o.items;
    }
    function kdsMatches(o, sid) { return sid === 'all' || kdsEnsureFormulaParents(o).some(i => i.stations.includes(sid)); }
    function kdsViewStatus(o, sid) {
      if (o.status === 'ready') return 'ready';
      const allItems = kdsEnsureFormulaParents(o);
      const lines = sid === 'all' ? allItems : allItems.filter(i => i.stations.includes(sid));
      if (!lines.length) return o.status;
      if (sid !== 'all' && lines.every(i => i.stationReady === true)) return 'ready';
      if (lines.every(i => i.stationAccepted === true)) return 'cooking';
      return o.status === 'cooking' && sid === 'all' ? 'cooking' : 'new';
    }
    function kdsGroup(status) {
      return kdsOrders.filter(o => kdsViewStatus(o, kdsActiveStation) === status && kdsMatches(o, kdsActiveStation))
        .slice().sort((a, b) => kdsElapsed(b) - kdsElapsed(a));
    }

    function kdsTypeChip(o) {
      if (o.type === 'glovo')    return `<span class="kit-type glovo">Glovo · ${kdsEsc(o.code)}</span>`;
      if (o.type === 'yassir')   return `<span class="kit-type yassir">Yassir · ${kdsEsc(o.code)}</span>`;
      if (o.type === 'takeaway') return `<span class="kit-type takeaway">À emporter</span>`;
      /* Le serveur de la table, sur le ticket. La brigade avait la table mais
         jamais le nom, donc « c'est pour qui, la 7 ? » se criait à travers la
         cuisine à chaque service. L'affectation existe sur le plan de salle
         (tables[id].server) ; elle est posée sur la commande au moment où elle
         est acceptée, pour qu'elle reste vraie même si la table change de main
         ensuite. */
      const sv = o.server ? ` <span class="kit-server">· ${kdsEsc(o.server)}</span>` : '';
      return `<span class="kit-type dineIn">Table ${kdsEsc(o.table)}${o.course === 'suite' ? ' · Suite' : ''}${sv}</span>`;
    }

    function kdsOrderInner(o, withEye) {
      kdsEnsureFormulaParents(o);
      const el = kdsElapsed(o), u = kdsUrgency(el);
      const viewStatus = kdsViewStatus(o, kdsActiveStation);
      const isNew = viewStatus === 'new', isReady = viewStatus === 'ready';
      const items = o.items.map(i => {
        const off = kdsActiveStation !== 'all' && !i.stations.includes(kdsActiveStation);
        const note = (i.note || '').trim();
        const visuals = (Array.isArray(i.visuals) ? i.visuals : []).filter(v => v && (v.name || v.label || v.cn)).map(v => ({
          emoji: v.emoji || v.e || '',
          name: v.name || v.label || v.cn,
        }));
        const visualHtml = visuals.length ? `<span class="kit-visuals">${visuals.map(v => `<span class="kit-visual">${v.emoji ? `<span class="kit-visual-emoji">${kdsEsc(v.emoji)}</span>` : ''}<span>${kdsEsc(v.name)}</span></span>`).join('')}</span>` : '';
        const hasRec = kdsHasRecipe(i.n);
        return `<li class="kit-item${off ? ' kit-item-off' : ''}${hasRec ? ' has-recipe' : ''}"${hasRec ? ` data-kit-recipe="${kdsEsc(i.n)}"` : ''}><span class="kit-q">${i.q}</span><span class="kit-nm">${kdsEsc(i.n)}${visualHtml}${note ? `<span class="kit-inote">${KDS_SVG.note}<span>${kdsEsc(note)}</span></span>` : ''}</span>${hasRec ? KDS_SVG.book : ''}</li>`;
      }).join('');
      /* Un bon prêt se rappelle depuis la vue agrandie (l'historique y mène) :
         « Prête » tapé par erreur au coup de feu ne doit pas faire disparaître
         un plat qui n'est pas fait. Pas sur une carte de colonne, et jamais
         sur une commande déjà remise au client. */
      const act = isReady ? (withEye || o.pickedUp ? ''
          : `<button class="kit-act kit-act-recall" data-kit-recall="${o.num}">Rappeler en cuisine</button>`)
        : isNew ? `<button class="kit-act kit-act-accept" data-kit-accept="${o.num}">Accepter</button>`
        : `<button class="kit-act kit-act-ready" data-kit-ready="${o.num}">${KDS_SVG.check}Prête</button>`;
      const eye = withEye ? `<button class="kit-eye" data-kit-eye="${o.num}" aria-label="Agrandir #${o.num}">${KDS_SVG.eye}</button>` : '';
      const topRight = isReady
        ? `<span class="kit-served-at">${KDS_SVG.check}${kdsEsc(o.readyAt || '')}</span>`
        : `<span class="kit-timer ${u}">${KDS_SVG.clock}<span class="kit-timer-v">${kdsFmt(el)}</span></span>`;
      return `
        <div class="kit-order-top">
          <span class="kit-order-num">${ticketNo(o)}</span>
          <div class="kit-order-tr">${topRight}${eye}</div>
        </div>
        <div class="kit-order-meta">
          ${kdsTypeChip(o)}
          <span class="kit-status">${isReady ? (o.pickedUp ? 'Servie' : 'Prête') : isNew ? 'Nouvelle' : 'En préparation'}</span>
        </div>
        <ul class="kit-items">${items}</ul>
        ${Array.isArray(o.following) && o.following.length && !isReady ? `<div class="kit-following">À suivre · ${o.following.map(i => `${i.q}× ${kdsEsc(i.n)}`).join(', ')}</div>` : ''}
        ${act}`;
    }

    function kdsOrderCard(o) {
      const u = kdsUrgency(kdsElapsed(o));
      return `<div class="kit-order ${kdsViewStatus(o, kdsActiveStation) === 'new' ? 'is-new' : 'is-cooking'}${u === 'over' ? ' is-late' : ''}" data-kit-num="${o.num}">${kdsOrderInner(o, true)}</div>`;
    }

    function kdsHistoryRow(o) {
      /* `ticketNo(o)`, et non `#${o.num}` : l'historique était le seul endroit
         qui affichait encore le compteur LOCAL. Une commande qui porte un
         numéro serveur · celles du téléphone, et depuis le relais cuisine
         toutes les autres · s'y retrouvait donc sous un numéro que personne
         d'autre ne connaît, alors que la carte juste au-dessus, l'écran de la
         cuisine et le client en annonçaient un troisième. */
      return `<button class="kit-hrow" data-kit-eye="${o.num}" aria-label="Agrandir ${ticketNo(o)}">
        <span class="kit-hrow-num">${ticketNo(o)}</span>
        ${kdsTypeChip(o)}
        <span class="kit-hrow-time">${KDS_SVG.check}Prête ${kdsEsc(o.readyAt || '')}</span>
        <span class="kit-hrow-eye">${KDS_SVG.eye}</span>
      </button>`;
    }

    function kdsEmpty(msg) {
      return `<div class="kit-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><span>${kdsEsc(msg)}</span></div>`;
    }

    function kdsStationBar() {
      const btn = (id, dot, label) => {
        const count = kdsOrders.filter(o => kdsViewStatus(o, id) !== 'ready' && kdsMatches(o, id)).length;
        return `<button class="kit-station ${kdsActiveStation === id ? 'on' : ''}" data-kit-st="${id}"><i style="background:${dot};"></i><span>${kdsEsc(label)}</span><span class="kit-station-ct">${count}</span></button>`;
      };
      const list = kdsStations();
      /* Un seul poste ne se filtre pas : « Toutes » et « Cuisine » afficheraient
         rigoureusement la même chose. On garde la barre pour le compteur. */
      return (list.length > 1 ? btn('all', 'var(--ink)', 'Toutes') : '') + list.map(s => btn(s.id, s.raw, s.name)).join('');
    }

    function updateKdsCount() {
      const el = $('#kds-count');
      // `held` = commande client à emporter, pas encore payée : elle est sur le
      // tableau À emporter mais la cuisine ne l'a pas encore, donc elle ne doit
      // pas gonfler le compteur de l'écran cuisine.
      if (el) el.textContent = String(kdsOrders.filter(o => o.status !== 'ready' && o.status !== 'held').length);
    }

    /* Le numéro QUE LE CLIENT CONNAÎT. Toute commande restaurant relayée reçoit
       le compteur simple et hebdomadaire du serveur ; pendant le bref instant
       hors ligne avant sa réponse, on garde le compteur local en repli. */
    function orderServerInitials(name) {
      const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return '';
      return ((parts[0][0] || '') + (parts.length > 1 ? (parts[parts.length - 1][0] || '') : '')).toUpperCase();
    }
    /* ── UN NUMÉRO LOCAL N'EST PAS UN NUMÉRO ──────────────────────────────
     * Hors ligne, le relais ne peut pas attribuer le numéro canonique, et le
     * bon sortait sur le papier avec le compteur LOCAL du comptoir — un « 64 »
     * qui ressemble en tout point à un numéro de serveur. Au retour du réseau
     * la commande recevait son vrai numéro, disons 3 : à partir de là le
     * papier, la cuisine et la caisse désignaient trois choses différentes.
     * Un numéro provisoire porte donc sa marque, « L », qu'aucun numéro
     * serveur ne peut prendre. Il ne prétend pas être ce qu'il n'est pas, et
     * il redevient le vrai numéro dès que celui-ci arrive. */
    function ticketNo(o) {
      if (o && o.opNum == null && o.provisionalNumber) return 'L' + String(o.num);
      if (o && o.opNum != null) {
        const n = String(o.opNum);
        if (o.opChannel === 'kiwi') {
          const employeePrefix = orderServerInitials(o.server);
          if (employeePrefix) return employeePrefix + '-' + n;
          return (o.type === 'takeaway' ? 'OPD-' : 'OP-') + n;
        }
        return n;
      }
      return String(o.num);
    }
