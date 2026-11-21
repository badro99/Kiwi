/* Boutique / Maison open bills. The local journal makes a payment survivable
 * offline; /api/retail-balances is the durable cross-device authority. Never
 * merge accounts: the merchant slug is part of every storage key and request. */
(function () {
  'use strict';
  function key(merchant) { return 'kiwi:retailBalances:' + String(merchant || '').slice(0, 64); }
  function read(merchant) {
    try { const rows = JSON.parse(localStorage.getItem(key(merchant)) || '[]'); return Array.isArray(rows) ? rows : []; }
    catch (_) { return []; }
  }
  function write(merchant, rows) {
    try { localStorage.setItem(key(merchant), JSON.stringify(rows.slice(0, 500))); return true; }
    catch (_) { return false; }
  }
  function cents(value) { return Math.round(Number(value) || 0); }
  function due(row) { return Math.max(0, cents(row.totalCents) - cents(row.paidCents) - cents(row.pendingCents)); }
  function record(merchant, input) {
    if (!merchant || !input || !input.id || !input.customerId || !input.ticketRef) return null;
    const rows = read(merchant);
    let row = rows.find(item => item.id === input.id);
    if (!row) {
      row = { id: String(input.id), customerId: String(input.customerId), ticketRef: String(input.ticketRef),
        totalCents: cents(input.totalCents), paidCents: cents(input.basePaidCents), pendingCents: 0,
        createdTs: Date.now(), receipts: [],
        /* L'avance (pièce gardée jusqu'à une date) ou le compte client ; le
           serveur fait foi, cette copie sert hors ligne (retail-avance.js). */
        kind: String(input.kind || ''), expiresAt: Math.max(0, Number(input.expiresAt) || 0),
        lines: Array.isArray(input.lines) ? input.lines.slice(0, 40) : [] };
      rows.unshift(row);
    } else if (row.customerId !== input.customerId || row.ticketRef !== input.ticketRef
      || row.totalCents !== cents(input.totalCents)) return null;
    // A remote payment may have arrived from another till since this browser
    // last opened the note. Never reduce the authoritative amount already paid.
    row.paidCents = Math.max(cents(row.paidCents), cents(input.basePaidCents));
    const receipt = input.receipt;
    if (receipt && !row.receipts.some(item => item.id === receipt.id)) {
      const amount = cents(receipt.amountCents);
      if (amount < 1 || amount > due(row)) return null;
      row.receipts.push({ id: String(receipt.id), amountCents: amount,
        method: String(receipt.method), ts: Number(receipt.ts) || Date.now() });
      row.paidCents += amount;
    }
    if (!write(merchant, rows)) return null;
    return row;
  }
  /* `status` dit d'où viennent les notes : 'ok' (serveur lu), 'offline' (appareil hors ligne)
     ou 'read-failed' (le serveur n'a pas répondu à temps ou a refusé). Hors 'ok', la liste n'est
     que le journal de CET appareil : une note ouverte sur une autre caisse peut manquer. */
  async function listWithStatus(merchant, query) {
    const local = read(merchant);
    let remote = [], status = 'ok';
    if (!merchant) status = 'ok';
    else if (navigator.onLine === false) status = 'offline';
    else {
      try {
        const url = '/api/retail-balances?merchant=' + encodeURIComponent(merchant)
          + '&q=' + encodeURIComponent(String(query || '').slice(0, 64));
        /* Hard deadline on the request and its body: a connection that is up but
           stalled must not hold back the local journal. */
        const { deadlineFetch } = await import('./request-deadline.mjs');
        const response = await deadlineFetch(url, { credentials: 'same-origin', cache: 'no-store' }, 6000);
        if (!response.ok) status = 'read-failed';
        else {
          const body = await response.json();
          if (!body || !Array.isArray(body.balances)) status = 'read-failed'; else remote = body.balances;
        }
      } catch (_) { status = 'read-failed'; /* The local journal is still readable during an outage or a stall. */ }
    }
    const merged = new Map(local.map(row => [row.id, row]));
    remote.forEach(row => {
      const saved = merged.get(row.id);
      // Cross-device totals and local outbox payments are disjoint by receipt
      // ID, not by amount: another till can have taken money simultaneously.
      if (saved && Array.isArray(row.receiptIds)) {
        const known = new Set(row.receiptIds);
        const unsynced = (saved.receipts || []).filter(item => !known.has(item.id))
          .reduce((sum, item) => sum + cents(item.amountCents), 0);
        merged.set(row.id, { ...row, pendingCents: cents(row.pendingCents) + unsynced });
      } else if (saved && cents(saved.paidCents) > cents(row.paidCents) + cents(row.pendingCents)) {
        merged.set(row.id, { ...row, paidCents: saved.paidCents });
      } else merged.set(row.id, row);
    });
    const needle = String(query || '').toLowerCase();
    const rows = [...merged.values()].filter(row => due(row) > 0
      && (!needle || String(row.ticketRef).toLowerCase().includes(needle)
        || String(row.customerId).toLowerCase().includes(needle)));
    return { rows, status };
  }
  async function list(merchant, query) { return (await listWithStatus(merchant, query)).rows; }
  /* Acomptes par cliente (La Maison en Vogue, 20 nov. 2026). L'écran listait
     les notes une par une ; une cliente qui en a trois devait les payer trois
     fois. Les notes se regroupent par cliente, la plus ancienne d'abord, et un
     montant reçu les couvre dans cet ordre. Chaque note garde son propre reçu. */
  function byAge(a, b) {
    return (Number(a.createdTs) || 0) - (Number(b.createdTs) || 0) || String(a.ticketRef).localeCompare(String(b.ticketRef));
  }
  function groupByCustomer(rows) {
    const map = new Map();
    (rows || []).forEach(row => {
      if (!row || !(due(row) > 0)) return;
      const id = String(row.customerId || '');
      if (!map.has(id)) map.set(id, { customerId: id, rows: [], dueCents: 0, oldestTs: 0 });
      const group = map.get(id); group.rows.push(row); group.dueCents += due(row);
    });
    return [...map.values()].map(group => {
      group.rows.sort(byAge); group.oldestTs = Number(group.rows[0].createdTs) || 0; return group;
    }).sort((a, b) => b.dueCents - a.dueCents || a.oldestTs - b.oldestTs);
  }
  /* Le montant couvre les notes de la plus ancienne à la plus récente, jamais
     plus que leur reste ; une note en attente de synchronisation n'est pas touchée. */
  function allocate(rows, amountCents) {
    let left = Math.max(0, cents(amountCents));
    const out = [];
    (rows || []).filter(row => row && !(cents(row.pendingCents) > 0) && due(row) > 0).slice().sort(byAge).forEach(row => {
      if (left <= 0) return;
      const take = Math.min(left, due(row)); left -= take; out.push({ row, cents: take });
    });
    return out;
  }
  /* Les modes de paiement se partagent entre les notes dans l'ordre : chaque
     reçu porte sa part d'espèces, de carte ou d'avoir, et la somme tombe juste. */
  function sliceTender(parts, amountsCents) {
    const queue = (parts || []).filter(part => part && Number(part.amount) > 0)
      .map(part => ({ m: part.m, code: part.code, left: Math.round(Number(part.amount) * 100) }));
    return (amountsCents || []).map(amount => {
      let need = Math.max(0, cents(amount)); const slice = [];
      while (need > 0 && queue.length) {
        const head = queue[0]; const take = Math.min(need, head.left);
        const piece = { m: head.m, amount: take / 100 }; if (head.code) piece.code = head.code;
        slice.push(piece); head.left -= take; need -= take;
        if (head.left <= 0) queue.shift();
      }
      return slice;
    });
  }
  const mad = value => (cents(value) / 100).toFixed(2);
  const day = ts => { const d = new Date(Number(ts) || 0); return Number(ts) > 0 ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear() : ''; };
  function el(tag, className, text) {
    const node = document.createElement(tag); if (className) node.className = className;
    if (text != null) node.textContent = text; return node;
  }
  /* La fiche cliente du carnet (assets/client-money.js) ouvre Acomptes sur
     une cliente : elle pose son id ici puis touche l'entrée du rail. L'écran
     le reprend au prochain rendu, dans les 5 secondes, une seule fois. */
  let focusFor = '', focusTs = 0;
  function focus(customerId) { focusFor = String(customerId || ''); focusTs = Date.now(); }
  function takeFocus() { const id = Date.now() - focusTs < 5000 ? focusFor : ''; focusFor = ''; return id; }
  async function render(panel, opts) {
    if (!panel) return;
    const tr = opts.tr || (text => text);
    const name = id => (opts.customerName ? opts.customerName(id) : id) || id;
    panel.innerHTML = `<div class="kiwi-retail-balances"><header class="krb-head">
      <span class="krb-eyebrow">PAIEMENTS ÉCHELONNÉS</span><h1>Acomptes</h1>
      <p>Retrouvez une cliente et encaissez ce qu’elle doit. Chaque paiement compte le jour où il est reçu.</p>
      </header><label class="krb-search"><span>Cliente ou numéro de ticket</span>
        <input type="search" aria-label="Chercher une cliente ou un ticket"
          placeholder="Chercher une cliente ou un ticket…"></label>
      <div class="krb-list" data-retail-balance-list role="list"></div></div>`;
    const input = panel.querySelector('input');
    const target = panel.querySelector('[data-retail-balance-list]');
    const search = panel.querySelector('.krb-search');
    let generation = 0, groups = [];
    function note(className, text) { const p = el('p', className, text); p.role = 'status'; return p; }
    async function refresh() {
      const current = ++generation;
      const { rows, status } = await listWithStatus(opts.merchant, '');
      if (current !== generation || !panel.isConnected) return;
      groups = groupByCustomer(rows);
      const want = opts.customerId || takeFocus(); opts.customerId = '';
      if (want) { const open = groups.find(group => group.customerId === want); if (open) { detail(open); return; } }
      list(status);
    }
    function list(status) {
      if (search) search.hidden = false;
      const needle = input.value.trim().toLowerCase();
      const shown = groups.filter(group => !needle || String(name(group.customerId)).toLowerCase().includes(needle)
        || group.rows.some(row => String(row.ticketRef).toLowerCase().includes(needle)));
      target.replaceChildren();
      if (status && status !== 'ok') target.appendChild(note('krb-empty krb-stale', 'Notes du serveur indisponibles : seules les notes de cet appareil sont affichées.'));
      if (!shown.length) target.appendChild(note('krb-empty', 'Aucune note ouverte pour cette recherche.'));
      for (const group of shown) {
        const button = el('button', 'krb-card'); button.type = 'button';
        const count = group.rows.length;
        button.append(el('strong', '', name(group.customerId)),
          el('span', 'krb-customer', tr(count > 1 ? `${count} notes ouvertes` : `${count} note ouverte`) + (group.oldestTs ? ' · ' + day(group.oldestTs) : '')),
          el('span', 'krb-amount', tr(`Reste ${mad(group.dueCents)} MAD`)));
        if (group.rows.some(row => cents(row.pendingCents) > 0)) button.appendChild(el('small', 'krb-pending', tr('Synchronisation en attente')));
        button.addEventListener('click', () => detail(group));
        target.appendChild(button);
      }
    }
    function detail(group) {
      if (search) search.hidden = true;
      const payable = group.rows.filter(row => !(cents(row.pendingCents) > 0) && due(row) > 0);
      const owed = payable.reduce((sum, row) => sum + due(row), 0);
      const checked = new Set(payable.map(row => row.id));
      let amount = owed;
      target.replaceChildren();
      const back = el('button', 'krb-back', tr('Toutes les clientes')); back.type = 'button';
      back.addEventListener('click', () => { generation++; list(); });
      const head = el('div', 'krb-client');
      head.append(el('strong', '', name(group.customerId)), el('span', 'krb-amount', tr(`Reste ${mad(group.dueCents)} MAD`)),
        el('p', '', tr('Cochez les notes qu’elle règle, ou tapez le montant qu’elle donne : il couvre d’abord les plus anciennes.')));
      target.append(back, head);
      const lines = new Map();
      for (const row of group.rows) {
        const locked = !payable.includes(row);
        const line = el('label', 'krb-note' + (locked ? ' is-locked' : ''));
        const box = document.createElement('input'); box.type = 'checkbox'; box.disabled = locked; box.checked = !locked;
        const text = el('span', 'krb-note-text');
        const held = row.kind === 'avance' && Number(row.expiresAt) > 0
          ? (Number(row.expiresAt) <= Date.now() ? tr('Avance expirée le') : tr('Pièce gardée jusqu’au')) + ' ' + day(row.expiresAt) : '';
        text.append(el('strong', '', row.ticketRef), el('small', '', [day(row.createdTs), tr(`Total ${mad(row.totalCents)} MAD`), tr(`Payé ${mad(cents(row.paidCents) + cents(row.pendingCents))} MAD`), held].filter(Boolean).join(' · ')));
        const side = el('span', 'krb-note-side'); const left = el('span', 'krb-note-due', tr(`Reste ${mad(due(row))} MAD`));
        const cover = el('small', 'krb-note-cover', locked ? tr('Synchronisation en attente') : '');
        side.append(left, cover); line.append(box, text, side); target.appendChild(line);
        if (!locked) {
          lines.set(row.id, { box, cover, row });
          box.addEventListener('change', () => {
            if (box.checked) checked.add(row.id); else checked.delete(row.id);
            amount = payable.filter(item => checked.has(item.id)).reduce((sum, item) => sum + due(item), 0);
            field.value = mad(amount); paint();
          });
        }
      }
      const pay = el('div', 'krb-pay');
      const label = el('label', 'krb-search'); label.appendChild(el('span', '', tr('Montant qu’elle donne')));
      const field = document.createElement('input'); field.type = 'text'; field.inputMode = 'decimal'; field.value = mad(amount);
      field.setAttribute('aria-label', tr('Montant qu’elle donne')); label.appendChild(field);
      const hint = el('small', 'krb-hint', '');
      const go = el('button', 'krb-go', ''); go.type = 'button';
      pay.append(label, hint, go); target.appendChild(pay);
      field.addEventListener('input', () => {
        const typed = Math.round(Number(String(field.value).replace(',', '.').replace(/[^\d.]/g, '')) * 100) || 0;
        amount = Math.min(typed, owed);
        hint.textContent = typed > owed ? tr(`Elle ne doit que ${mad(owed)} MAD`) : '';
        const covered = new Set(allocate(payable, amount).map(item => item.row.id));
        checked.clear(); covered.forEach(id => checked.add(id));
        paint();
      });
      function plan() { return allocate(payable.filter(row => checked.has(row.id)), amount); }
      function paint() {
        const parts = new Map(plan().map(item => [item.row.id, item.cents]));
        lines.forEach(({ box, cover, row }) => {
          box.checked = checked.has(row.id);
          const part = parts.get(row.id) || 0;
          cover.textContent = !part ? '' : part >= due(row) ? tr('Soldée') : tr(`Couvre ${mad(part)} MAD`);
        });
        const total = [...parts.values()].reduce((sum, part) => sum + part, 0);
        go.textContent = tr(`Encaisser ${mad(total)} MAD`); go.disabled = !(total > 0);
      }
      go.addEventListener('click', () => {
        const chosen = plan(); if (!chosen.length) return;
        const amountCents = chosen.reduce((sum, item) => sum + item.cents, 0);
        if (opts.onSettle) opts.onSettle({ customerId: group.customerId, rows: chosen.map(item => item.row), amountCents });
        else if (chosen.length === 1 && opts.onSelect) opts.onSelect(chosen[0].row);
      });
      paint();
    }
    input.addEventListener('input', () => list());
    await refresh();
  }
  window.KiwiRetailBalances = Object.freeze({ read, record, list, listWithStatus, due, render, groupByCustomer, allocate, sliceTender, focus });
})();
