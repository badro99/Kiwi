/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/till-pin.js · the till's code doors on the 2027 pad
 * (spec §10.2: the till lock, the till approval, the manager approval;
 * stage 3a). Loaded only when the till's flag is on (kiwiSkin2027:till, or
 * ?skin=2027 for one load); with it off the till keeps its shipped pads.
 *
 *   KiwiTillPin.approve(o)  the authorization sheet, both levels:
 *     o.level      'till' | 'manager'
 *     o.act        { kind, key, args } (§9.6's act.* keys); o.label is the
 *                  shipped French label, used only when no act is given
 *     o.needsServer, o.authContext (the server action: refund, inventory),
 *     o.incoming   { name } and o.validate(who) → refusal | null (shift change)
 *     o.onApprove(who), o.onCancel(), o.log(entry)
 *   KiwiTillPin.lock(venue, api)  the staff pad in #cp-pin-screen:
 *     api.verify(code) → reply, api.row(code) → row | null,
 *     api.accept(who), api.pair()
 *
 * The server judges every code (caisse-pairing.js › verifyReply); offline,
 * the till's salted rows decide only what §10.2 lets them decide. Every
 * approval and unlock, at both levels, online or from a row, adds one entry
 * to the authorization log with the identity, `verdict` and `provenAt`.
 * Every opening dispatches `kiwi:approval-open` on document with
 * { level, act }, which till-approval-level-test counts at run time.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var F = root.KiwiPinFlow, K = root.KiwiKit;
  if (!F || !K) return;
  var doc = root.document;
  var t = function (k, a) { return String(K.t(k, a)).replace(/[⁦-⁩]/g, ''); };

  /* An unpaired local demo accepts any code, as shipped (kiwi-caisse.html ›
     managerCodeValid): it has no store to judge against. */
  function protectedTill() {
    try { return !!((root.KiwiEnv && root.KiwiEnv.isReal && root.KiwiEnv.isReal()) || (root.KiwiCaissePairing && root.KiwiCaissePairing.isPaired && root.KiwiCaissePairing.isPaired())); }
    catch (_) { return true; }
  }
  function demoReply() {
    var s = root.KiwiStaff || {};
    return Promise.resolve({ kind: 'answer', status: 200, json: true,
      body: { ok: true, staff: { id: s.id || 'demo', name: s.name || 'Démo', role: s.role || 'owner' }, approval: 'demo' } });
  }
  function P() { return root.KiwiCaissePairing || {}; }

  var LOG_KEY = 'kiwiTillAuthLog';
  var authLog = [];
  function log(entry) {
    authLog.push(entry);
    if (authLog.length > 200) authLog.shift();
    try { sessionStorage.setItem(LOG_KEY, JSON.stringify(authLog.slice(-50))); } catch (_) {}
  }

  var current = null;   /* the open approval: { sheet, flow } */
  function closeCurrent(why) {
    var c = current; current = null;
    if (!c) return;
    try { c.flow.destroy(); } catch (_) {}
    c.sheet.removeAttribute('open');
    setTimeout(function () { if (c.sheet.parentNode) c.sheet.parentNode.removeChild(c.sheet); }, 400);
    if (why !== 'approved' && typeof c.onCancel === 'function') { try { c.onCancel(); } catch (_) {} }
  }

  function approve(o) {
    o = o || {};
    if (current) closeCurrent('replaced');
    var level = o.level === 'manager' ? 'manager' : 'till';
    var act = o.act ? Object.assign({}, o.act) : { kind: 'generic', key: null };
    /* §10.2's till-approval table: removing an order from tracking and
       rejecting an online order are server writes with no outbox, whatever
       the caller passed. */
    if (level === 'till') act.needsConnection = !!o.needsServer || act.kind === 'untrack_order' || act.kind === 'reject_online';
    if (o.authContext) act.server = o.authContext;
    if (o.authContext && o.authContext.kind === 'inventory') act.kind = 'stock_adjust';
    var actLabel = act.key ? t(act.key, act.args) : String(o.label || '');

    var sheet = doc.createElement('k-sheet');
    sheet.setAttribute('heading', t(level === 'till' ? 'pin.till.title' : 'pin.manager.title'));
    sheet.setAttribute('data-till-pin', level);
    var pad = doc.createElement('k-pin-pad');
    pad.setAttribute('size', 'ipad');
    pad.setAttribute('heading', t('pin.title'));
    var sub = o.incoming ? t('pin.till.handover_sub', { name: o.incoming.name || '' })
      : t(level === 'till' ? 'pin.till.sub' : 'pin.manager.sub', { act: actLabel });
    pad.setAttribute('sub', sub);
    sheet.appendChild(pad);
    doc.body.appendChild(sheet);

    var flow = F.attach(pad, {
      use: level === 'till' ? 'approval' : 'manager',
      act: Object.assign(act, { label: actLabel }),
      incoming: o.incoming ? { name: o.incoming.name, match: function (who) { return typeof o.validate === 'function' ? !o.validate(who) : true; } } : null,
      venue: (P().pairedVenue && (P().pairedVenue() || {}).name) || '',
      request: function (code) {
        if (!protectedTill()) return demoReply();
        return typeof P().verifyReply === 'function' ? P().verifyReply(code, act.server) : Promise.resolve({ kind: 'network' });
      },
      offline: { verify: function (code) { return typeof P().offlineRow === 'function' ? P().offlineRow(code) : Promise.resolve(null); } },
      isOffline: function () {
        try { if (root.navigator && root.navigator.onLine === false) return true; } catch (_) {}
        return !!(P().lastRequestFailed && P().lastRequestFailed());
      },
      log: function (e) { e.level = level; e.label = actLabel; log(e); if (typeof o.log === 'function') { try { o.log(e); } catch (_) {} } },
      onSuccess: function (who) {
        if (P().noteApproval) P().noteApproval(who, level);
        var approveFn = o.onApprove;
        closeCurrent('approved');
        if (typeof approveFn === 'function') approveFn(who);
      },
      onAction: function (id) {
        if (id === 'pair') { closeCurrent('pair'); if (P().showPad) P().showPad(true); }
      }
    });
    current = { sheet: sheet, flow: flow, onCancel: o.onCancel };
    sheet.addEventListener('kiwi:action', function (e) {
      if (e.detail && e.detail.action === 'k.sheet.close' && current && current.sheet === sheet) closeCurrent('close');
    });
    sheet.setAttribute('open', '');
    try { doc.dispatchEvent(new CustomEvent('kiwi:approval-open', { detail: { level: level, act: act.kind, key: act.key || null, label: actLabel } })); } catch (_) {}
    /* Focus the first key, so a hardware keyboard types into the pad at once. */
    setTimeout(function () { var k = pad.shadowRoot && pad.shadowRoot.querySelector('[data-key="1"]'); if (k) k.focus({ preventScroll: true }); }, 0);
    return true;
  }

  /* ── the till lock ───────────────────────────────────────────────────── */
  var lockFlow = null;
  function lock(venue, api) {
    var scr = doc.getElementById('cp-pin-screen');
    if (!scr) {
      scr = doc.createElement('div');
      scr.id = 'cp-pin-screen';
      scr.setAttribute('role', 'dialog');
      scr.setAttribute('aria-modal', 'true');
      doc.body.appendChild(scr);
    }
    scr.className = 'k-till-lock';
    scr.setAttribute('aria-label', t('pin.title'));
    scr.style.display = '';
    if (lockFlow) { try { lockFlow.destroy(); } catch (_) {} }
    scr.textContent = '';
    var pad = doc.createElement('k-pin-pad');
    pad.setAttribute('size', 'ipad');
    pad.setAttribute('identity', (venue && venue.name) || '');
    pad.setAttribute('sub', t('pin.sub.personal'));
    scr.appendChild(pad);
    lockFlow = F.attach(pad, {
      use: 'till',
      venue: (venue && venue.name) || '',
      request: function (code) { return api.verify(code); },
      offline: { verify: function (code) { return api.row(code); } },
      log: function (e) { e.level = 'lock'; log(e); },
      onSuccess: function (who) {
        var f = lockFlow; lockFlow = null;
        setTimeout(function () { try { f && f.destroy(); } catch (_) {} api.accept(who); }, 0);
      },
      onAction: function (id) { if (id === 'pair' && typeof api.pair === 'function') api.pair(); }
    });
    setTimeout(function () { var k = pad.shadowRoot && pad.shadowRoot.querySelector('[data-key="1"]'); if (k) k.focus({ preventScroll: true }); }, 0);
    return true;
  }

  try { authLog = JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]') || []; } catch (_) { authLog = []; }

  /* The till paints its own theme (html[data-caisse-theme]); the kit follows
     what the page paints through body[data-vexel-mode] (tokens-2027.css,
     §20.7), which nothing else on the till reads. html[data-theme] is not
     touched: retail-scan.css reads it. */
  function syncTheme() {
    var dark = false;
    try { dark = root.KiwiCaisseTheme ? root.KiwiCaisseTheme.current() === 'dark' : doc.documentElement.getAttribute('data-caisse-theme') === 'dark'; } catch (_) {}
    if (doc.body) doc.body.setAttribute('data-vexel-mode', dark ? 'dark' : 'light');
  }
  if (doc.body) syncTheme(); else doc.addEventListener('DOMContentLoaded', syncTheme);
  doc.addEventListener('kiwi:caisse-theme', syncTheme);

  root.KiwiTillPin = {
    approve: approve, lock: lock,
    isOpen: function () { return !!current; },
    close: function () { closeCurrent('close'); },
    log: function () { return authLog.slice(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
