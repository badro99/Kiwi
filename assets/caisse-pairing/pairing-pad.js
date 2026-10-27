
  /* ── the 6-digit pairing pad (reuses .pin-screen / .pin-pad CSS) ────────── */
  var buf = '';
  var pairSubmitting = false;
  function hideNativePin() { var n = document.getElementById('pin-screen'); if (n) n.style.display = 'none'; }
  function dotsHtml() {
    var out = '';
    for (var i = 0; i < 6; i++) out += '<span class="pin-dot' + (i < buf.length ? ' is-filled' : '') + '"></span>';
    return out;
  }
  function renderDots() { var d = document.getElementById('cp-dots'); if (d) d.innerHTML = dotsHtml(); }
  function key(n) { return '<button class="pin-key" data-cp="' + n + '">' + n + '</button>'; }

  function injectCss() {
    if (document.getElementById('cp-style')) return;
    var s = document.createElement('style'); s.id = 'cp-style';
    s.textContent =
      '.pin-screen{position:fixed;inset:0;background-color:#04120D;background-image:radial-gradient(65% 50% at 50% 8%,rgba(0,255,174,0.14),transparent 60%),radial-gradient(70% 60% at 85% 92%,rgba(12,107,78,0.32),transparent 60%),radial-gradient(60% 55% at 12% 88%,rgba(4,36,26,0.88),transparent 60%),linear-gradient(165deg,#051811 0%,#020C08 100%);z-index:500;display:flex;align-items:center;justify-content:center;padding:24px;color:#fff;animation:pin-fade-in 400ms cubic-bezier(0.16,1,0.3,1);}' +
      '.pin-card{display:flex;flex-direction:column;align-items:center;width:100%;max-width:440px;padding:38px 36px 32px;background:rgba(14,30,23,0.82);border:1px solid rgba(255,255,255,0.14);border-radius:28px;box-shadow:0 0 0 1px rgba(0,255,174,0.08),0 28px 72px -16px rgba(0,0,0,0.75),0 0 90px -25px rgba(0,255,174,0.16);backdrop-filter:blur(32px) saturate(1.4);-webkit-backdrop-filter:blur(32px) saturate(1.4);box-sizing:border-box;transition:transform 300ms ease,box-shadow 300ms ease;}' +
      '.pin-brand{display:inline-flex;align-items:center;margin-bottom:20px;}' +
      '.pin-brand img{height:36px;width:auto;}' +
      '.pin-greet{font-family:var(--sans,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif);font-size:24px;font-weight:700;letter-spacing:-0.03em;color:#F5FAF7;margin-bottom:6px;text-align:center;}' +
      '.pin-prompt{font-family:var(--mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#00FFAE;margin-bottom:22px;text-align:center;}' +
      '.pin-dots{display:flex;gap:16px;margin-bottom:26px;}' +
      '.pin-dot{width:18px;height:18px;border-radius:50%;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.04);transition:all 200ms cubic-bezier(0.16,1,0.3,1);}' +
      '.pin-dot.is-filled{background:#00FFAE;border-color:#00FFAE;box-shadow:0 0 0 4px rgba(0,255,174,0.22),0 0 16px rgba(0,255,174,0.55);transform:scale(1.15);}' +
      '.pin-dot.is-success{animation:pin-success-pop 360ms cubic-bezier(0.32,0.72,0,1) both;}' +
      '@keyframes pin-success-pop{0%{transform:scale(1.15);background:#00FFAE;border-color:#00FFAE;box-shadow:0 0 0 0 rgba(0,255,174,0.6)}45%{transform:scale(1.6);background:#00FFAE;border-color:#00FFAE;box-shadow:0 0 0 12px rgba(0,255,174,0.4)}100%{transform:scale(1.2);background:#00FFAE;border-color:#00FFAE;box-shadow:0 0 0 0 rgba(0,255,174,0)}}' +
      '.pin-pad{display:grid;grid-template-columns:repeat(3,72px);gap:14px;}' +
      '.pin-key{width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.12);color:#F5FAF7;font-family:var(--sans,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif);font-size:26px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;transition:all 160ms cubic-bezier(0.16,1,0.3,1);font-feature-settings:"tnum" 1;box-shadow:0 4px 12px rgba(0,0,0,0.25);cursor:pointer;}' +
      '.pin-key:hover{background:rgba(255,255,255,0.12);border-color:rgba(0,255,174,0.35);transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,0.35);}' +
      '.pin-key:active{transform:scale(0.92);background:rgba(0,255,174,0.22);border-color:#00FFAE;box-shadow:0 0 20px rgba(0,255,174,0.45);}' +
      '.pin-key.is-action{background:transparent;border-color:transparent;box-shadow:none;font-size:15px;font-weight:600;letter-spacing:0.02em;color:rgba(255,255,255,0.65);}' +
      '.pin-key.is-action svg{width:22px;height:22px;}' +
      '.pin-key.is-action:hover{color:#00FFAE;background:rgba(0,255,174,0.10);border-color:rgba(0,255,174,0.25);}' +
      '#cp-resume{margin:18px auto 0;display:inline-block;background:rgba(0,255,174,0.12);border:1px solid rgba(0,255,174,0.25);border-radius:999px;padding:8px 20px;cursor:pointer;color:#00FFAE;font:inherit;font-size:.9rem;font-weight:600;text-decoration:none;transition:all 160ms cubic-bezier(0.16,1,0.3,1);box-shadow:0 4px 16px -4px rgba(0,255,174,0.3);}' +
      '#cp-resume:hover{background:rgba(0,255,174,0.22);transform:translateY(-2px);box-shadow:0 6px 20px -2px rgba(0,255,174,0.45);}' +
      '.pin-foot{margin-top:22px;font-family:var(--mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:10.5px;color:rgba(255,255,255,0.45);letter-spacing:0.10em;text-transform:uppercase;text-align:center;line-height:1.5;}' +
      '.pin-screen.is-error .pin-card{animation:cp-shake .4s;}' +
      '@keyframes cp-shake{10%,90%{transform:translateX(-3px)}30%,70%{transform:translateX(6px)}50%{transform:translateX(-8px)}}' +
      '@keyframes pin-fade-in{from{opacity:0;transform:scale(1.02);filter:blur(4px)}to{opacity:1;transform:scale(1);filter:blur(0)}}';
    document.head.appendChild(s);
  }

  /* ── LE PAVÉ D'APPAIRAGE, QUE PLUS RIEN NE DESSINAIT ─────────────────────
   * `feed`, `submit`, `dotsHtml`, `injectCss` et les deux gestionnaires
   * délégués (#cp-pad [data-cp]) attendaient tous un écran `#cp-screen` que
   * AUCUNE fonction de ce fichier ne construisait plus. pairFromAccount()
   * ci-dessus répare la caisse SANS geste — mais seulement quand ce navigateur
   * porte encore la session propriétaire du tableau de bord. Sur un comptoir,
   * il ne la porte typiquement pas : c'est une caisse, pas un bureau. Ce
   * terminal-là recevait un 401/403 et le conseil d'aller ouvrir un tableau de
   * bord ailleurs, pendant que ses ventes s'empilaient. On lui redonne le seul
   * geste qu'il puisse faire sur place : taper un code à six chiffres. */
  function renderPairPad(opts) {
    opts = opts || {};
    /* Design 2027 (kiwiSkin2027:till): the same door on the kit's pad, through
       KiwiPinFlow's pair and store rows (assets/kit/till-pin.js). A code that
       got no answer is never sent again by itself; the store lock's pad has a
       Back that returns to the lock's screen (§10.26). */
    if (window.KiwiTillPin && window.KiwiTillPin.pair) {
      window.KiwiTillPin.pair({
        use: opts.store ? 'store' : 'pair',
        venue: opts.venue || null,
        prompt: opts.store ? opts.prompt : '',
        foot: opts.store ? opts.foot : '',
        request: redeemReply,
        commit: commitRedeem,
        done: pairDone,
        back: hidePad,
      });
      return;
    }
    injectCss();
    var scr = document.getElementById('cp-screen');
    if (!scr) {
      scr = document.createElement('div');
      scr.className = 'pin-screen';
      scr.id = 'cp-screen';
      scr.setAttribute('role', 'dialog');
      scr.setAttribute('aria-modal', 'true');
      scr.setAttribute('aria-label', 'Appairage de la caisse');
      document.body.appendChild(scr);
    }
    scr.style.display = '';
    buf = '';
    var known = opts.venue && opts.venue.name;
    scr.innerHTML =
      '<div class="pin-card">' +
        '<div class="pin-brand" aria-label="Kiwi"><img src="assets/kiwi-newlogo-inverse.svg" alt="" draggable="false"></div>' +
        '<div class="pin-greet">' + esc(known ? opts.venue.name : 'Appairer cette caisse') + '</div>' +
        '<div class="pin-prompt">' + esc(opts.prompt || 'CODE D\u2019APPAIRAGE · 6 CHIFFRES') + '</div>' +
        '<div class="pin-dots" id="cp-dots" aria-hidden="true">' + dotsHtml() + '</div>' +
        '<div class="pin-pad" id="cp-pad">' +
          key(1) + key(2) + key(3) + key(4) + key(5) + key(6) + key(7) + key(8) + key(9) +
          '<button class="pin-key is-action" data-cp="clear" aria-label="Effacer tout">C</button>' + key(0) +
          '<button class="pin-key is-action" data-cp="back" aria-label="Effacer">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H7l-5 7 5 7h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="pin-foot">' + esc(opts.foot || 'G\u00e9n\u00e9rez un code depuis Tableau de bord \u203a Caisse') + '</div>' +
      '</div>';
    renderDots();
  }

  /* Réappairer n'est PAS dépairer. La tablette est toujours celle de ce
   * magasin ; c'est sa preuve qui a disparu, pas son affectation. unpair()
   * aurait purgé le locataire — service en cours, additions, journal — pour
   * réparer un cookie. Les ventes déjà encaissées ne vivent pas dans les clés
   * du locataire : elles restent en file et repartent seules. */
  /* `opts` : l'écran de verrouillage (assets/till-tenant.js) ouvre ce pavé
   * pour ramener la caisse à son commerce d'ORIGINE ; il nomme ce commerce,
   * pas celui auquel la caisse est appairée par erreur. */
  function repairWithCode(opts) {
    opts = opts || {};
    var pv = opts.venue || pairedVenue();
    renderPairPad({
      /* The store lock names the store it pairs back to (till-tenant.js). */
      store: !!opts.venue,
      venue: pv,
      prompt: opts.prompt || 'R\u00c9APPAIRER · CODE \u00c0 6 CHIFFRES',
      foot: opts.foot || (pv && pv.name
        ? 'Cet appareil a perdu sa preuve d\u2019appairage. Les ventes en attente sont conserv\u00e9es et repartiront seules.'
        : 'G\u00e9n\u00e9rez un code depuis Tableau de bord \u203a Caisse'),
    });
  }

  /* Les deux chemins, dans l'ordre où ils coûtent au commerçant. Silencieux
   * d'abord : si ce navigateur porte encore la session du tableau de bord,
   * personne n'a rien à faire. Sinon — le cas d'un vrai comptoir — on ne rend
   * la main sur un cul-de-sac QUE si le geste a été demandé : un pavé qui
   * s'ouvrirait tout seul par-dessus la caisse en plein service serait pire
   * que le problème qu'il répare. */
  function repair(opts) {
    return Promise.resolve()
      .then(function () { return recoverFromTerminal(); })
      .catch(function () { return pairFromAccount(); })
      .catch(function (err) {
        if (!opts || !opts.interactive) throw err;
        repairWithCode();
        return { ok: true, pad: true };
      });
  }

  function showPad(force) {
    hidePad();
    var pv = isPaired() ? pairedVenue() : null;
    /* Hébergé seulement. En local (démos autorisées) un pavé d'appairage
       n'est satisfaisable par personne : dépairer y rendait la main à
       l'application, et doit continuer de le faire. */
    if (!pv && hosted()) { renderPairPad({}); return; }
    bootWithPin(pv);
  }
  function hidePad() { var s = document.getElementById('cp-screen'); if (s) s.style.display = 'none'; }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  function feed(d) {
    if (pairSubmitting) return;
    if (d === 'clear') { buf = ''; }
    else if (d === 'back') { buf = buf.slice(0, -1); }
    else if (/^[0-9]$/.test(d) && buf.length < 6) { buf += d; }
    renderDots();
    if (buf.length === 6) submit();
  }
  /* The till is paired (either pad). */
  function pairDone(res) {
    hidePad();
    /* Le jeton est reposé : les ventes retenues par un 403 n'ont plus de
       raison d'attendre le prochain battement. `true` lève le recul
       d'authentification de soixante secondes. */
    try { if (window.KiwiLive && window.KiwiLive.flush) window.KiwiLive.flush(true); } catch (_) {}
    bootWithPin(res.venue);
  }
  /* The kit's pad (kiwiSkin2027:till) asks through KiwiPinFlow: one request,
     8 s, a reply it reads from its table. The shipped fail-soft stays: no
     backend (404, 405) reads the same-browser map; no answer reads it too, and
     only a match there counts, else the pad says no answer. */
  var lastPairCode = '';
  function localReply(code) {
    var e = readMap()[code];
    if (!e || (e.exp && e.exp < Date.now())) return { kind: 'answer', status: 422, json: true, body: { error: 'invalid_or_expired' } };
    return { kind: 'answer', status: 200, json: true, body: Object.assign({}, e, { ok: true, local: true }) };
  }
  function redeemReply(code) {
    code = lastPairCode = String(code || '').replace(/\D/g, '').slice(0, 6);
    return window.KiwiPinFlow.send('/api/pair/redeem', { code: code, terminalId: terminalId() }).then(function (reply) {
      if (reply.kind === 'answer' && (reply.status === 404 || reply.status === 405)) return localReply(code);
      if (reply.kind !== 'answer') { var l = localReply(code); return l.status === 200 ? l : reply; }
      return reply;
    });
  }
  function commitRedeem(body) {
    var code = lastPairCode;
    if (body && body.local) {
      var d = Object.assign({}, body); delete d.ok; delete d.local;
      return applyPairing(code, d);
    }
    var committed = applyPairing(code, body);
    if (!committed || !committed.ok) return committed;
    return confirmTillProof(committed.venue || body, committed);
  }
  function submit() {
    if (pairSubmitting) return;
    pairSubmitting = true;
    var code = buf;
    redeem(code).then(function (res) {
      if (res && res.ok) {
        pairSubmitting = false;
        pairDone(res); return;
      }
      var scr = document.getElementById('cp-screen');
      if (scr) { scr.classList.add('is-error'); setTimeout(function () { scr.classList.remove('is-error'); }, 420); }
      /* "too_many_attempts" is the server's brute-force cap (429). Say so
       * plainly: a shop that mistyped its way into the lockout must know to
       * wait, not keep retrying a code it thinks is wrong. */
      toast(res && res.error === 'too_many_attempts'
              ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Trop de tentatives. Réessayez dans quelques minutes.')
          : res && res.error === 'expired' ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Code expiré, régénérez-en un.')
          : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Code invalide.'));
      buf = ''; renderDots();
      pairSubmitting = false;
    }).catch(function () {
      pairSubmitting = false;
      buf = ''; renderDots();
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Connexion impossible. Réessayez.'));
    });
  }
  function toast(msg) {
    try {
      var stack = document.getElementById('toast-stack');
      if (stack) { var el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; stack.appendChild(el); setTimeout(function () { el.classList.add('fade'); }, 2200); setTimeout(function () { el.remove(); }, 2480); return; }
    } catch (_) {}
    try {
      if (document.body) {
        var fb = document.createElement('div');
        fb.setAttribute('role', 'alert');
        fb.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:8px 16px;border-radius:8px;z-index:99999;font-size:14px;';
        fb.textContent = msg;
        document.body.appendChild(fb);
        setTimeout(function () { fb.remove(); }, 2500);
      }
    } catch (_) {}
  }
