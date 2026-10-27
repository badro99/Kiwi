  var ACTIVE = /^(on|is-on|active|is-active|sel|selected)$/;
  var navMark = null;   // { entry, token, prev }
  function markNav(entry) {
    clearNav();
    if (!entry || !entry.parentNode) return;
    var sibs = entry.parentNode.children, token = null, prev = null;
    for (var i = 0; i < sibs.length && !token; i++) {
      if (sibs[i] === entry || !sibs[i].classList) continue;
      for (var j = 0; j < sibs[i].classList.length; j++) {
        if (!ACTIVE.test(sibs[i].classList[j])) continue;
        token = sibs[i].classList[j]; prev = sibs[i]; break;
      }
    }
    if (!token) return;                       // ce rail ne marque rien : on n'invente pas
    prev.classList.remove(token);
    entry.classList.add(token);
    navMark = { entry: entry, token: token, prev: prev };
  }
  function clearNav() {
    if (!navMark) return;
    navMark.entry.classList.remove(navMark.token);
    navMark.prev.classList.add(navMark.token);
    navMark = null;
  }
  function makeItem(tag, cls, label) {
    var el = document.createElement(tag);
    if (tag === 'button') el.type = 'button';
    el.className = cls;
    if (tag === 'a') el.setAttribute('href', '#');
    el.innerHTML = ICON.users + '<span>' + label + '</span>';
    el.setAttribute('data-kcb-navitem', '1');
    el.addEventListener('click', function (e) { e.preventDefault(); open(el); });
    return el;
  }
  function wireCaisseEntry() {
    // 1) vertical rails — pos-* and pressing.
    var navs = document.querySelectorAll('nav[class$="-nav"]');
    Array.prototype.forEach.call(navs, function (nav) {
      var entryLabel = hospitalityMode() ? 'Hospitality+' : 'Clients';
      var buttons = nav.querySelectorAll('button, a');
      if (!buttons.length) return;
      var existing = Array.prototype.filter.call(buttons, function (b) {
        return Array.prototype.some.call(b.attributes, function (a) { return /view$/i.test(a.name) && /client/i.test(a.value); });
      })[0];
      if (existing) {
        // Maison already owns a full Clients destination inside its workspace.
        // Redirecting that button to this legacy fixed panel leaves "Vendus"
        // active underneath and breaks the vertical's shared page shell.
        if (existing.matches('[data-mz-view="clientes"]')) return;
        if (existing.getAttribute('data-kcb-redirect')) return;
        existing.setAttribute('data-kcb-redirect', '1');
        existing.addEventListener('click', function (e) { e.preventDefault(); e.stopImmediatePropagation(); open(existing); }, true);
      } else {
        var injected = nav.querySelector('[data-kcb-navitem]');
        if (injected) { var label = injected.querySelector('span'); if (label) label.textContent = entryLabel; return; }
        var sample = buttons[0];
        var cls = sample.className.replace(/\b(on|is-on|active|is-active|sel|selected)\b/g, '').replace(/\s+/g, ' ').trim();
        nav.appendChild(makeItem(sample.tagName.toLowerCase(), cls, entryLabel));
      }
    });
    // 2) the main café/resto caisse — .rail-links.
    Array.prototype.forEach.call(document.querySelectorAll('.rail-links'), function (rail) {
      if (rail.querySelector('[data-kcb-navitem]')) return;
      var sample = rail.querySelector('.team-trigger, button'); if (!sample) return;
      rail.appendChild(makeItem('button', sample.className.replace(/\s+/g, ' ').trim(), 'Clients & fidélité'));
      // The 2027 rail draws its Clients entry once this one exists.
      try { document.dispatchEvent(new CustomEvent('kiwi:clientsbook', { detail: { entry: true } })); } catch (_) {}
    });
  }

  /* ── boot ──────────────────────────────────────────────────────────────── */
  var wireScheduled = false;
  function scheduleWire() {
    if (wireScheduled) return; wireScheduled = true;
    setTimeout(function () { wireScheduled = false; try { watchDoors(); wireCaisseEntry(); ensureChip(); } catch (_) {} }, 120);
  }
  /* A door hides and shows by its style alone (display:none), which the
     childList watch in boot() does not see: each door is watched once. */
  var doorWatch = null, watchedDoors = [];
  function watchDoors() {
    if (typeof MutationObserver !== 'function') return;
    if (!doorWatch) doorWatch = new MutationObserver(scheduleWire);
    ['cp-pin-screen', 'cp-screen'].forEach(function (id) {
      var s = document.getElementById(id);
      if (s && watchedDoors.indexOf(s) < 0) { watchedDoors.push(s); doorWatch.observe(s, { attributes: true, attributeFilter: ['style', 'class'] }); }
    });
  }
  /* ── le carnet est une PAGE, pas une fenêtre ──────────────────────────────
     Il s'ouvre depuis le rail, à côté de Vente, Inventaire et Promotions, et il
     occupe la même zone de travail qu'elles. Il devait donc se comporter comme
     elles : toucher une autre entrée du rail l'emporte. Tant qu'il fallait le
     FERMER d'abord, il se comportait comme une boîte de dialogue — deux gestes
     là où le reste de la caisse en demande un, et la seule page du métier à
     réclamer ça.
     On écoute à la CAPTURE, avant que le métier ne traite son propre clic : la
     page suivante se dessine sur une zone déjà libre, jamais sous le carnet. */
  function isOpen() {
    var r = document.getElementById('kcb-root');
    return r && r.style.display !== 'none' ? r : null;
  }
  function sheetOpen() {
    var s = document.getElementById('kcb-sheet');
    return s && s.style.display !== 'none' ? s : null;
  }
  function wireDismiss() {
    document.addEventListener('click', function (e) {
      var root = isOpen(); if (!root) return;
      var t = e.target;
      if (!t || !t.closest) return;
      if (root.contains(t)) return;                        // clic DANS le carnet
      var sh = sheetOpen(); if (sh && sh.contains(t)) return;
      // Une autre entrée du rail — et seulement le rail : un clic ailleurs sur
      // l'écran ne ferme rien, sinon le carnet deviendrait impossible à garder
      // ouvert pendant qu'on lit.
      if (!t.closest('nav[class$="-nav"], .sidebar, .act-selector')) return;
      if (t.closest('[data-kcb-navitem], [data-kcb-redirect]')) return;  // sa propre entrée
      close();
    }, true);
    // Échap : d'abord la fiche cliente ouverte par-dessus, puis le carnet.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !isOpen()) return;
      if (sheetOpen()) { closeSheet(); return; }
      close();
    });
  }

  function boot() {
    wireDismiss();
    window.addEventListener('resize', function () { var r = document.getElementById('kcb-root'); if (r && r.style.display !== 'none') positionRoot(r); });
    window.addEventListener('storage', function (e) {
      if (!e.key) return;
      if (e.key === 'kiwiPaired' || e.key === 'kiwiLiveMerchant' || e.key.indexOf('kiwi:clients:') === 0) { ensureChip(); refreshOpen(); }
      else if (e.key.indexOf('kiwi:fidelity:') === 0) refreshOpen(); // programme changed on the dashboard (other tab)
    });
    if (KC.subscribe) KC.subscribe(function () { ensureChip(); refreshOpen(); });
    if (KC.subscribeConfig) KC.subscribeConfig(function () { refreshOpen(); }); // same-tab programme edit
    // Verticals mount lazily on unlock → watch the DOM and (re)inject the entry.
    try { new MutationObserver(scheduleWire).observe(document.body, { childList: true, subtree: true }); } catch (_) {}
    scheduleWire();
    setTimeout(scheduleWire, 1400);
    setTimeout(scheduleWire, 3200); // catch a just-completed pairing hand-off
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.KiwiClientsBook = { open: open, close: close, ensureChip: ensureChip };
})();
