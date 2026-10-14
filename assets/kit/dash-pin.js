/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/dash-pin.js · the dashboard lock on the 2027 pad
 * (spec §10.2, the dashboard lock's rows; stage 3a). Loaded only when the
 * dashboard's flag is on (kiwiSkin2027:dashboard, or ?skin=2027 for one
 * load); with it off the dashboard keeps its shipped four cells.
 *
 *   KiwiDashPin.mount(lock, api)  puts a <k-pin-pad> in the lock and wires it
 *                                 through KiwiPinFlow's 'dashboard' rows
 *   KiwiDashPin.noOwner()         the help line when no owner code exists
 *   KiwiDashPin.focus()           the first key, for the lock's show()
 *
 * `api` is the lock controller in dashboard.html, which keeps every decision
 * the pad does not make: the demo surfaces, the account's code list, the
 * salted rows (KiwiDashPinVault) and the unlock choreography. The table is
 * KiwiPinFlow's, the same one the till and the team pads read.
 *
 * Outside the demo surfaces nothing here differs from the shipped lock: the
 * server is asked first and its no is final; the rows are read only when it
 * cannot answer. On a demo surface the shipped lock opens where the server
 * says no, and so does this one (the demo row of §10.2).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var F = root.KiwiPinFlow, K = root.KiwiKit;
  if (!F || !K) return;
  var doc = root.document;
  var t = function (k, a) { return String(K.t(k, a)).replace(/[⁦-⁩]/g, ''); };

  /* A 401 bad-pin with configured:false: the flow opens the lock, unmatched. */
  var OPEN = { kind: 'answer', status: 401, json: true, body: { error: 'bad-pin', configured: false } };

  var pad = null, flow = null, api = null, lastCode = '', lastBody = null;

  /* The demo surfaces keep the shipped demo rule: a code the server refused,
     a signed-out session, and (on an account nothing has configured yet) no
     answer at all, open the lock unmatched, so 0000 / 0505 / 1111 still reach
     their previews. A configured account is judged as outside the demo. */
  function demo(code, reply) {
    var s = reply.kind === 'answer' ? reply.status : 0;
    var b = reply.body || {};
    if (s === 200 && b.ok && b.staff && api.accessTier(b.staff.role) !== 'staff') return reply;
    if (s === 200 || ((s === 401 || s === 403) && b.error === 'bad-pin')) {
      if (b.configured !== false) api.vaultNote(code, 'no');
      return OPEN;
    }
    if (s === 401 && (!reply.json || b.error === 'unauthorized' || b.error === 'account-revoked')) return OPEN;
    if (s === 403 && (b.error === 'unauthorized' || b.error === 'account-revoked')) return OPEN;
    return api.isConfiguredAccount() ? reply : OPEN;
  }

  function request(code) {
    lastCode = code; lastBody = null;
    /* An unconfigured demo has nobody to ask (the shipped `askable`). */
    if (api.demosOn() && !(api.serverRosterSize() > 0)) return Promise.resolve(OPEN);
    /* The owner's code may live under another establishment: wait for the
       account-wide list before asking, as the shipped lock does. */
    var ready = api.accountPinsPending()
      ? new Promise(function (res) { doc.addEventListener('kiwi-account-pins-ready', res, { once: true }); })
      : Promise.resolve();
    return ready.then(function () {
      /* Offline is known at once: no request, the rows decide. */
      if (root.navigator && root.navigator.onLine === false) return { kind: 'network' };
      return F.send('/api/pin/verify', { pin: code });
    }).then(function (reply) {
      if (reply.kind === 'answer' && reply.body) lastBody = reply.body;
      /* A 200 that is not a proven identity is a no (the shipped askServer). */
      if (reply.kind === 'answer' && reply.status === 200 && !(reply.body && reply.body.ok && reply.body.staff)) {
        reply = { kind: 'answer', status: 401, json: true, body: { error: 'bad-pin' } };
      }
      return api.demosOn() ? demo(code, reply) : reply;
    });
  }

  function mount(lock, a) {
    api = a;
    var inner = lock.querySelector('.kiwi-lock-inner') || lock;
    if (flow) { try { flow.destroy(); } catch (_) {} }
    if (pad && pad.parentNode) pad.parentNode.removeChild(pad);
    lock.classList.add('k-dash-lock');
    pad = doc.createElement('k-pin-pad');
    pad.setAttribute('size', 'ipad');
    pad.setAttribute('sub', t('pin.sub.personal'));
    var anchor = inner.querySelector('[data-kiwi-pin]');
    inner.insertBefore(pad, anchor || inner.firstChild);

    flow = F.attach(pad, {
      use: 'dashboard',
      request: request,
      tier: api.accessTier,
      offline: {
        verify: function (code) { return api.localVerify(code); },
        paused: function () { return api.offlineWait(); },
        forget: function (code) { api.vaultNote(code, 'no'); }
      },
      onSuccess: function (who) {
        var code = lastCode;
        if (who.unmatched) { api.finishUnlock(code, null, false); return; }
        var hit = { id: String(who.id || ''), name: String(who.name || ''), role: String(who.role || ''),
          access: who.access || api.accessTier(who.role), faceMark: '' };
        if (who.verdict === 'online') {
          hit.faceMark = lastBody && typeof lastBody.faceMark === 'string' ? lastBody.faceMark : '';
          api.vaultNote(code, { id: hit.id, name: hit.name, role: hit.role });
        }
        api.finishUnlock(code, hit, true);
      },
      onAction: function (id) { if (id === 'sign-in') root.location.href = '/auth/logout'; }
    });
    paintPlace();
    if (!placeHooked) {
      placeHooked = true;
      doc.addEventListener('kiwi-identity', paintPlace);
      doc.addEventListener('kiwi-account-pins-ready', paintPlace);
      [700, 1800, 3500].forEach(function (ms) { setTimeout(paintPlace, ms); });
    }
    focus();
    return true;
  }

  /* The place the dashboard opens on, read where the shipped lock title reads
     it (greetPlace), and again when the account's identity arrives. */
  var placeHooked = false;
  function paintPlace() {
    var v = '';
    try { v = api && api.place ? api.place() : ''; } catch (_) {}
    if (pad && v) pad.setAttribute('identity', v);
  }

  /* §10.2, revision 21: a list that is not empty, no code above the staff
     tier, no proven row. A help line, not a refusal: the keys stay enabled
     and the first key brings the usual line back. */
  function noOwner() {
    if (!pad) return;
    pad.setAttribute('sub', t('pin.dashboard.no_owner_code'));
    var back = function () {
      pad.setAttribute('sub', t('pin.sub.personal'));
      pad.removeEventListener('pointerdown', back, true);
      pad.removeEventListener('keydown', back, true);
    };
    pad.addEventListener('pointerdown', back, true);
    pad.addEventListener('keydown', back, true);
  }

  function focus() {
    setTimeout(function () { var k = pad && pad.shadowRoot && pad.shadowRoot.querySelector('[data-key="1"]'); if (k) k.focus({ preventScroll: true }); }, 0);
  }

  root.KiwiDashPin = { mount: mount, noOwner: noOwner, focus: focus, pad: function () { return pad; } };
})(typeof window !== 'undefined' ? window : globalThis);
