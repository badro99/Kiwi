/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/team-pin.js · the team app's code doors on the 2027 pad
 * (spec §18.10 and §10.2's team and clock rows; stage 3a). Loaded only when
 * the team app's flag is on (kiwiSkin2027:team, or ?skin=2027 for one load);
 * with it off kiwi-serveur.html keeps its shipped form and code field.
 *
 *   KiwiTeamPin.signIn(screen, api)   two steps: the e-mail, then the pad.
 *     api.request(email, code, opId) optional: signs in itself (the team
 *                                    app's own login) → a reply
 *     api.signedIn() → Promise       after the server's yes (the host loads
 *                                    the session and opens it)
 *   KiwiTeamPin.reset()               back to step 1, the e-mail kept
 *   KiwiTeamPin.clock(screen, api)    the attendance pad, six digits:
 *     api.action                     'clock-in' | 'clock-out'
 *     api.body(code)                 the request body (clock-out carries the
 *                                    shift's progress)
 *     api.request(code, opId)        optional: sends the punch itself (the
 *                                    team app's offline queue) → a reply
 *     api.done(body)                 the server recorded it
 *     api.signIn()                   the session ended: back to the sign-in
 *
 * The pad never decides: KiwiPinFlow reads every answer from one table, and
 * the server judges every code (findEmployeeCredential, the attendance code).
 * No connection retries by itself for these two uses only (§10.2).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var F = root.KiwiPinFlow, K = root.KiwiKit;
  if (!F || !K) return;
  var doc = root.document;
  var t = function (k, a) { return String(K.t(k, a)).replace(/[⁦-⁩]/g, ''); };
  var EMAIL = /^\S+@\S+\.\S+$/;

  function el(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function focusKey(pad) {
    setTimeout(function () { var k = pad && pad.shadowRoot && pad.shadowRoot.querySelector('[data-key="1"]'); if (k) k.focus({ preventScroll: true }); }, 0);
  }

  /* ── the sign-in ─────────────────────────────────────────────────────── */
  var S = { screen: null, api: null, box: null, step1: null, step2: null, input: null, next: null, pad: null, flow: null };

  function signIn(screen, api) {
    S.screen = screen; S.api = api;
    screen.classList.add('k-team-screen');
    if (!S.box) {
      S.box = el('div', 'k-team-signin');
      /* Step 1: the e-mail. The pad is not on this screen, so no digit can be
         sent without an address (§18.10). A native field, so the device's
         password manager can offer the username. */
      S.step1 = el('form', 'k-team-step');
      S.step1.setAttribute('novalidate', '');
      var h = el('h1', 'k-heading k-team-title', t('team.signin.title'));
      var label = el('label', 'k-foot-s k-ink2 k-team-label', t('team.email.label'));
      label.setAttribute('for', 'k-team-email');
      S.input = el('input', 'k-body k-team-email');
      S.input.id = 'k-team-email';
      S.input.type = 'email';
      S.input.setAttribute('inputmode', 'email');
      S.input.setAttribute('autocomplete', 'username');
      S.input.setAttribute('enterkeyhint', 'next');
      S.input.setAttribute('autocapitalize', 'off');
      S.input.setAttribute('spellcheck', 'false');
      var reason = el('p', 'k-foot k-ink2 k-team-reason', t('team.email.reason'));
      reason.id = 'k-team-reason';
      S.next = el('button', 'k-team-next', t('team.signin.next'));
      S.next.type = 'submit';
      S.next.setAttribute('aria-describedby', 'k-team-reason');
      S.step1.appendChild(h); S.step1.appendChild(label); S.step1.appendChild(S.input);
      S.step1.appendChild(reason); S.step1.appendChild(S.next);
      S.step1.addEventListener('submit', function (e) { e.preventDefault(); toCode(); });
      S.input.addEventListener('input', syncNext);
      S.step2 = el('div', 'k-team-step');
      S.step2.hidden = true;
      S.box.appendChild(S.step1); S.box.appendChild(S.step2);
      /* Above the shipped note, where the form stood. */
      screen.insertBefore(S.box, screen.querySelector('.pin-foot'));
    }
    toEmail();
    return true;
  }
  function syncNext() {
    var ok = EMAIL.test(String(S.input.value || '').trim());
    S.next.setAttribute('aria-disabled', ok ? 'false' : 'true');
    S.next.classList.toggle('is-off', !ok);
    /* The reason keeps its line when it is not needed, so the button does not
       jump up under the finger as the address becomes valid. */
    var r = S.box.querySelector('.k-team-reason');
    if (r) { r.hidden = false; r.style.visibility = ok ? 'hidden' : ''; r.setAttribute('aria-hidden', ok ? 'true' : 'false'); }
    if (ok) S.next.removeAttribute('aria-describedby'); else S.next.setAttribute('aria-describedby', 'k-team-reason');
  }
  function toEmail() {
    if (S.flow) { try { S.flow.destroy(); } catch (_) {} S.flow = null; }
    S.step2.textContent = '';
    S.step2.hidden = true;
    S.step1.hidden = false;
    if (S.screen) S.screen.removeAttribute('data-k-team-step');
    syncNext();
    setTimeout(function () { try { S.input.focus({ preventScroll: true }); } catch (_) {} }, 0);
  }
  function toCode() {
    var email = String(S.input.value || '').trim();
    if (!EMAIL.test(email)) { syncNext(); return; }
    S.step1.hidden = true;
    S.step2.hidden = false;
    /* The page drops the brand on a short screen for this step (§18.10 has
       none above the identity line), so the pad never scrolls. */
    if (S.screen) S.screen.setAttribute('data-k-team-step', 'code');
    S.step2.textContent = '';
    var pad = S.pad = doc.createElement('k-pin-pad');
    pad.setAttribute('identity', email);
    pad.setAttribute('heading', t('pin.title'));
    pad.setAttribute('sub', t('pin.sub.personal'));
    pad.setAttribute('extra', t('team.edit_email'));
    S.step2.appendChild(pad);
    pad.addEventListener('kiwi:action', function (e) {
      if (e.detail && e.detail.action === 'k.pin-pad.extra') toEmail();
    });
    S.flow = F.attach(pad, {
      use: 'team',
      email: email,
      request: S.api && typeof S.api.request === 'function' ? function (code, opId) { return S.api.request(email, code, opId); } : undefined,
      onSuccess: function () {
        /* No haptic on a successful sign-in (§15.1): the new screen says it. */
        Promise.resolve(S.api && S.api.signedIn ? S.api.signedIn() : null).then(function () {
          if (S.flow) { try { S.flow.destroy(); } catch (_) {} S.flow = null; }
        }, function () {
          /* The session could not be loaded after the yes: the code was right,
             the network then failed. Back to a usable pad. */
          pad.answer({ message: t('pin.unavailable'), keys: 'enabled', clear: true, action: null });
        });
      }
    });
    focusKey(pad);
  }
  function reset() { if (S.box) toEmail(); }

  /* ── clock-in and clock-out ──────────────────────────────────────────── */
  var C = { box: null, pad: null, flow: null };
  function clock(screen, api) {
    screen.classList.add('k-team-screen');
    if (C.flow) { try { C.flow.destroy(); } catch (_) {} C.flow = null; }
    if (!C.box) { C.box = el('div', 'k-team-clock'); screen.insertBefore(C.box, screen.querySelector('.ci-mid') || null); }
    C.box.textContent = '';
    var pad = C.pad = doc.createElement('k-pin-pad');
    pad.setAttribute('heading', t('clock.code.title'));
    pad.setAttribute('sub', t('clock.code.sub'));
    pad.setAttribute('identity', t(api.action === 'clock-out' ? 'clock.out' : 'clock.in'));
    C.box.appendChild(pad);
    C.flow = F.attach(pad, {
      use: 'clock',
      clockAction: api.action === 'clock-out' ? 'clock-out' : 'clock-in',
      body: typeof api.body === 'function' ? api.body : undefined,
      request: typeof api.request === 'function' ? api.request : undefined,
      onSuccess: function (body) { if (api.done) api.done(body || {}); },
      onAction: function (id) { if (id === 'sign-in' && api.signIn) api.signIn(); }
    });
    focusKey(pad);
    return true;
  }

  root.KiwiTeamPin = { signIn: signIn, reset: reset, clock: clock,
    pad: function () { return S.pad; }, clockPad: function () { return C.pad; } };
})(typeof window !== 'undefined' ? window : globalThis);
