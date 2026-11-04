/* Épicerie credit book. Host dependencies are live across merchant restores. */
(function () {
'use strict';
window.KiwiPosDispatch.createEpicerieCarnet = function (ctx) {
  const { $, $$, esc, r2, icons, initials, politeName, pvReal, pvName, postDay, ticketTotal, ticketCount, decrementStock, freshTicket, renderTicket, renderGrid, renderBadges, queueIfOffline, focusScan, openVeil, closeVeil, focusModal } = ctx;
  const DAY = 86400000;
  const phrase = (key, ...values) => tr(key).replace(/\{x\}/g, () => String(values.shift()));
  const tr = s => window.KiwiCaisseLang?.tr(String(s)) || String(s);
  const toast = (s, ms) => ctx.toast(tr(s), ms);
  const locale = () => window.KiwiCaisseLang?.get() === 'en' ? 'en-GB' : 'fr-FR';
  const fmtMAD2 = n => new Intl.NumberFormat(locale(), { minimumFractionDigits: Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 }).format(Math.round(n * 100) / 100) + ' MAD';
  const fmtMAD = fmtMAD2;
  const count = n => new Intl.NumberFormat(locale()).format(n);
  const pad2 = n => String(n).padStart(2, '0');
  const fmtDT = d => new Intl.DateTimeFormat(window.KiwiCaisseLang?.get() === 'ar' ? 'ar-MA-u-nu-latn' : locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  // This is exactly the server fallback key. Never add a persisted id to old rows:
  // unionBook and creditRefundEdit compare the original rows byte for byte.
  const entryId = h => h.id || JSON.stringify([h.type, h.amt, h.at, h.label]);
  function debtDays(d) {
    const report = window.KiwiDayReport;
    const venue = ctx.epicerieOps?.venue?.();
    const key = ts => report?.businessDay ? report.businessDay(ts, venue) : new Date(+ts - 5 * 3600000).toISOString().slice(0, 10);
    return Math.max(0, Math.round((Date.parse(key(Date.now())) - Date.parse(key(d))) / DAY));
  }
  let languageView;
  const rememberView = (veil, render) => { languageView = { veil, render }; };
  window.KiwiCaisseLang?.subscribe(() => {
    if (!ctx.root) return;
    renderCarnet();
    if (languageView && $(languageView.veil, ctx.root)?.classList.contains('is-open')) languageView.render();
  });
  function html(parts, ...values) {
    const markup = String.raw({ raw: parts }, ...values);
    return markup.replace(/>([^<>]+)</g, (_, text) => '>' + text.replace(/^(\s*)([\s\S]*?)(\s*)$/, (_, a, b, c) => a + tr(b) + c) + '<')
      .replace(/(aria-label|placeholder)="([^"]*)"/g, (_, attr, text) => attr + '="' + tr(text) + '"');
  }
  /* ───────────────────────── carnet — l'ardoise du quartier ─────────────────────────
     6 voisins, soldes et historiques réels. type: 'debt' = achat à crédit (+),
     'pay' = règlement (−). Le solde courant = somme des deltas non encore
     "soldés". On garde des historiques riches : c'est la confiance du quartier. */
  const NOW = Date.now();
  const dAgo = (days, h, m) => { const d = new Date(NOW - days * DAY); d.setHours(h != null ? h : 11, m != null ? m : 0, 0, 0); return d; };

  const CARNET = pvReal() ? [] : [
    { id: 'k1', name: 'Mme Rkia', phone: '0661 44 21 87', note: 'voisine du 2e, paie souvent le vendredi',
      hist: [
        { type: 'debt', label: 'Courses (huile, sucre, thé)', amt: 55, at: dAgo(21, 18, 10) },
        { type: 'debt', label: 'Pain + lait (3 jours)',        amt: 21, at: dAgo(16, 8, 30) },
        { type: 'pay',  label: 'Règlement espèces',            amt: 40, at: dAgo(12, 19, 0) },
        { type: 'debt', label: 'Couscous + tomates',           amt: 38, at: dAgo(9, 12, 0) },
        { type: 'debt', label: 'Recharge + biscuits',          amt: 30, at: dAgo(3, 17, 30) },
        { type: 'debt', label: 'Conserves + savon',            amt: 30, at: dAgo(0, 16, 20) },
      ] },
    { id: 'k2', name: 'Hajj Driss', phone: '0670 33 12 09', note: 'retraité, ardoise du mois, règle le 1er',
      hist: [
        { type: 'debt', label: 'Café + thé + sucre',  amt: 59, at: dAgo(11, 9, 0) },
        { type: 'debt', label: 'Œufs (×12) + lait',   amt: 26, at: dAgo(6, 8, 15) },
        { type: 'pay',  label: 'Règlement espèces',   amt: 50, at: dAgo(4, 18, 40) },
        { type: 'debt', label: 'Pain quotidien',      amt: 12, at: dAgo(1, 7, 50) },
        { type: 'debt', label: 'Tomates + oignons',   amt: 11, at: dAgo(0, 11, 10) },
      ] },
    { id: 'k3', name: 'Mustapha (menuisier)', phone: '0662 78 45 33', note: "l'atelier d'à côté, déjeuner à crédit",
      hist: [
        { type: 'debt', label: 'Boissons + chips (équipe)', amt: 48, at: dAgo(8, 12, 30) },
        { type: 'debt', label: 'Pain + Vache Qui Rit',      amt: 22, at: dAgo(5, 12, 45) },
        { type: 'debt', label: 'Eau ×6 + biscuits',         amt: 33, at: dAgo(2, 13, 0) },
      ] },
    { id: 'k4', name: 'Fatiha', phone: '0653 90 18 76', note: 'maman du 4e, règle chaque samedi',
      hist: [
        { type: 'debt', label: 'Courses semaine',     amt: 64, at: dAgo(13, 18, 0) },
        { type: 'pay',  label: 'Règlement (samedi)',  amt: 64, at: dAgo(7, 11, 0) },
        { type: 'debt', label: 'Lait + yaourts + pain', amt: 27, at: dAgo(2, 9, 20) },
      ] },
    { id: 'k5', name: 'Café Rif (en face)', phone: '0539 94 03 21', note: 'B2B, lait & sucre tous les matins, facture fin de mois',
      hist: [
        { type: 'debt', label: 'Lait ×10 + sucre ×4', amt: 128, at: dAgo(10, 7, 0) },
        { type: 'debt', label: 'Lait ×10',            amt: 80,  at: dAgo(6, 7, 0) },
        { type: 'pay',  label: 'Virement (acompte)',  amt: 100, at: dAgo(5, 14, 0) },
        { type: 'debt', label: 'Sucre ×6 + café',     amt: 100, at: dAgo(2, 7, 30) },
      ] },
    { id: 'k6', name: 'Si Larbi', phone: '0668 11 55 42', note: 'à jour, pour mémoire',
      hist: [
        { type: 'debt', label: 'Courses',          amt: 45, at: dAgo(14, 17, 0) },
        { type: 'pay',  label: 'Règlement espèces', amt: 45, at: dAgo(9, 18, 0) },
      ] },
  ];
  const CRED = Object.fromEntries(CARNET.map((c) => [c.id, c]));
  function balanceOf(c) {
    /* Au centime : 12,10 + 3,20 donnait 15,2999…, et un règlement complet
       laissait −0,0000001 sur l'ardoise. On additionne des centimes entiers. */
    return c.hist.reduce((s, h) => s + (h.type === 'debt' ? 1 : -1) * Math.round((+h.amt || 0) * 100), 0) / 100;
  }
  function oldestDebt(c) {
    /* date de la plus ancienne dette tant que le solde reste > 0 (FIFO) */
    let running = balanceOf(c);
    if (running <= 0) return null;
    const debts = c.hist.filter((h) => h.type === 'debt').slice().sort((a, b) => a.at - b.at);
    const paid = c.hist.filter((h) => h.type === 'pay').reduce((s, h) => s + Math.round((+h.amt || 0) * 100), 0);
    let coverage = paid;
    for (const d of debts) {
      const cents = Math.round((+d.amt || 0) * 100);
      if (coverage >= cents) { coverage -= cents; continue; }
      return d.at;
    }
    return debts.length ? debts[debts.length - 1].at : null;
  }
  /* Deux caisses hors ligne peuvent chacune encaisser le même règlement : à la
     fusion les deux paiements restent (l'argent est bien entré deux fois) et le
     solde passe sous zéro. C'est une avance due au client, pas une dette en
     moins chez les autres : le total à recevoir ne compte que ce qui est dû. */
  function totalCredit() { return r2(CARNET.reduce((s, c) => s + Math.max(0, balanceOf(c)), 0)); }
  const advanceTxt = (bal) => tr(`Avance ${fmtMAD(-bal)}`);
  /* Un solde sous zéro ne s'affiche jamais nu (« solde −20 MAD ») : c'est une
     avance due au voisin, on le dit. */
  const balTxt = (bal) => (bal < 0 ? advanceTxt(bal) : fmtMAD(bal));
  /* Une ligne d'ardoise porte son propre identifiant : la synchronisation
     additionne alors les lignes de deux caisses au lieu de garder le carnet de
     la dernière (KiwiVerticalState.mergeLedger, assets/vertical-state.js). */
  const uid = (p) => p + (window.crypto?.randomUUID?.() || Array.from(window.crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join(''));
  function histEntry(type, label, amt) { return { id: uid('h'), type, label, amt, at: new Date() }; }

  /* ───────────── règlement : la ligne du carnet et l'argent, ensemble ─────────────
     Un règlement s'écrit à deux endroits : la ligne « pay » du carnet (ce que le
     voisin doit encore) et la recette du jour (KiwiPosSale, ce qui est entré au
     tiroir et part au serveur). Écrits l'un après l'autre sans lien, un
     stockage plein ou un onglet tué entre les deux laissait soit l'argent sans
     la ligne (le voisin redoit ce qu'il a payé), soit la ligne sans l'argent.
     Ordre d'écriture, sur ce terminal seulement :
       1. une intention dans un petit journal local (kiwi:epicerieRepay:<commerce>),
          relue pour vérifier qu'elle est bien écrite, sinon rien n'est fait ;
       2. la recette, avec une référence ARD-… propre à ce règlement ;
       3. l'intention passe « payée », puis la ligne entre au carnet.
     Au chargement, recoverRepayments() relit ce journal : un règlement payé
     dont la ligne manque au carnet y revient ; une intention dont l'argent n'est
     jamais entré est oubliée. Les deux, ou aucun. La démo n'écrit rien. */
  const REPAY_PREFIX = 'kiwi:epicerieRepay:';
  function repayKey() { return REPAY_PREFIX + ((ctx.epicerieOps && ctx.epicerieOps.venue && ctx.epicerieOps.venue()) || ''); }
  function repayLog() {
    try { const a = JSON.parse(localStorage.getItem(repayKey()) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; }
  }
  function repayLogWrite(rows) {
    const key = repayKey(), text = rows.length ? JSON.stringify(rows) : null;
    try {
      if (text) localStorage.setItem(key, text); else localStorage.removeItem(key);
      return localStorage.getItem(key) === text;
    } catch (_) { return false; }
  }
  function journalHas(ref) {
    try { return !!ref && !!window.KiwiPosSale && window.KiwiPosSale.today('epicerie').some((s) => s && s.ref === ref); } catch (_) { return false; }
  }
  /* commitRepayment(id, pay) → { c, entry } ou { error: 'changed' | 'storage' }.
     Le client et son solde sont relus ICI : une fiche reçue d'une autre caisse
     pendant que la feuille était ouverte remplace les objets du carnet, et le
     règlement s'écrivait dans une copie que plus personne ne lisait. Un montant
     au-dessus du solde du moment (un autre téléphone a encaissé entre-temps)
     est refusé : la feuille se rouvre sur le vrai solde. */
  function commitRepayment(id, pay, method) {
    const m = method === 'carte' ? 'carte' : 'especes';  /* the tab can be settled by card too */
    const c = CRED[id];
    if (!c) return { error: 'changed' };
    const bal = balanceOf(c), payC = Math.round((+pay || 0) * 100), balC = Math.round(bal * 100);
    if (!(payC > 0) || payC > balC) return { error: 'changed', c };
    const amt = payC / 100;
    const entry = histEntry('pay', m === 'carte' ? (payC >= balC ? 'Règlement par carte (soldé)' : 'Règlement partiel par carte')
      : (payC >= balC ? 'Règlement (soldé)' : 'Règlement partiel'), amt);
    if (m === 'carte') entry.method = 'carte';
    if (payC === balC && ((typeof ctx.state !== 'undefined' && ctx.state.offline) || (typeof navigator !== 'undefined' && navigator.onLine === false))) {
      entry.offline = true;
      entry.settlementOf = Array.from(c.hist, h => entryId(h)).sort().join('|');
    }
    const lines = [{ itemId: 'reglement-ardoise', name: 'Règlement ardoise', kind: 'payment', unit: 'payment', qty: 1, total: amt }];
    if (pvReal() && window.KiwiPosSale) {
      try { entry.ref = window.KiwiPosSale.stamp('ARD-' + entry.id.slice(1)); } catch (_) { entry.ref = 'ARD-' + entry.id.slice(1); }
      const before = repayLog();
      const intent = { cid: c.id, name: c.name, stage: 'intent', entry: Object.assign({}, entry, { at: entry.at.toISOString() }) };
      if (!repayLogWrite(before.concat([intent]))) return { error: 'storage', c };
      const rec = postDay(amt, m, `Ardoise · ${c.name}`, entry.ref, lines);
      if (!rec && !journalHas(entry.ref)) { repayLogWrite(before); return { error: 'storage', c }; }
      intent.stage = 'paid';
      repayLogWrite(before.concat([intent]));
    } else {
      postDay(amt, m, `Ardoise · ${c.name}`, '', lines);
    }
    c.hist.push(entry);
    /* Un règlement d'ardoise, c'est de l'argent qui entre dans le tiroir : la
       recette du jour le compte (et la relit du journal au rechargement). */
    ctx.day[m] = Math.round((+ctx.day[m] || 0) * 100 + payC) / 100;
    return { c, entry };
  }
  /* Au chargement, après lecture du carnet enregistré. → nombre de lignes reprises. */
  function recoverRepayments() {
    if (!pvReal() || !ctx.epicerieOps || !ctx.epicerieOps.venue || !ctx.epicerieOps.venue()) return 0;
    const log = repayLog();
    if (!log.length) return 0;
    const keep = [];
    log.forEach((w) => {
      const e = w && w.entry;
      if (!e || !e.id || !w.cid) return;
      const c = CRED[w.cid];
      if (c && c.hist.some((h) => h && h.id === e.id)) return;          /* les deux sont là */
      if (w.stage !== 'paid' && !journalHas(e.ref)) return;              /* l'argent n'est jamais entré : ni l'un ni l'autre */
      let to = c;
      if (!to) { to = { id: w.cid, name: String(w.name || ''), phone: '', note: '', hist: [] }; CARNET.push(to); CRED[to.id] = to; }
      to.hist.push(Object.assign({}, e, { at: new Date(e.at) }));
      /* gardée jusqu'au prochain chargement qui la trouvera au carnet */
      keep.push(Object.assign({}, w, { stage: 'paid' }));
    });
    if (keep.length) ctx.epicerieOps.save('Règlement repris');
    repayLogWrite(keep);
    return keep.length;
  }

  const sinceLabel = (d) => {
    const days = debtDays(d);
    if (days <= 0) return "aujourd'hui";
    if (days === 1) return 'hier';
    if (days < 7) return `il y a ${count(days)} j`;
    const w = Math.floor(days / 7);
    if (w === 1) return 'il y a 1 semaine';
    if (w < 5) return `il y a ${count(w)} semaines`;
    const m = Math.floor(days / 30);
    return m <= 1 ? 'il y a 1 mois' : `il y a ${count(m)} mois`;
  };

  /* ═══════════════════════ CARNET PICK (attacher le panier à une ardoise) ═══════════════════════ */
  function openCarnetPick(repeatConfirmed) {
    const el = $('#ep-carnetpickm', ctx.root);
    const t = ctx.state.ticket;
    const total = ticketTotal(t);
    if (!repeatConfirmed && window.KiwiRepeatSale && window.KiwiRepeatSale.epicerie({ ticket: t, items: ctx.ITEMS, total, el: $('#ep-paym', ctx.root), open: () => openVeil('#ep-pay-veil'), close: () => closeVeil('#ep-pay-veil'), go: () => ctx.state.ticket === t && openCarnetPick(true) })) return;
    let mode = 'pick';
    const basketLabel = () => {
      if (t.lines.length === 1) return ctx.ITEMS[t.lines[0].itemId].label;
      return `${ticketCount(t)} articles`;
    };
    const render = () => {
      el.innerHTML = mode === 'pick' ? html`
        <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-icon="close"></i></button>
        <h3 class="modal-title">Mettre à l'ardoise</h3>
        <p class="modal-subtle">${fmtMAD2(total)} · ${esc(basketLabel())} · sur le carnet de quel voisin ?</p>
        <div class="ep-carnet-pick">
          ${CARNET.map((c) => {
            const bal = balanceOf(c);
            return `<button class="ep-cp" data-ep-cp="${c.id}">
              <span class="ep-cp-ava">${esc(initials(c.name))}</span>
              <span class="ep-cp-mid">
                <span class="ep-cp-name">${esc(c.name)}</span>
                <span class="ep-cp-sub">${esc(c.phone)}</span>
              </span>
              <span class="ep-cp-bal ${bal > 0 ? 'due' : 'zero'}">${bal > 0 ? fmtMAD(bal) : bal < 0 ? advanceTxt(bal) : 'à jour'}</span>
            </button>`;
          }).join('')}
        </div>
        <button class="ep-cp-new" id="ep-cp-new"><i data-icon="person_add"></i>Nouveau voisin sur le carnet</button>`
      : html`
        <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-icon="close"></i></button>
        <h3 class="modal-title">Nouveau voisin</h3>
        <p class="modal-subtle">On ouvre une ardoise, ${fmtMAD2(total)} dessus.</p>
        <div class="ep-cp-form">
          <input class="ep-in" id="ep-cp-name" placeholder="Nom (ex. Mme Naïma)" />
          <input class="ep-in" id="ep-cp-tel" inputmode="tel" autocomplete="tel" placeholder="06… / +33… (rappel WhatsApp)" />
          <div class="ep-weigh-foot" style="margin-top:4px;">
            <button class="ep-btn secondary" id="ep-cp-back">Retour</button>
            <button class="ep-btn primary" id="ep-cp-create"><i data-icon="check"></i>Ouvrir l'ardoise</button>
          </div>
        </div>`;
      icons();
      $$('[data-ep-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ep-carnetpick-veil'); });
      $$('[data-ep-cp]', el).forEach((b) => {
        b.onclick = () => attachBasket(CRED[b.dataset.epCp]);
      });
      const nw = $('#ep-cp-new', el);
      if (nw) nw.onclick = () => { mode = 'create'; render(); };
      const back = $('#ep-cp-back', el);
      if (back) back.onclick = () => { mode = 'pick'; render(); };
      const create = $('#ep-cp-create', el);
      if (create) create.onclick = () => {
        const name = $('#ep-cp-name', el).value.trim();
        const tel = $('#ep-cp-tel', el).value.trim();
        if (!name) { toast('Le nom est requis pour ouvrir une ardoise'); return; }
        const c = { id: uid('kx'), name, phone: tel, note: 'nouvelle ardoise', hist: [] };
        CARNET.push(c); CRED[c.id] = c;
        attachBasket(c);
      };
    };
    rememberView('#ep-carnetpick-veil', () => {
      const fields = ['#ep-cp-name', '#ep-cp-tel'].map(selector => [selector, $(selector, el)?.value]);
      render();
      fields.forEach(([selector, value]) => { const input = $(selector, el); if (input && value != null) input.value = value; });
    });
    render();
    openVeil('#ep-carnetpick-veil');
    icons();
  }

  function attachBasket(c) {
    const t = ctx.state.ticket;
    const total = ticketTotal(t);
    if (total <= 0) return;
    const label = t.lines.length === 1 ? ctx.ITEMS[t.lines[0].itemId].label : `Courses (${ticketCount(t)} articles)`;
    /* Le montant exact du panier, au centime. Math.round notait 12,50 MAD
       comme 13 sur l'ardoise du voisin : au-dessus du prix affiché, ce que la
       caisse ne fait jamais (propriétaire, 19 octobre). */
    c.hist.push(histEntry('debt', label, r2(total)));
    ctx.day.creditAdded = r2(ctx.day.creditAdded + total);
    decrementStock(t);
    ctx.day.tickets++;
    if (window.KiwiRepeatSale) window.KiwiRepeatSale.epicerieRemember(t, ctx.ITEMS, total);
    closeVeil('#ep-carnetpick-veil');
    ctx.nextTicket();
    freshTicket();
    renderTicket(); renderGrid(); renderBadges(); icons();
    queueIfOffline('Ardoise');
    toast(`Sur l'ardoise de ${c.name} · +${fmtMAD2(total)} · ${phrase('solde {x}', balTxt(balanceOf(c)))}`);
    focusScan();
  }

  /* ═══════════════════════ CARNET DE CRÉDIT (écran) ═══════════════════════ */
  function renderCarnet() {
    const panel = $('[data-ep-panel="carnet"]', ctx.root);
    const q = ctx.state.carnetQuery.toLowerCase().trim();
    const list = CARNET
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')))
      .slice()
      .sort((a, b) => balanceOf(b) - balanceOf(a));
    panel.innerHTML = html`
      <div class="ep-carnet">
        <div class="ep-carnet-list">
          <header class="ep-head">
            <div><h1>Carnet de crédit</h1><div class="ep-head-sub">L'ardoise du quartier, fini le cahier sous le comptoir</div></div>
          </header>
          ${ctx.state.attachFrom ? `<div class="ep-attach-banner" id="ep-attach-banner">
            <i data-icon="menu_book"></i>
            <span>Panier en attente, <b>${esc(ctx.state.attachFrom.label)}</b> · ${fmtMAD2(ctx.state.attachFrom.total)}. ${tr('Touchez un voisin pour l’y mettre.')}</span>
            <button class="x" id="ep-attach-cancel"><i data-icon="close"></i></button>
          </div>` : ''}
          <div class="ep-carnet-tools">
            <div class="ep-carnet-search"><i data-icon="search"></i>
              <input id="ep-carnet-q" placeholder="Nom ou téléphone du voisin…" value="${esc(ctx.state.carnetQuery)}" autocomplete="off" /></div>
            <div class="ep-carnet-total">
              <span>On nous doit, en tout</span>
              <b>${fmtMAD(totalCredit())}</b>
            </div>
          </div>
          <div class="ep-carnet-scroll">
            <div class="ep-carnet-grid">
              ${list.map(ardoiseCard).join('') || `<div class="ep-sr-empty" style="grid-column:1/-1;">${ctx.state.carnetQuery ? `Aucun voisin pour « ${esc(ctx.state.carnetQuery)} ».` : 'Le carnet est vide, personne n’a de crédit en cours.'}</div>`}
            </div>
          </div>
        </div>
      </div>`;
    $('#ep-carnet-q', panel).oninput = (e) => {
      ctx.state.carnetQuery = e.target.value;
      renderCarnet(); icons();
      const i = $('#ep-carnet-q', panel); i.focus(); const v = i.value; i.value = ''; i.value = v;
    };
    const cancel = $('#ep-attach-cancel', panel);
    if (cancel) cancel.onclick = () => { ctx.state.attachFrom = null; renderCarnet(); icons(); };
    panel.onclick = (e) => {
      const b = e.target.closest('[data-ep-ard]');
      if (!b) return;
      if (e.target.closest('#ep-attach-cancel')) return;
      if (ctx.state.attachFrom) {
        const c = CRED[b.dataset.epArd];
        c.hist.push(histEntry('debt', ctx.state.attachFrom.label, r2(ctx.state.attachFrom.total)));
        ctx.day.creditAdded = r2(ctx.day.creditAdded + ctx.state.attachFrom.total);
        if (ctx.epicerieOps) ctx.epicerieOps.save('Ardoise');
        toast(`Sur l'ardoise de ${c.name} · +${fmtMAD2(ctx.state.attachFrom.total)}`);
        ctx.state.attachFrom = null;
        renderCarnet(); renderBadges(); icons();
        return;
      }
      openArdoise(b.dataset.epArd);
    };
    icons();
  }

  function ardoiseCard(c) {
    const bal = balanceOf(c);
    const oldest = oldestDebt(c);
    const old = oldest && debtDays(oldest) > 14 && bal > 0;
    const sinceTxt = bal > 0 && oldest ? `depuis ${sinceLabel(oldest)}` : bal < 0 ? 'trop-perçu, à rendre ou à déduire' : 'à jour';
    return html`<button class="ep-ardoise ${old ? 'is-old' : ''} ${bal <= 0 ? 'is-paid' : ''}" data-ep-ard="${c.id}">
      <div class="ep-ard-top">
        <span class="ep-ard-ava">${esc(initials(c.name))}</span>
        <span class="ep-ard-who">
          <span class="ep-ard-name">${esc(c.name)}</span>
          <span class="ep-ard-meta">${esc(c.phone)}</span>
        </span>
        <span class="ep-ard-bal ${bal <= 0 ? 'zero' : ''}">
          <span class="amt">${bal > 0 ? fmtMAD(bal) : bal < 0 ? advanceTxt(bal) : fmtMAD(0)}</span>
          <span class="since">${count(c.hist.length)} mouvement${c.hist.length > 1 ? 's' : ''}</span>
        </span>
      </div>
      <div class="ep-ard-foot">
        <span class="ep-ard-since-chip ${old ? 'old' : bal <= 0 ? 'zero' : ''}">
          <i data-icon="${bal < 0 ? 'payments' : bal <= 0 ? 'check' : 'schedule'}"></i>${esc(sinceTxt)}
        </span>
        <span class="ep-ard-go">Ouvrir <i data-icon="chevron_right"></i></span>
      </div>
    </button>`;
  }

  /* ---------- ardoise detail (history + règlement + WhatsApp) ---------- */
  let bindHistoryPages, historyPagesReady;
  function openArdoise(id) {
    if (!bindHistoryPages) {
      historyPagesReady ||= import('../credit-history-page.js?v=3').then(module => { bindHistoryPages = module.bindHistoryPages; }, e => { historyPagesReady = null; throw e; });
      return historyPagesReady.then(() => openArdoise(id));
    }
    const c = CRED[id];
    if (!c) return;
    rememberView('#ep-ard-veil', () => openArdoise(id));
    const el = $('#ep-ardm', ctx.root);
    el.dataset.creditId = id;
    const bal = balanceOf(c);
    const oldest = oldestDebt(c);
    const hist = c.hist.slice().sort((a, b) => b.at - a.at);
    el.innerHTML = html`
      <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-icon="close"></i></button>
      <div class="ep-dt-head">
        <span class="ep-dt-ava">${esc(initials(c.name))}</span>
        <span class="ep-dt-who">
          <h3>${esc(c.name)}</h3>
          <span class="sub">${esc(c.phone)}${c.note ? ` · ${esc(tr(c.note))}` : ''}</span>
        </span>
        <span class="ep-dt-bal ${bal <= 0 ? 'zero' : ''}">
          <span class="amt">${bal > 0 ? fmtMAD(bal) : bal < 0 ? advanceTxt(bal) : fmtMAD(0)}</span>
          <span class="lbl">${bal > 0 ? `dû ${oldest ? 'depuis ' + sinceLabel(oldest) : ''}` : bal < 0 ? 'payé en trop, à rendre ou à déduire de la prochaine dette' : 'à jour'}</span>
        </span>
      </div>
      ${(c.creditAlerts || []).map(a => `<div role="alert"><span>${a.kind === 'debt-on-advance' ? `${esc(window.KiwiCaisseLang?.tr('Dette refusée, client en avance') || 'Dette refusée, client en avance')} · ${fmtMAD(a.debtCents / 100)}` : `${esc(window.KiwiCaisseLang?.tr('Soldé deux fois hors ligne') || 'Soldé deux fois hors ligne')} · ${fmtMAD(a.advanceCents / 100)} ${esc(window.KiwiCaisseLang?.tr('en avance') || 'en avance')}`}</span><a href="dashboard.html#/credit">${esc(window.KiwiCaisseLang?.tr('Rembourser l’avance') || 'Rembourser l’avance')}</a></div>`).join('')}
      <div class="ep-dt-hist" tabindex="0" role="region" aria-label="Historique du carnet">
        <div class="ep-dt-hist-head">Historique du carnet</div>
        <div class="ep-htl">

        </div>
      </div>
      <div class="ep-dt-actions">
        ${bal > 0 ? `<button class="ep-btn primary" id="ep-ard-settle"><i data-icon="payments"></i>Règlement · ${fmtMAD(bal)}</button>` : ''}
        ${bal > 0 ? `<button class="ep-btn secondary" id="ep-ard-wa"><i data-icon="chat_bubble"></i>Rappel WhatsApp</button>` : ''}
        <button class="ep-btn ghost" id="ep-ard-add"><i data-icon="add"></i>Ajouter une dette</button>
      </div>`;
    bindHistoryPages(el, hist, (h) => html`
            <div class="ep-ht">
              <span class="ep-ht-ic ${h.type}"><i data-icon="${h.type === 'pay' ? 'payments' : 'shopping_bag'}"></i></span>
              <span class="ep-ht-mid">
                <span class="ep-ht-label">${esc(tr(h.label))}</span>
                <span class="ep-ht-date">${fmtDT(h.at)}</span>
              </span>
              <span class="ep-ht-amt ${h.type}">${h.type === 'pay' ? '−' : '+'}${fmtMAD(h.amt)}</span>
            </div>`, icons);
    openVeil('#ep-ard-veil');
    icons();
    $$('[data-ep-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ep-ard-veil'); });
    const settle = $('#ep-ard-settle', el);
    if (settle) settle.onclick = () => { closeVeil('#ep-ard-veil'); openSettle(c); };
    const wa = $('#ep-ard-wa', el);
    if (wa) wa.onclick = () => openWa(c);
    $('#ep-ard-add', el).onclick = () => quickDebt(c);
  }

  /* quick manual debt (e.g. neighbour grabs bread, no scan) */
  function quickDebt(c, initialAmount = 20) {
    const el = $('#ep-ardm', ctx.root);
    /* small inline prompt reuses the pay modal shell */
    const pv = $('#ep-paym', ctx.root);
    let amt = initialAmount;
    rememberView('#ep-pay-veil', () => quickDebt(c, amt));
    pv.innerHTML = html`
      <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-icon="close"></i></button>
      <h3 class="modal-title">Ajouter au carnet de ${esc(politeName(c.name))}</h3>
      <p class="modal-subtle">Un achat à crédit sans passer par la caisse (pain, lait…).</p>
      <div class="modal-amount size-md" id="ep-qd-val">${fmtMAD(amt)}</div>
      <div class="cash-presets" style="justify-content:center;margin-bottom:14px;">
        <button class="cash-preset" data-qd="5">5</button>
        <button class="cash-preset" data-qd="10">10</button>
        <button class="cash-preset" data-qd="20">20</button>
        <button class="cash-preset" data-qd="50">50</button>
      </div>
      <div class="cash-input-row" style="margin-bottom:14px;">
        <label class="cash-input-label" for="ep-qd-in">Montant (MAD)</label>
        <input class="cash-input mono" id="ep-qd-in" type="number" inputmode="numeric" min="1" step="1" value="${amt}" />
      </div>
      <div class="ep-weigh-foot">
        <button class="ep-btn secondary" data-ep-close>Annuler</button>
        <button class="ep-btn primary" id="ep-qd-ok"><i data-icon="check"></i>Mettre au carnet</button>
      </div>`;
    closeVeil('#ep-ard-veil');
    openVeil('#ep-pay-veil');
    icons();
    const refresh = () => { $('#ep-qd-val', pv).textContent = fmtMAD(amt); $('#ep-qd-in', pv).value = amt; };
    $$('[data-ep-close]', pv).forEach((b) => { b.onclick = () => { closeVeil('#ep-pay-veil'); openArdoise(c.id); }; });
    $$('[data-qd]', pv).forEach((b) => { b.onclick = () => { amt = +b.dataset.qd; refresh(); }; });
    $('#ep-qd-in', pv).oninput = (e) => { amt = Math.max(0, +e.target.value || 0); $('#ep-qd-val', pv).textContent = fmtMAD(amt); };
    $('#ep-qd-ok', pv).onclick = () => {
      if (amt <= 0) { toast('Montant invalide'); return; }
      c.hist.push(histEntry('debt', 'Achat à crédit', r2(amt)));
      ctx.day.creditAdded = r2(ctx.day.creditAdded + amt);
      closeVeil('#ep-pay-veil');
      queueIfOffline('Ardoise');
      toast(`Sur l'ardoise de ${c.name} · +${fmtMAD(amt)} · ${phrase('solde {x}', balTxt(balanceOf(c)))}`);
      renderBadges();
      openArdoise(c.id);
    };
  }

  /* ---------- règlement (full / partial) — reuses the cash kit ---------- */
  function openSettle(c) {
    const el = $('#ep-paym', ctx.root);
    const bal = balanceOf(c);

    const step1 = () => {
      rememberView('#ep-pay-veil', step1);
      el.innerHTML = html`
        <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-icon="close"></i></button>
        <h3 class="modal-title">Règlement, ${esc(politeName(c.name))}</h3>
        <p class="modal-subtle">Solde de l'ardoise · ${fmtMAD(bal)}</p>
        <div class="modal-amount size-md">${fmtMAD(bal)}</div>
        <div class="ep-pay-opts">
          <button class="ep-pay-opt is-usual" data-ep-settle="full">
            <span class="ic"><i data-icon="done_all"></i></span>
            <span class="l"><b>Tout régler</b><span>Solde le carnet, remis à zéro</span></span>
            <span class="amt">${fmtMAD(bal)}</span>
          </button>
          <button class="ep-pay-opt" data-ep-settle="partial">
            <span class="ic"><i data-icon="toll"></i></span>
            <span class="l"><b>Règlement partiel</b><span>Le voisin donne ce qu'il peut aujourd'hui</span></span>
          </button>
        </div>`;
      icons();
      $$('[data-ep-close]', el).forEach((b) => { b.onclick = () => { closeVeil('#ep-pay-veil'); openArdoise(c.id); }; });
      $$('[data-ep-settle]', el).forEach((b) => {
        b.onclick = () => stepCash(b.dataset.epSettle === 'full' ? bal : Math.min(bal, Math.max(10, Math.round(bal / 2 / 10) * 10)), b.dataset.epSettle);
      });
    };

    const stepCash = (amount, kind, initialReceived) => {
      let pay = amount;
      let received = initialReceived ?? Math.ceil(amount);
      rememberView('#ep-pay-veil', () => stepCash(pay, kind, received));
      el.innerHTML = html`
        <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-icon="close"></i></button>
        <h3 class="modal-title">${kind === 'full' ? 'Règlement total' : 'Règlement partiel'}</h3>
        <p class="modal-subtle">${esc(c.name)} · solde ${fmtMAD(bal)}</p>
        ${kind === 'partial' ? `
          <div class="cash-input-row" style="margin-bottom:6px;">
            <label class="cash-input-label" for="ep-settle-amt">Montant réglé aujourd'hui</label>
            <input class="cash-input mono" id="ep-settle-amt" type="number" inputmode="numeric" min="1" max="${bal}" step="5" value="${pay}" />
          </div>
          <div class="cash-presets" style="margin-bottom:12px;">
            <button class="cash-preset" data-sp="20">20</button>
            <button class="cash-preset" data-sp="50">50</button>
            <button class="cash-preset" data-sp="100">100</button>
            <button class="cash-preset" data-sp="half">moitié</button>
            <button class="cash-preset" data-sp="all">tout</button>
          </div>` : `<div class="modal-amount size-md" id="ep-settle-show">${fmtMAD(pay)}</div>`}
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="ep-settle-in">Espèces reçues</label>
            <input class="cash-input mono" id="ep-settle-in" type="number" inputmode="numeric" min="0" step="1" value="${received}" />
          </div>
          <div class="cash-presets" aria-label="Ajout rapide">
            <button class="cash-preset" data-add="10">+10</button>
            <button class="cash-preset" data-add="20">+20</button>
            <button class="cash-preset" data-add="50">+50</button>
            <button class="cash-preset" data-add="100">+100</button>
          </div>
          <div class="cash-rendu" id="ep-settle-rendu-box"><span class="lbl">Rendu</span><span class="val mono" id="ep-settle-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="ep-settle-ok">Encaisser le règlement</button>
          <button class="ep-btn secondary" id="ep-settle-card"><i data-icon="credit_card"></i><span>Réglé par carte</span> · <span id="ep-settle-card-amt">${fmtMAD(pay)}</span></button>
        </div>`;
      icons();
      /* la feuille déjà ouverte change d'étape : le focus suit */
      if ($('#ep-pay-veil', ctx.root).classList.contains('is-open')) focusModal(el);
      const box = $('#ep-settle-rendu-box', el);
      const refresh = () => {
        const rendu = received - pay;
        $('#ep-settle-rendu', el).textContent = fmtMAD(Math.max(0, rendu));
        box.classList.toggle('is-positive', rendu > 0.0001);
        box.classList.toggle('is-short', rendu < -0.0001);
        $('#ep-settle-ok', el).disabled = received < pay - 0.0001 || pay <= 0;
        $('#ep-settle-card', el).disabled = pay <= 0;
        $('#ep-settle-card-amt', el).textContent = fmtMAD(pay);
        const show = $('#ep-settle-show', el); if (show) show.textContent = fmtMAD(pay);
      };
      $$('[data-ep-close]', el).forEach((b) => { b.onclick = () => { closeVeil('#ep-pay-veil'); openArdoise(c.id); }; });
      const amtInput = $('#ep-settle-amt', el);
      if (amtInput) amtInput.oninput = (e) => { pay = Math.max(0, Math.min(bal, +e.target.value || 0)); refresh(); };
      $$('[data-sp]', el).forEach((b) => {
        b.onclick = () => {
          const v = b.dataset.sp;
          pay = v === 'half' ? Math.min(bal, Math.round(bal / 2 / 5) * 5) : v === 'all' ? bal : Math.min(bal, +v);
          if (amtInput) amtInput.value = pay;
          if (received < pay) { received = Math.ceil(pay); $('#ep-settle-in', el).value = received; }
          refresh();
        };
      });
      $('#ep-settle-in', el).oninput = (e) => { received = +e.target.value || 0; refresh(); };
      $$('[data-add]', el).forEach((b) => {
        b.onclick = () => { received += +b.dataset.add; $('#ep-settle-in', el).value = received; refresh(); };
      });
      refresh();
      const settle = (method) => {
        const rendu = method === 'carte' ? 0 : Math.max(0, received - pay);
        /* Le règlement au centime, comme la dette : arrondi, « tout régler »
           sur 12,50 notait 13 payés, et l'ardoise passait à −0,50. La ligne du
           carnet et la recette du jour s'écrivent ensemble (commitRepayment). */
        const done = commitRepayment(c.id, pay, method);
        closeVeil('#ep-pay-veil');
        if (done.error === 'storage') {
          toast('Règlement non enregistré, rien n\'a été noté · réessayez');
          openArdoise(c.id);
          return;
        }
        if (done.error) {
          const live = CRED[c.id];
          toast('Le solde a changé sur une autre caisse · vérifiez le montant');
          if (live && balanceOf(live) > 0) openSettle(live); else openArdoise(c.id);
          return;
        }
        queueIfOffline('Règlement');
        const newBal = balanceOf(done.c);
        toast(newBal > 0
          ? `Encaissé · ${fmtMAD(pay)} · reste ${fmtMAD(newBal)} sur l'ardoise${rendu > 0.0001 ? ` · rendu ${fmtMAD(rendu)}` : ''}`
          : `Ardoise soldée · ${esc(c.name)} · l'lah ikhellik${rendu > 0.0001 ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
        renderBadges();
        openArdoise(c.id);
      };
      $('#ep-settle-ok', el).onclick = () => settle('especes');
      $('#ep-settle-card', el).onclick = () => settle('carte');
    };

    step1();
    openVeil('#ep-pay-veil');
  }

  /* ═══════════════════════ WHATSAPP — rappel TRÈS poli (c'est un voisin) ═══════════════════════ */
  function waMessage(c) {
    const bal = balanceOf(c);
    const first = politeName(c.name);
    return phrase("Bonjour {x}, j'espère que vous allez bien.", first)
      + '\n' + phrase('Petit rappel de {x} : il reste {x} sur le carnet, quand ça vous arrange, aucune urgence.', pvName(tr('votre épicerie')) || tr('votre épicerie'), fmtMAD(bal))
      + '\n' + tr('Baraka Allah o fik, et bonne journée.');
  }
  function openWa(c, draft) {
    const el = $('#ep-wam', ctx.root);
    const generated = waMessage(c);
    rememberView('#ep-wa-veil', () => {
      const text = $('#ep-wa-text', el)?.value;
      openWa(c, text && text !== generated ? text : undefined);
    });
    const bal = balanceOf(c);
    el.innerHTML = html`
      <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-icon="close"></i></button>
      <h3 class="modal-title">Rappel WhatsApp</h3>
      <p class="modal-subtle">${esc(c.name)} · ${esc(c.phone)} · solde ${fmtMAD(bal)}</p>
      <div class="ep-wa-tone"><i data-icon="favorite"></i>Ton volontairement très poli, c'est un voisin, pas un débiteur.</div>
      <div class="ep-wa-bubblewrap">
        <div class="ep-wa-bubble">
          <textarea id="ep-wa-text">${esc(draft ?? generated)}</textarea>
          <div class="ep-wa-meta">${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}</div>
        </div>
      </div>
      <div class="ep-weigh-foot">
        <button class="ep-btn ghost" data-ep-close>Plus tard</button>
        <button class="ep-btn primary" id="ep-wa-send" ${c.phone ? '' : 'disabled'}><i data-icon="send"></i>Envoyer sur WhatsApp</button>
      </div>`;
    openVeil('#ep-wa-veil');
    icons();
    $$('[data-ep-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ep-wa-veil'); });
    $('#ep-wa-send', el).onclick = () => {
      const text = $('#ep-wa-text', el)?.value || waMessage(c);
      const num = String(c.phone || '').replace(/\D/g, '');
      if (!num) { toast(`Ajoutez un numéro à la fiche de ${c.name}`); return; }
      closeVeil('#ep-wa-veil');
      queueIfOffline('Brouillon WhatsApp ouvert');
      try {
        window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        toast(`WhatsApp ouvert pour ${c.name}, appuyez sur envoyer`);
      } catch (_) { toast('Impossible d’ouvrir WhatsApp'); }
    };
  }


return { CARNET, CRED, balanceOf, oldestDebt, totalCredit, advanceTxt, balTxt, uid, histEntry, commitRepayment, recoverRepayments, openCarnetPick, renderCarnet, openArdoise, sinceLabel, entryId, debtDays, ardoiseCard, quickDebt, openSettle, waMessage };
};
})();
