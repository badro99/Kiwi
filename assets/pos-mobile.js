/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · phone layer for the métier registers (pos-* + pressing)
 *
 * Every vertical is built to the same three-part shell — a 212px left rail, a
 * fluid main column, and a ~360px docked ticket — but each names its parts with
 * its own two-letter prefix (.bq-rail, .ph-rail, .px-rail …). Rather than spell
 * fifteen prefixes into every rule, this tags the parts it finds with shared
 * role classes (vx-rail / vx-main / vx-view / vx-ticket) the moment a register
 * opens, so pos-mobile.css can address them once.
 *
 * It also injects the two controls a phone layout needs and the desk layout
 * never had: a drawer trigger for the rail, and a peek bar that raises the
 * ticket. Both are display:none above the phone breakpoint, so the desk
 * register is untouched.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var ROLES = ['rail', 'main', 'view', 'ticket'];

  /* A part is "<prefix>-<role>" as a whole class — guards against .bq-rail-foot
   * and .ph-ticket-line, which contain the role name but aren't the part. */
  function roleRe(role) {
    return new RegExp('(?:^|\\s)[a-z]{2,3}-' + role + '(?:$|\\s)');
  }

  function findAll(root, role) {
    var re = roleRe(role);
    var out = [];
    var nodes = root.querySelectorAll('[class]');
    for (var i = 0; i < nodes.length; i++) {
      var c = nodes[i].getAttribute('class') || '';
      if (re.test(c)) out.push(nodes[i]);
    }
    return out;
  }

  function tagRoles(screen) {
    for (var r = 0; r < ROLES.length; r++) {
      var role = ROLES[r];
      var found = findAll(screen, role);
      for (var i = 0; i < found.length; i++) found[i].classList.add('vx-' + role);
    }
  }

  /* ---- the ticket total, mirrored into the peek bar ---------------------- */
  function findTotalNode(ticket) {
    if (!ticket) return null;
    /* Verticals label the payable line differently (-tk-total, -total, -due).
     * Take the last match: the grand total sits below any subtotal. */
    var cand = ticket.querySelectorAll('[class*="-total"], [class*="-due"], [class*="-tk-sum"]');
    if (!cand.length) return null;
    var node = cand[cand.length - 1];
    /* That match is usually the whole row ("Total" + "5 900 MAD"). Prefer the
     * value cell so the peek doesn't read "Total5 900 MAD". */
    var kids = node.children;
    if (kids.length) {
      var last = kids[kids.length - 1];
      if (/\d/.test(last.textContent || '')) return last;
    }
    return node;
  }

  /* ---- rail drawer (idempotent) ---------------------------------------- */
  function ensureRail(screen) {
    var rail = screen.querySelector('.vx-rail');
    if (!rail || screen.querySelector(':scope > .vx-burger')) return;

    var burger = document.createElement('button');
    burger.className = 'vx-burger';
    burger.type = 'button';
    burger.setAttribute('aria-label', 'Menu');
    burger.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

    var scrim = document.createElement('div');
    scrim.className = 'vx-scrim';

    var setNav = function (on) {
      screen.classList.toggle('vx-nav-open', on);
      burger.setAttribute('aria-expanded', on ? 'true' : 'false');
    };
    burger.addEventListener('click', function () {
      setNav(!screen.classList.contains('vx-nav-open'));
    });
    scrim.addEventListener('click', function () { setNav(false); });
    /* Picking a destination should close the drawer, same as the cafe rail. */
    rail.addEventListener('click', function (e) {
      if (e.target.closest('[class*="-nav-it"]')) setNav(false);
    });

    screen.appendChild(scrim);
    screen.appendChild(burger);
  }

  /* ---- ticket bottom sheet (idempotent) -------------------------------- */
  function ensureTicket(screen) {
    var ticket = screen.querySelector('.vx-ticket');
    if (!ticket || ticket.querySelector(':scope > .vx-peek')) return;

    var peek = document.createElement('button');
    peek.className = 'vx-peek';
    peek.type = 'button';
    peek.innerHTML = '<span class="vx-peek-l">Ticket</span><span class="vx-peek-r"></span>';
    var amount = peek.querySelector('.vx-peek-r');

    var totalNode = findTotalNode(ticket);
    var sync = function () {
      var next = totalNode ? (totalNode.textContent || '').trim() : '';
      /* Write only on change. The peek lives inside the ticket, so an
       * unconditional write would re-enter the observer forever. */
      if (amount.textContent !== next) amount.textContent = next;
    };
    sync();
    if (totalNode) {
      /* Observe the total itself, not the whole ticket - keeps the peek out
       * of the observed subtree entirely. */
      new MutationObserver(sync).observe(totalNode, {
        subtree: true, childList: true, characterData: true
      });
    }

    peek.addEventListener('click', function () {
      screen.classList.toggle('vx-ticket-open');
    });
    /* First child, not last: the sheet rests translated down by exactly the
     * peek's height, so the peek has to be the strip left on screen. */
    ticket.insertBefore(peek, ticket.firstChild);
  }

  /* ---- two-panel rows → stacked (idempotent, add-only) ------------------
   * Verticals split their working area a second time under names that follow
   * no shared convention (.gy-ci-side, .cf-rdv, .ph-panel …), so matching on
   * class is a losing game. Measure instead: a flex ROW whose children are
   * themselves tall panels is a desk split, and on a phone it has to stack.
   * A header row (title + a button) never clears the height bar.
   *
   * Add-only on purpose. Flipping the class changes the computed direction,
   * so a rule that also removed it would oscillate between passes; the class
   * is inert above the breakpoint, where the CSS simply doesn't apply. */
  var PANEL_MIN_H = 140;

  function restack(screen) {
    var views = screen.querySelectorAll('.vx-view');
    for (var v = 0; v < views.length; v++) {
      if (getComputedStyle(views[v]).display === 'none') continue;
      var nodes = views[v].querySelectorAll('*');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.classList.contains('vx-stack')) continue;
        var cs = getComputedStyle(el);
        if (cs.display !== 'flex' || cs.flexDirection !== 'row') continue;
        var tall = 0;
        for (var k = 0; k < el.children.length; k++) {
          var ks = getComputedStyle(el.children[k]);
          if (ks.display === 'none' || ks.position === 'absolute' || ks.position === 'fixed') continue;
          if (el.children[k].getBoundingClientRect().height >= PANEL_MIN_H) tall++;
        }
        if (tall >= 2) el.classList.add('vx-stack');
      }
    }
  }

  /* A register's root is appended to <body> EMPTY and only filled when the
   * vertical's mount() runs, so a single pass at creation time races the
   * render and often finds no rail and no ticket. Each screen therefore keeps
   * its own subtree observer, and every step is idempotent and re-runnable. */
  function pass(screen) {
    tagRoles(screen);
    ensureRail(screen);
    ensureTicket(screen);
    restack(screen);
  }

  function wire(screen) {
    pass(screen);
    if (screen.dataset.vxWatched) return;
    screen.dataset.vxWatched = '1';

    var pending = false;
    var schedule = function () {
      if (pending) return;            /* coalesce a render's worth of mutations */
      pending = true;
      requestAnimationFrame(function () { pending = false; pass(screen); });
    };

    new MutationObserver(schedule).observe(screen, { childList: true, subtree: true });
    /* Switching views toggles a class rather than moving nodes, so the
     * childList observer never sees it — and a newly shown view still needs
     * measuring. A click on the register covers nav and tab changes. */
    screen.addEventListener('click', schedule, true);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
  }

  /* Registers mount lazily (pos-dispatch loads the module on PIN unlock), so
   * watch for .vx-screen roots appearing and wire each one once. */
  function scan() {
    /* The pressing predates the pos-* dispatcher and names its root .px-screen
     * rather than .vx-screen. Both get the same marker so one stylesheet can
     * address every register. */
    var screens = document.querySelectorAll('.vx-screen, .px-screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.add('vx-root');
      wire(screens[i]);
    }
  }

  function start() {
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: false });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
