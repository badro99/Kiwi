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
        createdTs: Date.now(), receipts: [] };
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
  async function list(merchant, query) {
    const local = read(merchant);
    let remote = [];
    if (merchant && navigator.onLine !== false) {
      try {
        const url = '/api/retail-balances?merchant=' + encodeURIComponent(merchant)
          + '&q=' + encodeURIComponent(String(query || '').slice(0, 64));
        const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
        if (response.ok) remote = (await response.json()).balances || [];
      } catch (_) { /* The local journal is still readable during an outage. */ }
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
    return [...merged.values()].filter(row => due(row) > 0
      && (!needle || String(row.ticketRef).toLowerCase().includes(needle)
        || String(row.customerId).toLowerCase().includes(needle)));
  }
  async function render(panel, opts) {
    if (!panel) return;
    const prefix = opts.prefix === 'mz' ? 'mz' : 'bq';
    panel.innerHTML = `<div class="kiwi-retail-balances"><header class="krb-head">
      <span class="krb-eyebrow">PAIEMENTS ÉCHELONNÉS</span><h1>Acomptes</h1>
      <p>Retrouvez une note ouverte et encaissez son solde. Chaque paiement compte le jour où il est reçu.</p>
      </header><label class="krb-search"><span>Cliente ou numéro de ticket</span>
        <input type="search" aria-label="Chercher une cliente ou un ticket"
          placeholder="Chercher une cliente ou un ticket…"></label>
      <div class="krb-list" data-retail-balance-list role="list"></div></div>`;
    const input = panel.querySelector('input');
    const target = panel.querySelector('[data-retail-balance-list]');
    let generation = 0;
    async function refresh() {
      const current = ++generation;
      const query = input.value.trim();
      let customerId = '';
      if (query && opts.customerIdForName) customerId = opts.customerIdForName(query) || '';
      const rows = await list(opts.merchant, customerId || query);
      if (current !== generation || !panel.isConnected) return;
      target.replaceChildren();
      if (!rows.length) {
        const empty = document.createElement('p'); empty.className = 'krb-empty';
        empty.textContent = 'Aucune note ouverte pour cette recherche.'; target.appendChild(empty);
      }
      for (const row of rows) {
        const button = document.createElement('button');
        button.className = 'krb-card';
        button.type = 'button';
        const name = opts.customerName ? opts.customerName(row.customerId) : row.customerId;
        const heading = document.createElement('strong'); heading.textContent = row.ticketRef;
        const customer = document.createElement('span'); customer.className = 'krb-customer';
        customer.textContent = name || row.customerId;
        const amount = document.createElement('span'); amount.className = 'krb-amount';
        amount.textContent = `Reste ${(due(row) / 100).toFixed(2)} MAD`;
        button.append(heading, customer, amount);
        if (row.pendingCents > 0) {
          const status = document.createElement('small'); status.className = 'krb-pending';
          status.textContent = 'Synchronisation en attente'; button.appendChild(status);
        }
        button.addEventListener('click', () => opts.onSelect(row));
        target.appendChild(button);
      }
    }
    input.addEventListener('input', () => { void refresh(); });
    await refresh();
  }
  window.KiwiRetailBalances = Object.freeze({ read, record, list, due, render });
})();
