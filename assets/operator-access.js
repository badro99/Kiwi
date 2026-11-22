/* Kiwi — global operator access. Long-press ANY Kiwi logo (~1.4 s), anywhere in
 * the app, at any stage, to open a discreet operator-code prompt → the operator
 * console (kiwi-admin.html). No visible affordance; clients never discover it.
 *
 * Targets the real Kiwi brand marks only (the generic .logo class is used for
 * partner/integration logos and is deliberately excluded). Add data-kiwi-logo to
 * any future logo to include it. Verifies the code via POST /auth/operator, which
 * works whether you're logged in or not. Vanilla, no innerHTML, fail-safe: if the
 * endpoint is missing (no backend) the prompt simply reports an error and closes.
 *
 * The door itself is the staff entrance, so it is allowed to have fun (owner,
 * 22 Nov 2026): a line that changes each time, dots that pop as the code goes
 * in, a padlock that shakes its head at a wrong code and swings open on the
 * right one. Clients never see it; the greeting after a client's own code stays
 * plain and quick. Everything still works, and stands still, under reduced
 * motion.
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

  /* The staff entrance talks like a doorman who knows everyone. */
  var LINES = {
    title: ['Qui va là ?', 'Entrée du personnel', 'Mot de passe, chef.', 'Les coulisses de Kiwi', 'Toc toc.'],
    sub: ['Réservé à l’équipe Kiwi.', 'Les clients, c’est par la grande porte.', 'Promis, personne ne regarde.'],
    wrong: ['Raté. Le videur ne bouge pas.', 'Non. Il a croisé les bras.', 'Ce code ne passe pas la porte.', 'Presque. Enfin, non.'],
    third: 'Trois essais. Le kiwi commence à douter.',
    short: 'Un peu court, ce code.',
    offline: 'La porte ne répond pas d’ici.',
    welcome: ['Bienvenue en coulisses.', 'Entrez, on vous attendait.', 'Ah, c’est vous.'],
  };
  var pick = function (list) { return list[Math.floor(Math.random() * list.length)]; };
  var reduce = function () {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; }
  };

  var CSS = [
    '.kop-veil{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;',
    'background:rgba(5,24,17,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:0;transition:opacity 220ms ease,background-color 320ms ease;',
    'font:15px/1.45 "Inter Tight",Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
    '.kop-veil.is-in{opacity:1}',
    '.kop-veil.is-win{background:rgba(11,110,79,.62)}',
    '.kop-card{position:relative;width:100%;max-width:340px;padding:26px 22px 20px;border-radius:22px;text-align:center;color:#e8efe9;',
    'background:radial-gradient(120% 80% at 50% -10%,rgba(125,242,176,.16),transparent 60%),#0d1512;',
    'box-shadow:0 30px 80px -24px rgba(0,0,0,.7),inset 0 0 0 1px rgba(255,255,255,.07);',
    'transform:translateY(14px) scale(.96);transition:transform 310ms cubic-bezier(0.34,1.45,0.5,1)}',
    '.kop-veil.is-in .kop-card{transform:none}',
    '.kop-veil.is-out .kop-card{transform:translateY(18px) scale(.96);transition-duration:180ms}',
    '.kop-veil.is-win .kop-card{transform:scale(1.04)}',
    '.kop-lock{width:54px;height:54px;margin:0 auto 12px;border-radius:50%;display:grid;place-items:center;',
    'background:rgba(125,242,176,.1);box-shadow:inset 0 0 0 1px rgba(125,242,176,.25);transition:background-color 240ms ease}',
    '.kop-lock i{width:26px;height:26px;background:#7DF2B0;-webkit-mask:var(--kop-icon) center/contain no-repeat;mask:var(--kop-icon) center/contain no-repeat;',
    '--kop-icon:url(assets/icons/material/lock.svg)}',
    '.kop-veil.is-win .kop-lock{background:#7DF2B0}',
    '.kop-veil.is-win .kop-lock i{--kop-icon:url(assets/icons/material/lock_open.svg);background:#053B2C;animation:kop-swing 420ms cubic-bezier(0.34,1.45,0.5,1)}',
    '.kop-eyebrow{font-size:.68rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#7DF2B0;margin:0 0 6px}',
    '.kop-title{font-size:1.28rem;font-weight:600;letter-spacing:-.02em;margin:0;color:#f4f8f5}',
    '.kop-sub{font-size:.84rem;color:rgba(232,239,233,.62);margin:4px 0 18px;min-height:1.2em}',
    '.kop-field{position:relative;height:56px;border-radius:14px;background:rgba(255,255,255,.05);',
    'box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;gap:9px;cursor:text;',
    'transition:box-shadow 180ms ease}',
    '.kop-field.is-focus{box-shadow:inset 0 0 0 1.5px #0B6E4F,0 0 0 4px rgba(125,242,176,.12)}',
    '.kop-field input{position:absolute;inset:0;width:100%;height:100%;opacity:0;border:0;padding:0;margin:0;font:inherit;cursor:text}',
    '.kop-dot{width:11px;height:11px;border-radius:50%;background:#7DF2B0;animation:kop-pop 310ms cubic-bezier(0.34,1.45,0.5,1) both}',
    '.kop-caret{width:2px;height:22px;border-radius:2px;background:#7DF2B0;animation:kop-blink 1s steps(1) infinite}',
    '.kop-field:not(.is-focus) .kop-caret{visibility:hidden}',
    '.kop-place{font-size:.88rem;color:rgba(232,239,233,.4)}',
    '.kop-field.is-bad .kop-dot{background:#ff8a7a}',
    '.kop-card.is-bad{animation:kop-no 420ms cubic-bezier(.36,.07,.19,.97)}',
    '.kop-card.is-bad .kop-lock i{animation:kop-no 420ms cubic-bezier(.36,.07,.19,.97)}',
    '.kop-msg{font-size:.82rem;min-height:1.3em;margin:10px 0 14px;color:rgba(232,239,233,.55);transition:color 160ms ease}',
    '.kop-msg.is-bad{color:#ff9b8c}',
    '.kop-msg.is-win{color:#7DF2B0;font-weight:600}',
    '.kop-row{display:flex;gap:8px}',
    '.kop-row button{flex:1;font:inherit;font-weight:600;border-radius:12px;padding:12px;cursor:pointer;',
    'transition:transform 160ms cubic-bezier(0.34,1.45,0.5,1),background-color 160ms ease,opacity 160ms ease}',
    '.kop-row button:active{transform:scale(.96)}',
    '.kop-row button:disabled{opacity:.6;cursor:progress}',
    '.kop-cancel{border:1px solid rgba(255,255,255,.16);background:transparent;color:#e8efe9}',
    '.kop-go{border:0;color:#04281d;background:#7DF2B0}',
    '.kop-go:hover{background:#9af6c3}',
    '@keyframes kop-pop{0%{transform:scale(0)}100%{transform:scale(1)}}',
    '@keyframes kop-blink{50%{opacity:0}}',
    '@keyframes kop-no{0%,100%{transform:translateX(0)}20%{transform:translateX(-9px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(3px)}}',
    '@keyframes kop-swing{0%{transform:rotate(-14deg) scale(.8)}100%{transform:none}}',
    '@media (prefers-reduced-motion: reduce){.kop-veil,.kop-card,.kop-dot,.kop-row button{transition:none!important;animation:none!important}',
    '.kop-card.is-bad,.kop-card.is-bad .kop-lock i,.kop-veil.is-win .kop-lock i,.kop-caret{animation:none!important}}',
  ].join('');

  function injectCss() {
    if (document.getElementById('kop-css')) return;
    var style = document.createElement('style');
    style.id = 'kop-css';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

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
    injectCss();
    var misses = 0, busy = false;

    var veil = el('div', 'kop-veil');
    veil.setAttribute('role', 'dialog');
    veil.setAttribute('aria-modal', 'true');
    var card = el('div', 'kop-card');
    var lock = el('div', 'kop-lock');
    lock.setAttribute('aria-hidden', 'true');
    lock.appendChild(el('i'));
    var eyebrow = el('div', 'kop-eyebrow', 'Accès opérateur');
    var title = el('div', 'kop-title', pick(LINES.title));
    title.id = 'kop-title';
    veil.setAttribute('aria-labelledby', 'kop-title');
    var sub = el('div', 'kop-sub', pick(LINES.sub));

    var field = el('label', 'kop-field');
    var input = el('input');
    input.type = 'password'; input.setAttribute('inputmode', 'numeric');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-label', 'Code opérateur');
    var dots = el('span');
    dots.setAttribute('aria-hidden', 'true');
    dots.style.cssText = 'display:flex;align-items:center;gap:9px';
    field.appendChild(input); field.appendChild(dots);

    var msg = el('div', 'kop-msg', '');
    msg.setAttribute('aria-live', 'polite');

    var row = el('div', 'kop-row');
    var cancelBtn = el('button', 'kop-cancel', 'Annuler');
    cancelBtn.setAttribute('type', 'button');
    var goBtn = el('button', 'kop-go', 'Entrer');
    goBtn.setAttribute('type', 'button');

    /* The dots mirror the length only; the field itself stays a real password
       input (managers, paste, IME all keep working). */
    var shown = 0;
    function paintDots() {
      var n = Math.min(input.value.length, 12);
      if (n === shown && dots.childNodes.length) return;
      while (dots.firstChild) dots.removeChild(dots.firstChild);
      if (!n) dots.appendChild(el('span', 'kop-place', 'Votre code'));
      for (var i = 0; i < n; i++) {
        var d = el('span', 'kop-dot');
        if (i < shown) d.style.animation = 'none';
        dots.appendChild(d);
      }
      dots.appendChild(el('span', 'kop-caret'));
      shown = n;
      field.classList.remove('is-bad');
    }

    function close() {
      if (!open) return;
      open = false;
      veil.classList.add('is-out');
      veil.classList.remove('is-in');
      setTimeout(function () { if (veil.parentNode) veil.parentNode.removeChild(veil); }, reduce() ? 0 : 200);
    }
    function refuse(text) {
      msg.textContent = text;
      msg.className = 'kop-msg is-bad';
      field.classList.add('is-bad');
      card.classList.remove('is-bad');
      void card.offsetWidth;   // restart the head-shake on every miss
      card.classList.add('is-bad');
      input.value = ''; shown = 0;
      setTimeout(function () { paintDots(); field.classList.add('is-bad'); }, reduce() ? 0 : 380);
      setTimeout(function () { try { input.focus(); } catch (_) {} }, 0);
    }
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
      if (busy) return;
      var code = input.value.trim();
      if (code.length < 4) { refuse(LINES.short); return; }
      busy = true; goBtn.disabled = true; cancelBtn.disabled = true;
      msg.textContent = ''; msg.className = 'kop-msg';
      fetch('/auth/operator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          /* Destination en dur, pas celle que la réponse propose. Le serveur ne
           * renvoie qu'une seule valeur (`/kiwi-admin.html`, functions/auth/
           * operator.js), donc suivre le champ n'apporte rien — mais le jour où
           * cette réponse serait falsifiée, un code juste enverrait l'opérateur
           * sur la page d'un tiers, avec sa session fraîchement ouverte. */
          if (res.ok && res.j && res.j.ok) {
            msg.textContent = pick(LINES.welcome);
            msg.className = 'kop-msg is-win';
            veil.classList.add('is-win');
            setTimeout(function () { window.location.href = '/kiwi-admin.html'; }, reduce() ? 120 : 520);
            return;
          }
          busy = false; goBtn.disabled = false; cancelBtn.disabled = false;
          misses++;
          refuse(misses >= 3 ? LINES.third : pick(LINES.wrong));
        })
        .catch(function () {
          busy = false; goBtn.disabled = false; cancelBtn.disabled = false;
          refuse(LINES.offline);
        });
    }

    cancelBtn.addEventListener('click', close);
    goBtn.addEventListener('click', submit);
    veil.addEventListener('click', function (e) { if (e.target === veil && !busy) close(); });
    ['keydown', 'keypress', 'keyup'].forEach(function (t) { input.addEventListener(t, onKeyGuard); });
    input.addEventListener('input', paintDots);
    input.addEventListener('focus', function () { field.classList.add('is-focus'); });
    input.addEventListener('blur', function () { field.classList.remove('is-focus'); });

    row.appendChild(cancelBtn); row.appendChild(goBtn);
    [lock, eyebrow, title, sub, field, msg, row].forEach(function (n) { card.appendChild(n); });
    veil.appendChild(card);
    document.body.appendChild(veil);
    paintDots();
    requestAnimationFrame(function () { requestAnimationFrame(function () { veil.classList.add('is-in'); }); });
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
