
    function kdsPaint() {
      /* Une caisse laissée ouverte toute la nuit ne refait pas un premier pull
         complet. Purger aussi le tableau déjà en mémoire, pas seulement le
         snapshot restauré au prochain rechargement. */
      for (let i = kdsOrders.length - 1; i >= 0; i--) {
        if (staleQueuedServerTicket(kdsOrders[i])) {
          const ticket = kdsOrders[i];
          kdsOrders.splice(i, 1);
          if (ticket.opId && opTickets.get(ticket.opId) === ticket) opTickets.delete(ticket.opId);
        }
      }
      $('#kit-bar').innerHTML = kdsStationBar();
      $('#kit-history-toggle').innerHTML =
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 2.5-6.2"/><path d="M3 4v4h4"/><path d="M12 8v4.5l3 1.8"/></svg><span>Historique</span><span class="kit-htg-ct">${kdsGroup('ready').length}</span>`;
      const newList = kdsGroup('new'), cookList = kdsGroup('cooking'), readyList = kdsGroup('ready');
      if (kdsKitOn()) { kdsKitPaint(newList, cookList, readyList); updateKdsCount(); return; }
      $('#kit-new').innerHTML =
        `<div class="kit-col-head"><span>Nouvelles</span><span class="kit-col-ct">${newList.length}</span></div>`
        + `<div class="kit-col-stack">${newList.length ? newList.map(kdsOrderCard).join('') : kdsEmpty('Aucune nouvelle commande')}</div>`;
      $('#kit-cook').innerHTML =
        `<div class="kit-col-head"><span>En préparation</span><span class="kit-col-ct">${cookList.length}</span></div>`
        + `<div class="kit-grid3">${cookList.length ? cookList.map(kdsOrderCard).join('') : kdsEmpty('Aucune commande en préparation')}</div>`;
      /* Ce volet liste les bons PRÊTS (`kdsGroup('ready')`), chaque ligne dit
         « Prête 14:20 » : l'intitulé « Servies aujourd'hui » annonçait une
         remise au client que la caisse ne sait pas, elle, constater. */
      $('#kit-history-inner').innerHTML =
        `<div class="kit-col-head"><span>Prêtes aujourd'hui</span><span class="kit-col-ct">${readyList.length}</span><button class="kit-history-x" data-kit-history-toggle aria-label="Fermer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`
        + `<div class="kit-history-rows">${readyList.length ? readyList.map(kdsHistoryRow).join('') : kdsEmpty('Aucune commande prête pour l\'instant')}</div>`;
      updateKdsCount();
    }
    function kkt(k, a) { return String(window.KiwiKit.t(k, a)).replace(/[\u2066-\u2069]/g, ''); }
    function kdsKitOn() {
      if (kdsKit) return true;
      if (!window.KiwiKdsBoard || !window.KiwiKit) return false;
      const shell = (title, extra) => `<div class="kit-col-head"><span>${kdsEsc(title)}</span><span class="kit-col-ct" data-kit-ct>0</span>${extra || ''}</div><div class="kit-lane-box"></div>`;
      $('#kit-new').innerHTML = shell(kkt('kds.new'));
      $('#kit-cook').innerHTML = shell(kkt('kds.preparing'));
      $('#kit-history-inner').innerHTML = shell(kkt('kds.ready'), `<button class="kit-history-x" data-kit-history-toggle aria-label="${kdsEsc(kkt('action.close'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`);
      kdsKit = !!window.KiwiKdsBoard.mount({
        stacks: { new: $('#kit-new .kit-lane-box'), cook: $('#kit-cook .kit-lane-box'), pass: $('#kit-history-inner .kit-lane-box') },
        columns: { new: '1', cook: 'auto', pass: '1' },
        fit: { new: 'none', cook: 'none', pass: 'none' },
        surface: false,
        act: kdsKitAct,
      });
      return kdsKit;
    }
    function kdsKitTicket(o, lane) {
      const items = kdsEnsureFormulaParents(o).map(i => ({
        qty: String(i.q || 1),
        name: i.n,
        tag: i.kind === 'formula-part' ? (i.formulaName || '') : '',
        mods: (Array.isArray(i.visuals) ? i.visuals : []).filter(v => v && (v.name || v.label || v.cn)).map(v => String(v.name || v.label || v.cn)),
        note: String(i.note || '').trim(),
        off: kdsActiveStation !== 'all' && !i.stations.includes(kdsActiveStation),
        recipe: kdsHasRecipe(i.n),
      }));
      const chips = [];
      let source;
      if (o.type === 'glovo' || o.type === 'yassir') source = { kind: 'delivery', label: (o.type === 'glovo' ? 'Glovo' : 'Yassir') + (o.code ? ' ' + o.code : '') };
      else if (o.type === 'takeaway') source = { kind: 'takeaway', label: kkt('kds.source.takeaway') };
      else {
        source = { kind: 'table', label: kkt('kds.source.table', { table: String(o.table == null ? '' : o.table) }) };
        if (o.course === 'suite') chips.push(kkt('kds.suite'));
        if (o.server) chips.push(String(o.server));
      }
      const tk = { id: String(o.num), number: ticketNo(o), minutes: Math.floor(kdsElapsed(o) / 60), source, chips, items };
      if (lane === 'pass') { tk.doneAt = o.readyAt || ''; tk.serve = false; tk.recall = !o.pickedUp; }
      else if (Array.isArray(o.following) && o.following.length) {
        tk.following = kkt('kds.following', { items: o.following.map(i => `${i.q}× ${i.n}`).join(', ') });
      }
      return tk;
    }
    function kdsKitPaint(newList, cookList, readyList) {
      const ct = (sel, n) => { const el = $(sel + ' [data-kit-ct]'); if (el) el.textContent = String(n); };
      ct('#kit-new', newList.length); ct('#kit-cook', cookList.length); ct('#kit-history-inner', readyList.length);
      window.KiwiKdsBoard.paint({
        new: newList.map(o => kdsKitTicket(o, 'new')),
        cook: cookList.map(o => kdsKitTicket(o, 'cook')),
        pass: readyList.map(o => kdsKitTicket(o, 'pass')),
      });
    }
    function kdsKitAct(action, id, value) {
      const num = Number(id);
      if (action === 'start') kdsAccept(num);
      else if (action === 'ready') kdsReady(num);
      else if (action === 'recall') kdsRecall(num);
      else if (action === 'recipe') {
        const o = kdsOrders.find(x => x.num === num);
        const item = o && value && value.item != null ? kdsEnsureFormulaParents(o)[value.item] : null;
        if (item) kdsOpenRecipe(item.n);
      }
    }

    function kdsAccept(num) {
      const o = kdsOrders.find(x => x.num === num);
      if (!o || kdsViewStatus(o, kdsActiveStation) !== 'new') return;
      const station = kdsActiveStation === 'all' ? '' : kdsActiveStation;
      o.items.forEach(i => {
        if (!station || i.stations.includes(station)) i.stationAccepted = true;
      });
      if (o.items.length && o.items.every(i => i.stationAccepted === true)) o.status = 'cooking';
      kdsPaint();
      opPush(o, 'cooking', station ? { station } : {});
    }
    function kdsReady(num) {
      const o = kdsOrders.find(x => x.num === num);
      if (!o || kdsViewStatus(o, kdsActiveStation) === 'ready') return;
      const station = kdsActiveStation === 'all' ? '' : kdsActiveStation;
      if (station) {
        o.items.forEach(i => { if (i.stations.includes(station)) i.stationReady = true; });
        if (o.items.length && o.items.every(i => i.stationReady === true)) o.status = 'ready';
      } else {
        o.items.forEach(i => { i.stationReady = true; });
        o.status = 'ready';
      }
      if (o.status === 'ready') o.readyAt = kdsNowHM();
      kdsPaint();
      if (o.status === 'ready' && o.type === 'takeaway') renderVrapBoard();
      // Le client apprend que c'est prêt sur son propre téléphone, sans avoir
      // rien à rafraîchir : c'est tout l'intérêt d'avoir posé la commande là.
      opPush(o, 'ready', station ? { station } : {});
      toast(station && o.status !== 'ready'
        ? `${kdsStations().find(s => s.id === station)?.name || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Poste')} · ${ticketNo(o)} prêt`
        : `Commande ${ticketNo(o)} prête`);
    }

    /* ── RAPPELER UN BON MARQUÉ PRÊT PAR ERREUR ───────────────────────────
       Le serveur refuse `ready → accepted` en transition ordinaire : le rappel
       est un geste nommé (`recall`), journalisé, et marqué sur les lignes
       (`recalledAt`) pour que les autres écrans le suivent. Ici on le montre
       tout de suite, et on le défait si le serveur ne le confirme pas (bon
       servi entre-temps, réseau tombé) : l'écran ne doit pas mentir. */
    function kdsRecall(num) {
      const o = kdsOrders.find(x => x.num === num);
      if (!o || o.pickedUp || kdsViewStatus(o, kdsActiveStation) !== 'ready') return;
      const station = kdsActiveStation === 'all' ? '' : kdsActiveStation;
      const before = { status: o.status, readyAt: o.readyAt,
        ready: o.items.map(i => i.stationReady), accepted: o.items.map(i => i.stationAccepted) };
      const wasReady = o.status === 'ready';
      o.items.forEach(i => {
        if (!station || i.stations.includes(station)) { i.stationReady = false; i.stationAccepted = true; }
        else if (wasReady) i.stationReady = true;
      });
      o.status = 'cooking';
      o.readyAt = null;
      /* Une échéance plutôt qu'un drapeau : un instantané sauvé pendant le vol
         et rechargé ne doit pas geler ce bon pour toujours. */
      o.recallPendingUntil = Date.now() + 30000;
      kdsPaint();
      if (o.type === 'takeaway') renderVrapBoard();
      toast(`${ticketNo(o)} rappelée en cuisine`);
      Promise.resolve(opPush(o, 'recall', station ? { station } : {})).then((j) => {
        o.recallPendingUntil = 0;
        if (j && j.ok) {
          o.recallSeen = Math.max(Number(o.recallSeen) || 0,
            ...(Array.isArray(j.lines) ? j.lines : []).map(l => Number(l && l.recalledAt) || 0));
          return;
        }
        if (!o.opId) return;
        o.status = before.status;
        o.readyAt = before.readyAt;
        o.items.forEach((i, k) => { i.stationReady = before.ready[k]; i.stationAccepted = before.accepted[k]; });
        kdsPaint();
        if (o.type === 'takeaway') renderVrapBoard();
        if (!j) toast(`Rappel de ${ticketNo(o)} non confirmé · réessayez`);
        else if (j.httpStatus === 409 && j.error === 'bad-transition') toast(`${ticketNo(o)} est déjà servie`);
      }).catch(() => { o.recallPendingUntil = 0; });
    }

    function kdsOpenZoom(o) {
      document.querySelectorAll('.kit-zoom-backdrop').forEach(b => b.remove());
      const bd = document.createElement('div');
      bd.className = 'kit-zoom-backdrop';
      bd.innerHTML = `<div class="kit-zoom" data-kit-num="${o.num}">${kdsOrderInner(o, false)}</div>`;
      document.body.appendChild(bd);
      requestAnimationFrame(() => bd.classList.add('in'));
      let closing = false;
      const close = () => {
        if (closing) return;
        closing = true;
        bd.classList.remove('in');
        setTimeout(() => bd.remove(), 300);
      };
      bd.addEventListener('click', (e) => {
        const acc = e.target.closest('[data-kit-accept]');
        if (acc) { kdsAccept(Number(acc.dataset.kitAccept)); close(); return; }
        const rdy = e.target.closest('[data-kit-ready]');
        if (rdy) { kdsReady(Number(rdy.dataset.kitReady)); close(); return; }
        const rcl = e.target.closest('[data-kit-recall]');
        if (rcl) { kdsRecall(Number(rcl.dataset.kitRecall)); close(); return; }
        const rec = e.target.closest('[data-kit-recipe]');
        if (rec) { kdsOpenRecipe(rec.dataset.kitRecipe); return; }
        if (!e.target.closest('.kit-zoom')) close();
      });
    }

    /* Recipe popup · opens when cuisinier taps a dish on a ticket. Shows
     * ingredients (qty + name) and a one-line prep note. The "fingertip
     * recipe" pattern that lets new staff prepare any plate without
     * memorising the menu. */
    function kdsOpenRecipe(dishName) {
      document.querySelectorAll('.kit-recipe-backdrop').forEach(b => b.remove());
      const r = KDS_RECIPES[dishName];
      const bd = document.createElement('div');
      bd.className = 'kit-recipe-backdrop';
      let body;
      if (!r) {
        body = `
          <div class="kit-recipe-empty">
            ${KDS_SVG.book}
            <div class="kit-recipe-empty-t">Recette pas encore définie</div>
            <div class="kit-recipe-empty-b">Demandez au chef de la compléter dans Menu › Recettes pour la voir ici.</div>
          </div>`;
      } else {
        const yld = r.yield || 1;
        const rows = r.ingredients.map(ing =>
          `<li class="kit-recipe-ing"><span class="kit-recipe-ing-q">${kdsEsc(ing.q)}</span><span class="kit-recipe-ing-n">${kdsEsc(ing.n)}</span></li>`
        ).join('');
        body = `
          <div class="kit-recipe-meta">
            <span class="kit-recipe-yield">Rendement · ${yld} portion${yld > 1 ? 's' : ''}</span>
          </div>
          <div class="kit-recipe-section">
            <div class="kit-recipe-section-t">Ingrédients</div>
            <ul class="kit-recipe-ings">${rows}</ul>
          </div>
          ${r.prep ? `
            <div class="kit-recipe-section">
              <div class="kit-recipe-section-t">Préparation</div>
              <div class="kit-recipe-prep">${kdsEsc(r.prep)}</div>
            </div>
          ` : ''}
          <div class="kit-recipe-foot">Tapez sur un plat pour réafficher sa recette à tout moment.</div>`;
      }
      bd.innerHTML = `
        <div class="kit-recipe" role="dialog" aria-labelledby="kit-recipe-title">
          <div class="kit-recipe-head">
            <div>
              <div class="kit-recipe-eyebrow">Recette · par portion</div>
              <h3 id="kit-recipe-title" class="kit-recipe-title">${kdsEsc(dishName)}</h3>
            </div>
            <button class="kit-recipe-close" data-kit-recipe-close aria-label="Fermer">${KDS_SVG.close}</button>
          </div>
          <div class="kit-recipe-body">${body}</div>
        </div>`;
      document.body.appendChild(bd);
      requestAnimationFrame(() => bd.classList.add('in'));
      let closing = false;
      const close = () => {
        if (closing) return;
        closing = true;
        bd.classList.remove('in');
        setTimeout(() => bd.remove(), 260);
      };
      bd.addEventListener('click', (e) => {
        if (e.target.closest('[data-kit-recipe-close]') || !e.target.closest('.kit-recipe')) close();
      });
    }

    function kdsTick() {
      if (!kdsEl.classList.contains('is-open')) return;
      if (kdsKit) {
        window.KiwiKdsBoard.retime(id => { const o = kdsOrders.find(x => x.num === Number(id)); return o ? Math.floor(kdsElapsed(o) / 60) : 0; });
        return;
      }
      document.querySelectorAll('.kit-order, .kit-zoom').forEach(card => {
        const o = kdsOrders.find(x => x.num === Number(card.dataset.kitNum));
        if (!o || o.status === 'ready') return;
        const el = kdsElapsed(o), u = kdsUrgency(el);
        const v = card.querySelector('.kit-timer-v');
        const tEl = card.querySelector('.kit-timer');
        if (v) v.textContent = kdsFmt(el);
        if (tEl) tEl.className = `kit-timer ${u}`;
        if (card.classList.contains('kit-order')) card.classList.toggle('is-late', u === 'over');
      });
    }

    function isKdsOff() {
      return isFeatureOff('kds');
    }

    function openKds() {
      if (isKdsOff()) {
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Écran cuisine désactivé pour cet établissement'));
        return;
      }
      kdsPaint();
      kdsEl.classList.add('is-open');
      if (window.lucide) lucide.createIcons();
      clearInterval(kdsTimer);
      kdsTimer = setInterval(kdsTick, 1000);
    }
    function closeKds() {
      kdsEl.classList.remove('is-open');
      clearInterval(kdsTimer);
      kdsTimer = null;
      document.querySelectorAll('.kit-zoom-backdrop').forEach(b => b.remove());
    }
