
    /* À QUELLE note. Le client est attaché à une addition précise, pas au
       comptoir : passer de la mesa 3 à la mesa 7 avec une fiche encore
       accrochée créditerait le passage à la mauvaise personne. On étiquette
       donc l'attache avec son contexte, et on la lâche dès qu'il change. */
    function saleContextKey() {
      try { return (mode === 'vrap') ? ('vrap:' + (vrapEditingNum == null ? 'new' : vrapEditingNum)) : ('table:' + (selectedId || '')); }
      catch (_) { return ''; }
    }

    function clientsOn() {
      try { return !!(storeIsReal() && window.KiwiClients && window.KiwiClients.bookId()); }
      catch (_) { return false; }
    }
    function clientInitials(name) {
      const p = String(name || '').trim().split(/\s+/).filter(Boolean);
      return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
    }
    /* « 7/10 » ou « 240 pts » · ce que l'employé doit pouvoir annoncer au
       client sans ouvrir un autre écran. */
    function clientProgressLabel(rec) {
      try {
        const KC = window.KiwiClients;
        /* Sans programme choisi, « 0/10 » annonçait une carte à tampons que le
           commerce n'a jamais proposée. */
        if (KC.loyaltyOn && !KC.loyaltyOn()) return '';
        const cfg = (KC.config && KC.config()) || {};
        if (cfg.model === 'amount') return (rec.points || 0) + ' pts';
        const target = (cfg.model === 'product' ? (cfg.product && cfg.product.target) : (cfg.visit && cfg.visit.target)) || 10;
        return (rec.stamps || 0) + '/' + target;
      } catch (_) { return ''; }
    }

    function renderSaleClient() {
      const btn = $('#rp-client');
      if (!btn) return;
      if (saleClient && saleClient.ctx && saleClient.ctx !== saleContextKey()) saleClient = null;
      btn.hidden = !clientsOn();
      const lab = $('#rp-client-label');
      const x = $('#rp-client-clear');
      if (saleClient) {
        let rec = null;
        try { rec = window.KiwiClients.get(saleClient.id); } catch (_) {}
        const prog = rec ? clientProgressLabel(rec) : '';
        btn.classList.add('is-on');
        if (lab) lab.textContent = saleClient.name + (prog ? ' · ' + prog : '');
        if (x) x.hidden = false;
      } else {
        btn.classList.remove('is-on');
        if (lab) lab.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Client & fidélité');
        if (x) x.hidden = true;
      }
    }

    function creditSaleToClient(entry) {
      if (!saleClient || !clientsOn()) return;
      const id = saleClient.name, cid = saleClient.id;
      saleClient = null;                       // une note = un passage
      try {
        /* #0168 · the client page shows what was eaten, on which ticket and
           how it was paid, the same history the boutique already fills. */
        const res = window.KiwiClients.recordPurchase(cid, {
          amount: entry.amount, method: entry.method, saleRef: entry.ref,
          saleId: entry.id, eventRef: entry.id, createdAt: +entry.time,
          items: (entry.lines || []).map(l => ({ name: l.name, qty: l.qty, total: l.total })),
        });
        renderSaleClient();
        if (!res) return;
        toast(res.rewardReady
          ? `${id} · récompense atteinte`
          : `${id} · passage enregistré`);
      } catch (_) { renderSaleClient(); }
    }

    function clRows(q) {
      let list = [];
      try { list = window.KiwiClients.list() || []; } catch (_) {}
      const needle = String(q || '').trim().toLowerCase();
      if (needle) {
        const digits = needle.replace(/\D/g, '');
        list = list.filter(c =>
          String(c.name || '').toLowerCase().indexOf(needle) !== -1 ||
          (digits && String(c.phone || '').replace(/\D/g, '').indexOf(digits) !== -1));
      }
      // Les plus récents d'abord : au comptoir, c'est presque toujours un habitué.
      list = list.slice().sort((a, b) => String(b.lastSeen || '').localeCompare(String(a.lastSeen || ''))).slice(0, 40);
      if (!list.length) {
        return `<div class="cl-empty">${needle
          ? 'Personne à ce nom.<br />Créez la fiche avec « Nouveau client ».'
          : 'Le carnet est vide.<br />Le premier client s\'inscrit ici, au comptoir.'}</div>`;
      }
      return list.map(c => `
        <button type="button" class="cl-row" data-cl-pick="${escTeam(c.id)}">
          <span class="ini">${escTeam(clientInitials(c.name))}</span>
          <span class="who"><b>${escTeam(c.name || 'Sans nom')}</b><span>${escTeam(c.phone || '')}</span></span>
          <span class="pts">${escTeam(clientProgressLabel(c))}</span>
        </button>`).join('');
    }
    function clPaint() {
      const l = $('#cl-list');
      if (l) l.innerHTML = clRows($('#cl-search') ? $('#cl-search').value : '');
      const nw = $('#cl-new'); if (nw) nw.hidden = !clNewMode;
      const ls = $('#cl-list'); if (ls) ls.hidden = clNewMode;
      const sr = $('#cl-search'); if (sr) sr.hidden = clNewMode;
      const cl = $('#cl-confirm-label'); if (cl) cl.textContent = clNewMode ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Enregistrer') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Nouveau client');
    }
    function openClientModal() {
      if (!clientsOn()) return;
      clNewMode = false;
      const s = $('#cl-search'); if (s) s.value = '';
      ['#cl-new-name', '#cl-new-phone'].forEach(sel => { const el = $(sel); if (el) el.value = ''; });
      const cs = $('#cl-new-consent'); if (cs) cs.checked = false;
      clPaint();
      clientModal.classList.add('is-open');
      if (window.lucide) lucide.createIcons();
      setTimeout(() => { try { $('#cl-search').focus(); } catch (_) {} }, 120);
    }
    function closeClientModal() { clientModal.classList.remove('is-open'); }
    function attachClient(rec) {
      if (!rec) return;
      saleClient = { id: rec.id, name: rec.name || 'Client', phone: rec.phone || '', ctx: saleContextKey() };
      renderSaleClient();
      closeClientModal();
      toast(`${saleClient.name} attaché à la note`);
    }
    /* The Clients page (assets/clients-book.js) puts a client on the note in
       progress from their card, as Shopify and Loyverse do: the same attach as
       the picker above, the same one-note-one-visit rule, and the 2027 bill
       repaints so its header shows who the note is for (owner, 26 Oct 2026). */
    window.KiwiCaisseSaleClient = {
      /* A note to put the client on: À emporter always has one, the floor
         only once a table is open. */
      available() { try { return clientsOn() && (mode === 'vrap' || !!selectedId); } catch (_) { return false; } },
      current() { return saleClient && saleClient.ctx === saleContextKey() ? saleClient.id : null; },
      note() { try { return ($('#rp-table').textContent || '').trim(); } catch (_) { return ''; } },
      attach(rec) {
        if (!rec || !this.available()) return false;
        attachClient(rec);
        try { if (typeof tillKitPaint === 'function') tillKitPaint(); } catch (_) {}
        return true;
      },
      detach() {
        saleClient = null;
        renderSaleClient();
        try { if (typeof tillKitPaint === 'function') tillKitPaint(); } catch (_) {}
      },
    };
    /* Ce script s'exécute pendant l'analyse de la page ; clients-store.js est
       `defer` et n'existe pas encore. Le test d'ici ne s'abonnait donc jamais,
       et le bouton « Client & fidélité », masqué au démarrage, ne revenait
       qu'au prochain changement de mode : une caisse ouverte sur À emporter
       ne proposait jamais d'attacher un client. On s'accroche une fois les
       scripts différés chargés. */
    function hookClientBook() {
      try {
        if (!window.KiwiClients || !window.KiwiClients.subscribe) return false;
        window.KiwiClients.subscribe(renderSaleClient);
        renderSaleClient();
        return true;
      } catch (_) { return false; }
    } /* Casablanca landline (demo) */
