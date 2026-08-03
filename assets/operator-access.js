/* Kiwi — global operator access. Long-press ANY Kiwi logo (~1.4 s), anywhere in
 * the app, at any stage, to open a discreet operator-code prompt → the operator
 * console (kiwi-admin.html). No visible affordance; clients never discover it.
 *
 * Targets the real Kiwi brand marks only (the generic .logo class is used for
 * partner/integration logos and is deliberately excluded). Add data-kiwi-logo to
 * any future logo to include it. Verifies the code via POST /auth/operator, which
 * works whether you're logged in or not. Vanilla, no innerHTML, fail-safe: if the
 * endpoint is missing (no backend) the prompt simply reports an error and closes.
 */
(function () {
  'use strict';

  // Every Kiwi brand mark across every app and screen. The apps use a family of
  // per-screen wordmark classes — `.brand`, `.kob-brand` (onboarding), `.pin-brand`,
  // `.ht-brand`, `.tr-brand`, `.kw-topbar-brand`, … — all ending in "brand", so we
  // match the whole family by substring instead of enumerating (future screens are
  // covered automatically). Plus the plain `.wordmark` and the onboarding egg mark.
  // Deliberately NOT `.logo` (that class is for partner/integration logos).
  var LOGO_SEL = '[data-kiwi-logo], [class*="brand"], .wordmark, .kob-hero-mark';

  var HOLD_MS = 1400;
  var hold = null, startXY = null, open = false;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function onDown(e) {
    if (open) return;
    var t = e.target && e.target.closest ? e.target.closest(LOGO_SEL) : null;
    if (!t) return;
    var p = (e.touches && e.touches[0]) || e;
    startXY = { x: p.clientX || 0, y: p.clientY || 0 };
    cancel();
    hold = setTimeout(openPrompt, HOLD_MS);
  }
  function onMove(e) {
    if (!hold || !startXY) return;
    var p = (e.touches && e.touches[0]) || e;
    if (Math.abs((p.clientX || 0) - startXY.x) > 10 || Math.abs((p.clientY || 0) - startXY.y) > 10) cancel();
  }
  function cancel() { if (hold) { clearTimeout(hold); hold = null; } }

  function openPrompt() {
    cancel();
    if (open) return;
    open = true;

    var veil = el('div');
    veil.setAttribute('style',
      'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(5,20,15,.55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);padding:20px;' +
      'font:15px/1.5 -apple-system,BlinkMacSystemFont,"Inter Tight",Inter,"Segoe UI",sans-serif');

    var card = el('div');
    card.setAttribute('style',
      'width:100%;max-width:320px;background:var(--surface);color:#0A0F0D;border-radius:16px;padding:22px 20px;' +
      'box-shadow:0 24px 60px -20px rgba(5,48,31,.6);text-align:center');
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      card.style.background = '#151b18'; card.style.color = '#e8efe9';
    }

    var title = el('div', null, 'Accès opérateur');
    title.setAttribute('style', 'font-weight:640;letter-spacing:-.01em;margin:0 0 12px;font-size:1.02rem');

    var input = el('input');
    input.type = 'password'; input.setAttribute('inputmode', 'numeric');
    input.setAttribute('autocomplete', 'off'); input.placeholder = 'Code opérateur';
    input.setAttribute('aria-label', 'Code opérateur');
    // The field keeps a light background in both themes, so pin the text to a
    // dark ink explicitly — `color:inherit` would pick up the card's near-white
    // text in dark mode and render the typed characters invisible on the light field.
    input.setAttribute('style',
      'width:100%;font:inherit;text-align:center;letter-spacing:.24em;padding:12px 14px;border:1.5px solid #d9ddd6;' +
      'border-radius:11px;background:#f7f5f0;color:#0A0F0D;caret-color:#0B6E4F;margin:0 0 10px');

    var err = el('div', null, '');
    err.setAttribute('style', 'color:#b0402f;font-size:.8rem;min-height:1em;margin:0 0 8px');

    var row = el('div');
    row.setAttribute('style', 'display:flex;gap:8px');
    var cancelBtn = el('button', null, 'Annuler');
    cancelBtn.setAttribute('type', 'button');
    cancelBtn.setAttribute('style', 'flex:1;font:inherit;font-weight:600;border:1px solid #d9ddd6;border-radius:10px;padding:11px;cursor:pointer;background:transparent;color:inherit');
    var goBtn = el('button', null, 'Entrer');
    goBtn.setAttribute('type', 'button');
    goBtn.setAttribute('style', 'flex:1;font:inherit;font-weight:640;border:0;border-radius:10px;padding:11px;cursor:pointer;color:#eafff4;background:linear-gradient(135deg,#0B6E4F,#053B2C)');

    function close() { open = false; if (veil.parentNode) veil.parentNode.removeChild(veil); }
    // Shield our field from the apps' global key handlers. The dashboard/caisse
    // PIN lock refocuses its own hidden input on every keydown (so the PIN can be
    // typed without a visible field) — which otherwise steals focus from us and
    // swallows every character. Stop key events at our input so they never bubble
    // to those document-level listeners; ordinary text still enters because we
    // only preventDefault on Enter/Escape.
    function onKeyGuard(ev) {
      ev.stopPropagation();
      if (ev.key === 'Escape') { ev.preventDefault(); close(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); submit(); }
    }
    function submit() {
      var code = input.value.trim();
      if (code.length < 4) { err.textContent = 'Code trop court.'; return; }
      goBtn.disabled = true; err.textContent = '';
      fetch('/auth/operator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          /* Destination en dur, pas celle que la réponse propose. Le serveur ne
           * renvoie qu'une seule valeur (`/kiwi-admin.html`, functions/auth/
           * operator.js), donc suivre le champ n'apporte rien — mais le jour où
           * cette réponse serait falsifiée, un code juste enverrait l'opérateur
           * sur la page d'un tiers, avec sa session fraîchement ouverte. */
          if (res.ok && res.j && res.j.ok) { window.location.href = '/kiwi-admin.html'; return; }
          err.textContent = 'Code incorrect.'; goBtn.disabled = false;
        })
        .catch(function () { err.textContent = 'Indisponible ici.'; goBtn.disabled = false; });
    }

    cancelBtn.addEventListener('click', close);
    goBtn.addEventListener('click', submit);
    veil.addEventListener('click', function (e) { if (e.target === veil) close(); });
    ['keydown', 'keypress', 'keyup'].forEach(function (t) { input.addEventListener(t, onKeyGuard); });

    row.appendChild(cancelBtn); row.appendChild(goBtn);
    card.appendChild(title); card.appendChild(input); card.appendChild(err); card.appendChild(row);
    veil.appendChild(card);
    document.body.appendChild(veil);
    setTimeout(function () { input.focus(); }, 30);
  }

  // Pointer + touch, passive (we never block the logo's normal click).
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('touchstart', onDown, { capture: true, passive: true });
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('touchmove', onMove, { capture: true, passive: true });
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(function (ev) {
    document.addEventListener(ev, cancel, true);
  });
})();
