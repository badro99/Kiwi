/* Kiwi · shared attendance-code generator for every specialist caisse. */
(function () {
  'use strict';
  var veil = null, timer = null, expiresTs = 0;

  function merchant() {
    try {
      if (window.KiwiPlatform && typeof window.KiwiPlatform.pairedMerchant === 'function') {
        return window.KiwiPlatform.pairedMerchant();
      }
      var p = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
      return String((p && (p.merchant || p.venueId || p.id)) || '');
    } catch (_) { return ''; }
  }
  function real() {
    try { return !!((window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || merchant()); }
    catch (_) { return false; }
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clock(ts, fallback) {
    return Number(ts) ? new Date(Number(ts)).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : fallback;
  }
  function renderHistory(entries) {
    var host = veil && veil.querySelector('[data-kx-attendance-history]');
    if (!host) return;
    var rows = (Array.isArray(entries) ? entries : []).slice(0, 5);
    host.innerHTML = rows.length ? '<div class="team-section-label">Derniers pointages</div>' + rows.map(function (entry) {
      return '<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);font-size:12px;"><b>'
        + esc(entry.name || 'Employé') + '</b><span>' + esc(clock(entry.inTs, '—')) + ' → '
        + esc(clock(entry.outTs, 'En service')) + '</span></div>';
    }).join('') : '<div class="team-meta">Aucun pointage enregistré.</div>';
  }
  function renderExpiry() {
    var label = veil && veil.querySelector('[data-kx-attendance-expiry]');
    if (!label) return;
    var remaining = Math.max(0, expiresTs - Date.now());
    if (!remaining) { label.textContent = 'Code expiré · générez-en un nouveau'; return; }
    var seconds = Math.ceil(remaining / 1000);
    label.textContent = 'Valide encore ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }
  function refreshHistory() {
    var id = merchant();
    if (!id) return Promise.resolve();
    return fetch('/api/team/live?merchant=' + encodeURIComponent(id), {
      credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
    }).then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) { if (data && data.merchant === id) renderHistory(data.recentAttendance); })
      .catch(function () {});
  }
  function generate() {
    var id = merchant();
    var value = veil.querySelector('[data-kx-attendance-value]');
    var button = veil.querySelector('[data-kx-attendance-new]');
    value.textContent = '······'; button.disabled = true;
    return fetch('/api/team/live', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ merchant: id, action: 'generate-attendance-code' }),
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error(data.error || 'attendance-code-write-failed');
        value.textContent = String(data.code || '').replace(/(.{3})/, '$1 ');
        expiresTs = Number(data.expiresTs) || 0; renderExpiry();
        if (timer) clearInterval(timer);
        timer = setInterval(renderExpiry, 1000);
      });
    }).catch(function () {
      value.textContent = 'Erreur';
      veil.querySelector('[data-kx-attendance-expiry]').textContent = 'Code non généré · vérifiez la connexion';
    }).then(function () { button.disabled = false; });
  }
  function close() {
    if (veil) veil.classList.remove('is-open');
    if (timer) clearInterval(timer);
    timer = null;
  }
  function open() {
    if (!veil) {
      veil = document.createElement('div'); veil.className = 'modal-veil'; veil.id = 'kx-attendance-code-modal';
      veil.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="kx-attendance-title" style="max-width:420px;text-align:center;">'
        + '<h3 class="modal-title" id="kx-attendance-title">Code de pointage</h3><p class="modal-subtle">À saisir dans Kiwi Équipe pour pointer l’arrivée ou le départ.</p>'
        + '<div class="mono" data-kx-attendance-value style="font-size:54px;font-weight:760;letter-spacing:.16em;margin:28px 0 8px;">— — — — — —</div>'
        + '<p class="modal-subtle" data-kx-attendance-expiry>Génération du code…</p><div data-kx-attendance-history style="margin-top:22px;text-align:left;"></div>'
        + '<div class="modal-actions is-visible"><button class="ma-btn primary" data-kx-attendance-new type="button">Nouveau code</button>'
        + '<button class="ma-btn secondary" data-kx-attendance-close type="button">Fermer</button></div></div>';
      veil.addEventListener('click', function (event) { if (event.target === veil) close(); });
      veil.querySelector('[data-kx-attendance-new]').addEventListener('click', generate);
      veil.querySelector('[data-kx-attendance-close]').addEventListener('click', close);
      document.body.appendChild(veil);
    }
    veil.classList.add('is-open'); generate(); refreshHistory();
  }
  function mount(root) {
    if (!root || !real() || root.querySelector('.kx-attendance-code')) return null;
    var lock = root.querySelector('button[id$="-lock"]');
    if (!lock || !lock.parentNode) return null;
    var button = document.createElement('button'); button.type = 'button';
    button.className = ((lock.className || '').trim() + ' kx-attendance-code').trim();
    button.setAttribute('aria-label', 'Code de pointage');
    button.innerHTML = '<i data-lucide="key-round"></i><span>Code de pointage</span>';
    button.addEventListener('click', open); lock.parentNode.insertBefore(button, lock);
    return button;
  }
  window.KiwiCaisseAttendanceCode = { mount: mount, open: open };
})();
