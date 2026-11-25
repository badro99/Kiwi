/* Accords du patron, côté caisse (Browse, 25 nov. 2026).
 *
 * Quand le patron l'a demandé (tableau de bord › Réglages › Accords du patron),
 * une sortie d'espèces ou une annulation ne passe plus par le code d'un
 * responsable : la caisse envoie une DEMANDE à son téléphone et attend.
 *
 *  · Sortie d'espèces : rien n'est écrit et le tiroir ne bouge pas avant
 *    l'accord. La caisse continue de vendre ; une pastille garde la demande
 *    en vue. Accepté, la sortie s'inscrit avec la preuve signée au nom du
 *    patron (functions/api/_owner-approvals.js) ; refusé, rien ne se passe.
 *  · Annulation (ligne déjà en cuisine, vente) : la caisse attend une minute.
 *    Sans réponse, et si le patron l'a permis, le code d'un responsable
 *    reprend la main, comme avant.
 *
 * Deux entrées, aucune nouvelle variable globale à lire pour les écrans :
 *  · le pavé des codes (caisse/settings.js › openAuthorization) consulte déjà
 *    KiwiCaissePairing.permsForAct avec l'acte annoncé ; on s'y intercale
 *    pour « cash_out » (après assets/staff-perms-till.js, qui l'a posé) ;
 *  · les annulations publient un événement « kiwi-owner-approval » ; on le
 *    prend (detail.handled = true) seulement si l'accord est demandé.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof document.addEventListener !== 'function' || typeof window.addEventListener !== 'function') return;
  if (window.KiwiOwnerApproval) return;

  var CANCEL_WAIT_MS = 60000;
  var SETTINGS_EVERY_MS = 5 * 60000;
  var KEY = 'kiwiOwnerApproval@';
  var settings = null, settingsMerchant = '', granted = null, bypass = false;
  var pills = [];

  function tr(s) { try { var L = window.KiwiCaisseLang; return L && L.tr ? L.tr(s) : s; } catch (_) { return s; } }
  function toast(msg) {
    var stack = document.getElementById('toast-stack');
    if (!stack) return;
    var el = document.createElement('div');
    el.className = 'toast is-info';
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(function () { try { el.remove(); } catch (_) {} }, 4200);
  }
  function merchant() {
    try {
      var P = window.KiwiPlatform;
      var pm = P && typeof P.pairedMerchant === 'function' ? P.pairedMerchant() : '';
      if (pm) return String(pm);
      var pv = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
      return String((pv && pv.merchant) || localStorage.getItem('kiwiLiveMerchant') || '');
    } catch (_) { return ''; }
  }
  function staff() { var s = window.KiwiStaff || {}; return { id: String(s.id || '').slice(0, 96), name: String(s.name || '').slice(0, 60) }; }
  function mad(cents) {
    var v = (Number(cents) || 0) / 100;
    var t = v % 1 === 0 ? String(v) : v.toFixed(2).replace('.', ',');
    return t.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' MAD';
  }

  /* ── Réglages : lus au serveur, gardés pour un démarrage hors ligne ── */
  function cached(m) {
    try { var v = JSON.parse(localStorage.getItem(KEY + m) || 'null'); return v && v.settings ? v.settings : null; } catch (_) { return null; }
  }
  function current() {
    var m = merchant();
    if (!m) return null;
    if (settingsMerchant !== m) { settingsMerchant = m; settings = cached(m); }
    return settings;
  }
  function refresh() {
    var m = merchant();
    if (!m || typeof fetch !== 'function') return Promise.resolve(current());
    return fetch('/api/approvals?settings=1&merchant=' + encodeURIComponent(m), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.settings && merchant() === m) {
          settings = j.settings; settingsMerchant = m;
          try { localStorage.setItem(KEY + m, JSON.stringify({ settings: j.settings, at: Date.now() })); } catch (_) {}
        }
        return current();
      }).catch(function () { return current(); });
  }
  /* La même règle que le serveur (_owner-approvals.js › needsApproval). */
  function needs(kind, cents) {
    var s = current();
    if (!s) return false;
    var on = kind === 'cash-out' ? s.cashOut : s.cancel;
    if (!on) return false;
    return !(s.minCents > 0 && Number(cents) > 0 && Number(cents) < s.minCents);
  }
  function fallbackAllowed() { var s = current(); return !s || s.managerFallback !== false; }

  /* ── Le serveur ── */
  function post(body) {
    return fetch('/api/approvals', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(Object.assign({ merchant: merchant() }, body)),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j.ok) { var e = new Error((j && j.error) || 'approval-failed'); e.code = j && j.error; e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function status(id) {
    return fetch('/api/approvals?merchant=' + encodeURIComponent(merchant()) + '&id=' + encodeURIComponent(id), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function withdraw(id) { if (id) post({ action: 'withdraw', id: id }).catch(function () {}); }

  /* Interroge jusqu'à une réponse. `stop()` arrête. */
  function watch(id, onAnswer) {
    var stopped = false, started = Date.now(), timer = null;
    function tick() {
      if (stopped) return;
      status(id).then(function (j) {
        if (stopped) return;
        var st = j && j.approval ? j.approval.status : '';
        if (st === 'granted' && j.grant) { stopped = true; onAnswer('approved', j); return; }
        if (st === 'refused' || st === 'expired' || st === 'withdrawn' || st === 'used') { stopped = true; onAnswer(st, j); return; }
        var wait = Date.now() - started < 120000 ? 2500 : 8000;
        if (document.hidden) wait = Math.max(wait, 8000);
        timer = setTimeout(tick, wait);
      });
    }
    timer = setTimeout(tick, 1500);
    return function stop() { stopped = true; if (timer) clearTimeout(timer); };
  }

  /* ── La feuille d'attente (annulations) ── */
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function sheet(title, line) {
    var veil = el('div', 'modal-veil is-open');
    veil.setAttribute('role', 'dialog');
    veil.setAttribute('aria-modal', 'true');
    veil.id = 'owner-approval-sheet';
    veil.style.zIndex = '1200';
    var box = el('div', 'modal');
    var h = el('h3', 'modal-title', title);
    var sub = el('p', 'modal-subtle', line);
    var state = el('p', 'modal-subtle', tr('En attente de la réponse du patron…'));
    state.setAttribute('aria-live', 'polite');
    state.style.fontWeight = '600';
    var actions = el('div', 'modal-actions is-visible');
    box.appendChild(h); box.appendChild(sub); box.appendChild(state); box.appendChild(actions);
    veil.appendChild(box);
    document.body.appendChild(veil);
    return { veil: veil, title: h, sub: sub, state: state, actions: actions, close: function () { try { veil.remove(); } catch (_) {} } };
  }
  function button(label, primary, onClick) {
    var b = el('button', 'ma-btn ' + (primary ? 'primary' : 'secondary'), label);
    b.type = 'button';
    b.style.flex = '1';
    b.addEventListener('click', onClick);
    return b;
  }

  var KIND_TITLE = { 'void-sent': 'Annulation en cuisine', 'cancel-sale': 'Annulation de vente', 'cash-out': 'Sortie de caisse' };

  /* detail : { kind, ref, label, amountCents, onApproved(grant), onFallback(), onCancel() } */
  function askBlocking(detail) {
    var who = staff();
    var amount = Number(detail.amountCents) > 0 ? ' · ' + mad(detail.amountCents) : '';
    var ui = sheet(tr(KIND_TITLE[detail.kind] || 'Accord du patron') + amount, detail.label || '');
    var id = '', stop = null, countdown = null, done = false, deadline = Date.now() + CANCEL_WAIT_MS;
    var allowFallback = fallbackAllowed();
    function finish(fn, arg) {
      if (done) return;
      done = true;
      if (stop) stop();
      if (countdown) clearInterval(countdown);
      ui.close();
      if (typeof fn === 'function') { try { fn(arg); } catch (_) {} }
    }
    function toManager() { withdraw(id); finish(detail.onFallback); }
    function abandon() { withdraw(id); finish(detail.onCancel); }
    ui.actions.appendChild(button(tr('Annuler la demande'), false, abandon));
    if (allowFallback && typeof detail.onFallback === 'function') ui.actions.appendChild(button(tr('Code manager'), false, toManager));
    function paintWait() {
      var left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (left > 0) { ui.state.textContent = tr('En attente de la réponse du patron · {n} s').replace('{n}', String(left)); return; }
      if (allowFallback && typeof detail.onFallback === 'function') {
        toast(tr('Pas de réponse du patron · code manager'));
        toManager();
        return;
      }
      ui.state.textContent = tr('Pas encore de réponse. La demande reste ouverte.');
    }
    post({ action: 'request', kind: detail.kind, ref: detail.ref, label: detail.label, amountCents: detail.amountCents,
      requestedBy: who.name, requestedById: who.id })
      .then(function (j) {
        if (done) { withdraw(j.approval && j.approval.id); return; }
        id = j.approval.id;
        /* Le serveur a relu le montant et le libellé : la caisse affiche ce que voit le patron. */
        ui.title.textContent = tr(KIND_TITLE[detail.kind] || 'Accord du patron') + (j.approval.amountCents > 0 ? ' · ' + mad(j.approval.amountCents) : '');
        if (j.approval.label) ui.sub.textContent = j.approval.label;
        if (!j.devices) ui.state.textContent = tr('Aucun téléphone du patron ne reçoit les demandes.');
        countdown = setInterval(paintWait, 1000);
        paintWait();
        stop = watch(id, function (answer, res) {
          if (answer === 'approved') {
            var by = (res.grant.actor && res.grant.actor.name) || tr('le patron');
            toast(tr('Accepté par {x}').replace('{x}', by));
            finish(detail.onApproved, res.grant);
          } else if (answer === 'refused') {
            var name = (res.approval && res.approval.decidedBy) || tr('le patron');
            ui.state.textContent = tr('Refusé par {x}').replace('{x}', name);
            if (countdown) clearInterval(countdown);
            setTimeout(function () { finish(detail.onCancel); }, 2200);
            toast(tr('Refusé par {x}').replace('{x}', name));
          } else {
            ui.state.textContent = tr('La demande a expiré.');
            if (countdown) clearInterval(countdown);
          }
        });
      })
      .catch(function (err) {
        if (done) return;
        if (err && err.code === 'approval-off') { finish(detail.onFallback || detail.onCancel); return; }
        if (allowFallback && typeof detail.onFallback === 'function') {
          toast(tr('Demande impossible · code manager'));
          finish(detail.onFallback);
          return;
        }
        ui.state.textContent = tr('Demande impossible. Vérifiez la connexion et réessayez.');
      });
  }

  document.addEventListener('kiwi-owner-approval', function (ev) {
    var d = ev && ev.detail;
    if (!d || d.handled || !needs(d.kind, d.amountCents)) return;
    d.handled = true;
    askBlocking(d);
  });

  /* ── Sortie d'espèces : une pastille, la caisse continue ── */
  function pillHost() {
    var host = document.getElementById('owner-approval-pills');
    if (host) return host;
    host = el('div', '');
    host.id = 'owner-approval-pills';
    host.setAttribute('aria-live', 'polite');
    host.style.cssText = 'position:fixed;inset-inline-end:16px;bottom:16px;z-index:1100;display:flex;flex-direction:column;gap:8px;max-width:min(360px,calc(100vw - 32px))';
    document.body.appendChild(host);
    return host;
  }
  function addPill(text) {
    var row = el('div', 'toast is-info');
    row.style.cssText = 'position:static;display:flex;align-items:center;gap:10px;pointer-events:auto';
    var label = el('span', '', text);
    label.style.flex = '1';
    var cancel = el('button', 'ma-btn secondary', tr('Annuler'));
    cancel.type = 'button';
    row.appendChild(label); row.appendChild(cancel);
    pillHost().appendChild(row);
    return { row: row, label: label, cancel: cancel, remove: function () { try { row.remove(); } catch (_) {} } };
  }

  function askCashOut(act, onApprove) {
    var who = staff();
    var cents = Number(act.amountCents) || 0;
    var pill = addPill(tr('Sortie de caisse · {x} · en attente du patron').replace('{x}', mad(cents)));
    var entry = { id: '', stop: null, pill: pill };
    pills.push(entry);
    function drop() { entry.pill.remove(); pills = pills.filter(function (p) { return p !== entry; }); }
    pill.cancel.addEventListener('click', function () { if (entry.stop) entry.stop(); withdraw(entry.id); drop(); toast(tr('Demande retirée · rien n’est sorti')); });
    post({ action: 'request', kind: 'cash-out', label: String(act.reason || ''), amountCents: cents, requestedBy: who.name, requestedById: who.id })
      .then(function (j) {
        entry.id = j.approval.id;
        if (!j.devices) pill.label.textContent = tr('Sortie de caisse · {x} · aucun téléphone du patron ne reçoit les demandes').replace('{x}', mad(cents));
        entry.stop = watch(entry.id, function (answer, res) {
          drop();
          if (answer === 'approved') {
            granted = { proof: String(res.grant.actProof || ''), at: Date.now() };
            try { onApprove({ id: who.id, name: who.name || tr('Caissier'), role: '', approvedBy: res.grant.actor && res.grant.actor.name, ownerApproval: res.grant.id }); }
            finally { granted = null; }
          } else if (answer === 'refused') {
            toast(tr('Sortie de caisse · {x} · refusée par le patron, rien n’est sorti').replace('{x}', mad(cents)));
          } else {
            toast(tr('Sortie de caisse · {x} · la demande a expiré, rien n’est sorti').replace('{x}', mad(cents)));
          }
        });
      })
      .catch(function (err) {
        drop();
        if (err && err.code === 'approval-off') { rerun(act, onApprove); return; }
        if (fallbackAllowed()) { toast(tr('Demande impossible · code manager')); rerun(act, onApprove); return; }
        toast(tr('Demande impossible, rien n’est sorti. Vérifiez la connexion et réessayez.'));
      });
  }
  /* Le pavé habituel, une fois, sans repasser ici. */
  function rerun(act, onApprove) {
    try {
      if (typeof window.KiwiAuthAct === 'function') window.KiwiAuthAct(act);
      bypass = true;
      if (typeof window.requireTillOperator === 'function') window.requireTillOperator(tr('Sortie de caisse') + ' · ' + mad(act.amountCents), onApprove);
    } finally { bypass = false; }
  }

  function closeCashMoveModal() {
    var m = document.getElementById('cash-move-modal');
    if (m) m.classList.remove('is-open');
  }

  /* ── S'intercaler dans le pavé ── */
  /* Après assets/staff-perms-till.js, qui ne pose son crochet que s'il n'y en a pas :
     au chargement seulement s'il est déjà là, sinon au démarrage, après le sien. */
  function attach(early) {
    var P = window.KiwiCaissePairing;
    if (!P || (early && !P.permsForAct)) return false;
    if (P.permsForAct && P.permsForAct.__owner) return true;
    var prev = P.permsForAct;
    var wrapped = function (act, access, onApprove, authContext, opts) {
      if (!bypass && act && act.kind === 'cash_out' && act.move === 'out' && typeof onApprove === 'function' && needs('cash-out', act.amountCents)) {
        var reasonInput = document.getElementById('cm-custom-input');
        askCashOut(Object.assign({}, act, { reason: reasonInput && reasonInput.value ? reasonInput.value.trim() : '' }), onApprove);
        closeCashMoveModal();
        toast(tr('Demande envoyée au patron · la caisse reste ouverte'));
        return { done: true, ownerApproval: true };
      }
      return typeof prev === 'function' ? prev.apply(this, arguments) : null;
    };
    wrapped.__owner = true;
    wrapped.__ownerPrev = prev;
    P.permsForAct = wrapped;
    var prevProofs = P.permsProofs;
    P.permsProofs = function () {
      var out = typeof prevProofs === 'function' ? (prevProofs.apply(this, arguments) || {}) : {};
      if (granted && granted.proof && Date.now() - granted.at < 5000) out = Object.assign({}, out, { actProof: granted.proof });
      return out;
    };
    return true;
  }

  function boot() {
    attach();
    refresh();
    setInterval(refresh, SETTINGS_EVERY_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
    /* Une caisse fermée ne laisse pas une demande vivante sur le téléphone. */
    window.addEventListener('pagehide', function () {
      pills.forEach(function (p) {
        if (!p.id || !navigator.sendBeacon) return;
        try { navigator.sendBeacon('/api/approvals', new Blob([JSON.stringify({ merchant: merchant(), action: 'withdraw', id: p.id })], { type: 'application/json' })); } catch (_) {}
      });
    });
  }

  window.KiwiOwnerApproval = { needs: needs, refresh: refresh, settings: current };
  attach(true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
