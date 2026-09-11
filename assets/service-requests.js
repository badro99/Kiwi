/* A shared, acknowledged inbox. Orders and payments never live here. */
(function () {
  'use strict';
  let merchant = '', requests = [], options = {}, revision = 0, signature = '';
  let chip, dialog, list, notice;
  const seen = new Set();
  const esc = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const label = r => r.action === 'ask-bill' ? 'Addition demandée' : 'Appel client';
  function mount() {
    if (chip) return;
    const style = document.createElement('style');
    style.textContent = `
      #ksr-chip{position:fixed;left:96px;bottom:calc(82px + env(safe-area-inset-bottom,0px));z-index:930;border:1px solid #c7dccf;border-radius:16px;background:#eff9f2;color:#123e2c;padding:12px 16px;min-height:48px;box-shadow:0 8px 28px #102a1c25;font:600 14px/1.3 system-ui;cursor:pointer}
      #ksr-chip[hidden]{display:none}#ksr-chip strong{display:inline-grid;place-items:center;margin-left:8px;background:#134e38;color:white;border-radius:20px;min-width:24px;height:24px}
      #ksr-dialog{box-sizing:border-box;width:min(480px,calc(100vw - 24px));max-height:calc(100dvh - 40px);padding:0;border:1px solid #dbe5dc;border-radius:24px;background:#f8faf7;color:#172e23;box-shadow:0 28px 90px #061b2240;font:14px/1.5 system-ui}
      #ksr-dialog::backdrop{background:#0a201a66;backdrop-filter:blur(3px)}
      #ksr-dialog header{display:flex;align-items:center;gap:12px;padding:22px 24px;border-bottom:1px solid #dbe5dc}#ksr-dialog h2{margin:0;font-size:22px;letter-spacing:-.6px}#ksr-dialog p{margin:4px 0;color:#516658}
      #ksr-dialog button{font:600 14px system-ui;min-height:44px;padding:10px 14px;border:1px solid #cad9cd;border-radius:12px;background:white;color:#173e2b;cursor:pointer}#ksr-dialog button:disabled{opacity:.55;cursor:wait}
      #ksr-dialog button:focus-visible,#ksr-chip:focus-visible{outline:3px solid #238660;outline-offset:3px}
      #ksr-close{margin-left:auto;min-width:44px}#ksr-list{padding:16px 20px;overflow-y:auto;max-height:60dvh}#ksr-list article{padding:16px;margin-bottom:12px;border:1px solid #dce5dc;border-radius:18px;background:white}#ksr-list h3{margin:4px 0;font-size:18px}#ksr-list small{color:#58705f}#ksr-list footer{display:flex;gap:8px;margin-top:14px}#ksr-list [data-done]{background:#134e38;color:white;border-color:#134e38;flex:1}#ksr-notice{padding:0 24px 16px;color:#93442b}
      @media(max-width:600px){#ksr-chip{left:12px;bottom:calc(78px + env(safe-area-inset-bottom,0px));font-size:13px;padding:9px 12px}#ksr-dialog header{padding:18px}#ksr-list{padding:12px}}
      @media print{#ksr-chip,#ksr-dialog{display:none!important}}
    `;
    document.head.appendChild(style);
    chip = document.createElement('button'); chip.id = 'ksr-chip'; chip.type = 'button';
    chip.setAttribute('aria-haspopup', 'dialog'); chip.setAttribute('aria-controls', 'ksr-dialog'); chip.hidden = true;
    dialog = document.createElement('dialog'); dialog.id = 'ksr-dialog'; dialog.setAttribute('aria-labelledby', 'ksr-title');
    dialog.innerHTML = '<header><div><h2 id="ksr-title">Demandes clients</h2><p>Caisse et équipe · suivi partagé</p></div><button id="ksr-close" type="button" aria-label="Fermer">×</button></header><div id="ksr-list"></div><div id="ksr-notice" role="status" aria-live="polite"></div>';
    document.body.append(chip, dialog);
    list = dialog.querySelector('#ksr-list'); notice = dialog.querySelector('#ksr-notice');
    chip.addEventListener('click', () => { render(); dialog.showModal(); });
    dialog.querySelector('#ksr-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const buttons = Array.from(dialog.querySelectorAll('button:not(:disabled)'));
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    dialog.addEventListener('click', async e => {
      const button = e.target.closest('[data-done],[data-table]');
      if (!button) return;
      if (button.hasAttribute('data-table')) { dialog.close(); options.openTable?.(button.dataset.table); return; }
      const id = button.dataset.done, scope = merchant;
      button.disabled = true; notice.textContent = '';
      try {
        const response = await fetch('/api/service/events', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: scope, ackRequest: id }) });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error('not-saved');
        if (merchant !== scope) return;
        revision = Math.max(revision, Number(result.rev) || 0);
        requests = requests.filter(r => r.id !== id); signature = ''; render();
        options.refresh?.();
      } catch (_) { if (merchant === scope) notice.textContent = 'Non enregistré. Vérifiez la connexion puis réessayez.'; }
      finally { button.disabled = false; }
    });
  }
  function render() {
    if (!chip) return;
    chip.hidden = !requests.length;
    chip.innerHTML = 'Demandes clients <strong>' + requests.length + '</strong>';
    chip.setAttribute('aria-label', requests.length + ' demande(s) client à traiter');
    const next = JSON.stringify(requests);
    if (signature === next) return;
    signature = next;
    const hadListFocus = list.contains(document.activeElement);
    list.innerHTML = requests.length ? requests.map(r => '<article><small>Table ' + esc(r.table) + '</small><h3>' + label(r) + '</h3><small>' + esc(new Date(r.ts).toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' })) + ' · À traiter</small><footer><button type="button" data-table="' + esc(r.table) + '">Voir la table</button><button type="button" data-done="' + esc(r.id) + '">Traité</button></footer></article>').join('') : '<p>Aucune demande en attente. Tout est à jour.</p>';
    if (dialog.open && hadListFocus) dialog.querySelector('#ksr-close').focus();
  }
  function reset() {
    requests = []; merchant = ''; revision = 0; signature = ''; seen.clear();
    if (dialog?.open) dialog.close();
    render();
  }
  window.KiwiServiceRequests = {
    ingest(data, config) {
      if (!data?.ok || !Array.isArray(data.requests) || !config?.merchant) return;
      if (merchant !== config.merchant) reset();
      merchant = config.merchant; options = config;
      if (Number(data.rev) < revision) return;
      revision = Number(data.rev) || revision;
      requests = data.requests;
      mount(); render();
      const fresh = requests.filter(r => !seen.has(r.id));
      fresh.forEach(r => seen.add(r.id));
      if (fresh.length) config.notify?.(fresh.length === 1 ? 'Table ' + fresh[0].table + ' · ' + label(fresh[0]) : fresh.length + ' demandes clients à traiter');
    }, reset,
  };
  window.addEventListener('kiwi-paired', reset);
})();
