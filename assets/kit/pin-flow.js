/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/pin-flow.js · what happens after a code is typed
 * (spec §10.2: the eight uses, the response states, the retry rule; §15.3).
 *
 * <k-pin-pad> draws and announces; it never decides. This module decides: it
 * sends the request, reads the answer, and tells the pad what to show. One
 * table for every use, so the dashboard lock, the till lock, the two approval
 * levels, the team sign-in, clock-in, pairing and the store lock cannot drift.
 *
 *   KiwiPinFlow.classify(use, reply, ctx)  pure: an answer → a verdict
 *   KiwiPinFlow.attach(pad, opts)          wires a pad to a use; returns
 *                                          { destroy, connectionBack, state }
 *   KiwiPinFlow.send(url, body, opts)      the one request: 8 s, then a
 *                                          network reply, never a throw
 *
 * A reply is { kind: 'answer', status, body, json } or { kind: 'network' }.
 * "Network" is a request that throws, the 8 s timeout, or (team and clock-in)
 * a body that is not JSON (§10.2, revision 17, P4).
 *
 * The verdict carries everything the pad needs and nothing it should guess:
 *   { key, args, assertive, keys, dots, shake, clear, action, haptic,
 *     success, retry, pause, offline }
 * success: the identity to hand on (with verdict 'offline' and provenAt when a
 * verifier row decided, §10.2 Staleness row); retry: 'auto' | 'try-again';
 * pause: seconds until the keys come back by themselves; offline: true when
 * the host's verifier rows must be read before the pad says anything.
 *
 * No code is compared here. Online the server judges; offline the host's own
 * salted rows do (opts.offline.verify), and only when the server cannot answer.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var TIMEOUT_MS = 8000;          /* KIWI_REQUEST_TIMEOUT_MS, every pad request */
  var RETRY_MS = 10000;           /* the next automatic request, after the last ends */
  var CLOCK_EXPIRY_MS = 300000;   /* an attendance code lives 5 minutes */

  var USES = {
    dashboard:  { length: 4, url: '/api/pin/verify' },
    till:       { length: 4, url: '/api/pin/verify' },
    approval:   { length: 4, url: '/api/pin/verify' },   /* till level */
    manager:    { length: 4, url: '/api/pin/verify' },
    team:       { length: 4, url: '/api/employee', auto: true },
    clock:      { length: 6, url: '/api/employee', auto: true },
    pair:       { length: 6, url: '/api/pair/redeem' },
    store:      { length: 6, url: '/api/pair/redeem' }
  };

  function minutes(sec) { return Math.max(1, Math.ceil((Number(sec) || 0) / 60)); }
  function err(reply) { var b = reply && reply.body; return b && typeof b === 'object' ? String(b.error || '') : ''; }
  function wait(reply) {
    var b = reply && reply.body;
    return Math.max(0, Number(b && (b.retry_after != null ? b.retry_after : b.retryAfter)) || Number(reply && reply.retryAfter) || 0);
  }

  /* The shapes the table repeats. */
  function refused(key, args, extra) {
    return assign({ key: key, args: args, keys: 'enabled', dots: 'danger', shake: true, clear: true, haptic: 'Failed' }, extra);
  }
  function quiet(key, args, extra) {    /* a refusal the code did not cause: no shake, no Failed */
    return assign({ key: key, args: args, keys: 'enabled', clear: true }, extra);
  }
  function blocked(key, args, extra) {  /* nothing typed will work until something changes */
    return assign({ key: key, args: args, keys: 'disabled', assertive: true }, extra);
  }
  function assign(a, b) { if (b) for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) a[k] = b[k]; return a; }

  function opensTill(role, ctx) {
    var R = (ctx && ctx.roles) || root.KiwiRoles;
    return !!(R && typeof R.opensTill === 'function' && R.opensTill(role || ''));
  }
  function isManager(role, ctx) {
    if (ctx && ctx.roles && typeof ctx.roles.isManager === 'function') return !!ctx.roles.isManager(role || '');
    return /owner|propri|manager|g[eé]rant|responsable|admin/.test(String(role || '').toLowerCase());
  }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }

  /* ── the till's role checks, online or from a row ─────────────────────── */
  function tillRole(use, who, ctx) {
    var name = firstName(who && who.name);
    if (use === 'approval' && ctx && ctx.incoming) {
      /* The shift change: the identity before the role (revision 20, P5). */
      var same = typeof ctx.incoming.match === 'function' ? !!ctx.incoming.match(who) : String(who.id || '') === String(ctx.incoming.id || '');
      if (!same) return refused('pin.till.not_incoming', { name: ctx.incoming.name || '' }, { shake: false });
    }
    if (!opensTill(who.role, ctx)) {
      if (use === 'till') return refused(name ? 'pin.not_till' : 'pin.not_till.unnamed', { name: name }, { shake: false });
      return refused('pin.till.not_till', null, { shake: false });
    }
    return null;
  }
  function managerRole(who, ctx) {
    var kind = ctx && ctx.act && ctx.act.kind;
    if ((kind === 'refund' || kind === 'stock_adjust') && !(who && who.approval)) return refused('pin.manager.not_manager', null, { shake: false });
    if (kind !== 'refund' && kind !== 'stock_adjust' && kind !== 'cancel_sale' && !isManager(who && who.role, ctx)) return refused('pin.manager.not_manager', null, { shake: false });
    return null;
  }

  /* What a verifier row decided, when the server could not answer. */
  function fromRow(use, row, ctx) {
    if (use === 'dashboard') {
      if (row) return { success: row };
      if (ctx && ctx.paused) return refused('pin.paused.self', { minutes: minutes(ctx.paused) }, { haptic: null, assertive: true });
      return refused(ctx && ctx.online === false ? 'pin.dashboard.offline_unknown' : 'pin.unavailable');
    }
    if (!row) return refused('pin.offline_unknown');
    var who = assign({ verdict: 'offline' }, row);
    if (use === 'manager') return managerRole(who, ctx) || { success: who };
    return tillRole(use, who, ctx) || { success: who };
  }

  /* ── the response table (§10.2), one row per answer ───────────────────── */
  function classify(use, reply, ctx) {
    ctx = ctx || {};
    var spec = USES[use];
    if (!spec) throw new Error('pin-flow: unknown use ' + use);
    var s = reply && reply.kind === 'answer' ? reply.status : 0;
    var e = err(reply);
    var json = !!(reply && reply.json);

    /* Pairing and the store lock: a code is spent once. */
    if (use === 'pair' || use === 'store') {
      if (!s) return quiet('pair.no_answer', null, { unanswered: true });
      if (s >= 200 && s < 300 && reply.body && reply.body.ok !== false) return { success: reply.body };
      if (s === 422) return refused(ctx.unanswered ? 'pair.maybe_used' : 'pair.invalid');
      if (s === 429) return blocked('pair.paused', { minutes: minutes(wait(reply)) }, { pause: wait(reply) || 60, clear: true });
      return quiet('pin.unavailable');               /* 503, and a 404 or 405 the route never sends */
    }

    if (use === 'team' || use === 'clock') {
      if (!s || !json) return blocked('pin.offline', null, { retry: 'auto', action: { id: 'retry', key: 'action.try_again' } });
      if (s === 200 && reply.body && reply.body.ok !== false) return { success: reply.body, haptic: use === 'clock' ? 'Shift' : null };
      if (s === 429) return blocked('pin.paused.self', { minutes: minutes(wait(reply)) }, { pause: wait(reply) || 60, clear: true });
      if (e === 'store-suspended') return blocked('access.suspended', null, { clear: true });
      if (use === 'team') {
        if (e === 'employee-access-ambiguous') return quiet('team.ambiguous', null, { haptic: 'Failed' });
        if (s === 401) return refused('team.bad');
      } else {
        if (e === 'employee-session-required' || s === 401) return blocked('team.session_ended', null, { action: { id: 'sign-in', key: 'action.sign_in' }, clear: true });
        if (e === 'attendance-code-invalid' || s === 403) return refused('clock.invalid');
        if (e === 'attendance-write-failed') return quiet('clock.not_recorded', null, { clear: false, action: { id: 'retry', key: 'action.try_again' } });
      }
      return quiet('pin.unavailable');
    }

    if (use === 'dashboard') {
      if (s === 200 && reply.body && reply.body.ok) {
        var staff = reply.body.staff || {};
        if (ctx.tier && ctx.tier(staff.role) === 'staff') return refused('pin.wrong', null, { forget: true });
        return { success: assign({ verdict: 'online' }, staff) };
      }
      if (s === 401 || s === 403) {
        if (!json && s === 401) return blocked('pin.signed_out', null, { action: { id: 'sign-in', key: 'pin.sign_in' }, clear: true });
        if (e === 'unauthorized' || e === 'account-revoked') return blocked('pin.signed_out', null, { action: { id: 'sign-in', key: 'pin.sign_in' }, clear: true });
        if (e === 'bad-pin') {
          if (reply.body && reply.body.configured === false) return { success: { unmatched: true, verdict: 'online' } };
          return refused('pin.wrong', null, { forget: true });
        }
      }
      if (s === 429) return refused('pin.paused.self', { minutes: minutes(wait(reply)) }, { haptic: null, assertive: true });
      return { offline: true };                         /* 5xx, a throw, the timeout, another 401/403 body */
    }

    /* till lock, till approval, manager approval */
    var needs = use === 'approval' && ctx.act && ctx.act.needsConnection;
    var server = use === 'manager' && ctx.act && /^(refund|stock_adjust|cancel_sale)$/.test(ctx.act.kind || '');
    if (!s) {
      if (needs) return blocked('pin.till.needs_connection', { act: ctx.actLabel || '' }, { clear: false, action: { id: 'retry', key: 'action.try_again' } });
      if (server) return blocked('pin.manager.offline', null, { clear: false, action: { id: 'retry', key: 'action.try_again' } });
      return { offline: true };
    }
    if (s >= 200 && s < 300 && reply.body && reply.body.ok !== false) {
      var who = assign({ verdict: 'online' }, reply.body.staff || reply.body.who || {});
      if (reply.body.approval) who.approval = String(reply.body.approval);
      if (reply.body.actorProof) who.actorProof = String(reply.body.actorProof);
      if (use === 'manager') return managerRole(who, ctx) || { success: who };
      return tillRole(use, who, ctx) || { success: who };
    }
    if (s === 403 && e === 'manager-required') return refused('pin.manager.not_manager', null, { shake: false });
    if (s === 403 && e === 'forbidden-till') return blocked('pin.unpaired', { venue: ctx.venue || '' }, { action: { id: 'pair', key: 'pin.pair_till' }, clear: true });
    if (s === 401) return refused(use === 'till' ? 'pin.wrong' : 'pin.manager.wrong');
    if (s === 429) return blocked('pin.paused.store', { minutes: minutes(wait(reply)) }, { pause: wait(reply) || 60, clear: true, hint: !!ctx.pinUnlock });
    return quiet('pin.unavailable');                  /* 503 and the unreachable 400 */
  }

  /* ── the one request ──────────────────────────────────────────────────── */
  function send(url, body, opts) {
    opts = opts || {};
    var f = opts.fetch || root.fetch;
    var ms = opts.timeout || TIMEOUT_MS;
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    return new Promise(function (resolve) {
      var done = false;
      function settle(reply) { if (done) return; done = true; clearTimeout(timer); resolve(reply); }
      /* The timeout settles the reply even when the transport ignores abort. */
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); settle({ kind: 'network', timeout: true }); }, ms);
      Promise.resolve().then(function () {
        return f(url, {
          method: 'POST', credentials: 'same-origin', signal: ctrl ? ctrl.signal : undefined,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body)
        });
      }).then(function (r) {
        return r.text().then(function (txt) {
          var parsed = null, json = false;
          try { parsed = JSON.parse(txt); json = parsed !== null && typeof parsed === 'object'; } catch (_) {}
          var ra = 0; try { ra = Number(r.headers.get('Retry-After')) || 0; } catch (_) {}
          return { kind: 'answer', status: r.status, body: json ? parsed : null, json: json, retryAfter: ra };
        });
      }).then(settle, function () { settle({ kind: 'network' }); });
    });
  }

  /* ── a pad wired to a use ─────────────────────────────────────────────────
   * opts:
   *   use            one of USES
   *   body(code)     the request body (default per use)
   *   request(code)  replaces send() entirely (the cancel-sale route carries
   *                  the code in its own request); resolves to a reply
   *   act            { kind, key, args, label?, needsConnection } (approvals;
 *                  label, when given, is the act already written out)
   *   incoming       { id, name, match(who)? } (the shift change: the host
 *                  may judge the identity itself, the till matches by name)
   *   venue, pinUnlock, roles, tier
   *   offline        { verify(code) → Promise<row|null>, paused() → seconds,
   *                    forget(code) } (the host's salted rows)
   *   isOffline()    known before the pad opens (navigator.onLine, or the
   *                  host's last request threw)
   *   onSuccess(who, verdict) · onAction(id) · log(entry)
   *   fetch, now, setTimeout, clearTimeout (tests)
   */
  function opIdentity() {
    try { if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID(); } catch (_) {}
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }
  function attach(pad, opts) {
    opts = opts || {};
    var use = opts.use, spec = USES[use];
    if (!spec || !pad) throw new Error('pin-flow: attach needs a pad and a known use');
    var T = opts.setTimeout || root.setTimeout.bind(root);
    var C = opts.clearTimeout || root.clearTimeout.bind(root);
    var now = opts.now || function () { return Date.now(); };
    var t = function (k, a) { var S = root.KiwiStrings; try { return S && S.t ? String(S.t(k, a)) : k; } catch (_) { return k; } };
    var state = { inflight: false, code: '', typedAt: 0, auto: null, retryTimer: null, pauseTimer: null,
      gated: false, shown: '', unanswered: {}, dead: false, lastCause: '' };
    /* The act is an argument of the sub and of the needs-connection line, and
       t() isolates every argument: its own isolates come off first, or the
       nested pair reaches the live region and it is written twice. */
    var actLabel = opts.act ? String(opts.act.label || (opts.act.key ? t(opts.act.key, opts.act.args) : '')).replace(/[\u2066-\u2069]/g, '') : '';
    pad.setAttribute('length', String(spec.length));

    function body(code) {
      if (typeof opts.body === 'function') return opts.body(code);
      if (use === 'dashboard') return { pin: code };
      if (use === 'pair' || use === 'store') return { code: code };
      if (use === 'team') return { action: 'login', email: opts.email || '', pin: code };
      if (use === 'clock') return { action: opts.clockAction || 'clock-in', attendanceCode: code, opId: state.opId };
      var b = { merchant: opts.merchant || '', pin: code };
      if (opts.act && opts.act.server) b.action = opts.act.server;
      return b;
    }
    function ctx(extra) {
      return assign({ act: opts.act, actLabel: actLabel, incoming: opts.incoming, venue: opts.venue || '',
        pinUnlock: !!opts.pinUnlock, roles: opts.roles, tier: opts.tier,
        online: !(typeof navigator !== 'undefined' && navigator.onLine === false) }, extra);
    }
    function label(a) { return a ? { id: a.id, label: t(a.key) } : null; }

    function show(v, automatic, ticking) {
      if (state.dead) return;
      var msg = v.key ? t(v.key, assign(assign({}, v.args || {}), v.key === 'pin.till.needs_connection' ? { act: actLabel } : null)) : '';
      if (v.key === 'pin.paused.store' && v.hint) msg += ' ' + t('pin.paused.owner_hint');
      var cause = (v.key || '') + (v.args ? JSON.stringify(v.args) : '');
      /* An automatic answer with the same cause writes nothing (the retry rule). */
      if (automatic && cause === state.lastCause) return;
      state.lastCause = cause;
      pad.answer({
        message: msg, assertive: !!v.assertive, keys: v.keys, dots: v.dots || null, shake: !!v.shake,
        clear: !!v.clear,
        action: v.action ? label(v.action) : null,
        haptic: automatic ? null : v.haptic || null, automatic: !!automatic
      });
      if (v.pause && !ticking) countdown(v);
    }

    function countdown(v) {
      C(state.pauseTimer);
      var until = now() + v.pause * 1000;
      (function tick() {
        var left = Math.ceil((until - now()) / 1000);
        if (left <= 0) { state.lastCause = ''; pad.reset(); return; }
        var m = Math.max(1, Math.ceil(left / 60));
        if (m !== v.args.minutes) { v.args = assign(assign({}, v.args), { minutes: m }); show(v, true, true); }
        state.pauseTimer = T(tick, Math.min(60000, (left % 60 || 60) * 1000));
      })();
    }

    function finish(who, verdict) {
      C(state.retryTimer); state.auto = null;
      if (opts.log) { try { opts.log({ use: use, act: opts.act ? opts.act.kind : null, id: who.id || null, name: who.name || null, role: who.role || null, verdict: who.verdict || 'online', provenAt: who.provenAt || null, at: now() }); } catch (_) {} }
      pad.answer({ message: '', dots: use === 'approval' || use === 'manager' ? null : 'accent', clear: false, action: null, haptic: verdict.haptic || null, keys: 'disabled' });
      if (opts.onSuccess) { try { opts.onSuccess(who, verdict); } catch (e) { if (root.KiwiReportError) root.KiwiReportError(e, 'kit:pin-flow'); } }
    }

    function decide(reply, automatic) {
      var v = classify(use, reply, ctx({ unanswered: !!state.unanswered[state.code] }));
      if (v.unanswered) state.unanswered[state.code] = true;
      if (v.forget && opts.offline && opts.offline.forget) { try { opts.offline.forget(state.code); } catch (_) {} }
      if (v.offline) {
        var verify = opts.offline && opts.offline.verify;
        return Promise.resolve(verify ? verify(state.code) : null).then(function (row) {
          var paused = opts.offline && opts.offline.paused ? opts.offline.paused() : 0;
          var r = fromRow(use, row || null, ctx({ paused: paused }));
          if (r.success) return finish(r.success, r);
          show(r, automatic);
        }, function () { show(fromRow(use, null, ctx()), automatic); });
      }
      if (v.success) return finish(v.success, v);
      /* Clock-in: the code is certainly dead 5 minutes after it was typed. */
      if (use === 'clock' && v.retry === 'auto' && now() - state.typedAt >= CLOCK_EXPIRY_MS) {
        C(state.retryTimer); state.auto = null;
        return show({ key: 'clock.code_expired', keys: 'enabled', clear: true, action: null }, false);
      }
      show(v, automatic);
      if (v.retry === 'auto') schedule();
      else { C(state.retryTimer); state.auto = null; }
    }

    function request(automatic) {
      if (state.inflight || state.dead) return;
      state.inflight = true;
      var code = state.code;
      var p = typeof opts.request === 'function' ? Promise.resolve(opts.request(code)) : send(spec.url, body(code), { fetch: opts.fetch });
      return p.then(function (reply) { return reply || { kind: 'network' }; }, function () { return { kind: 'network' }; }).then(function (reply) {
        if (state.dead) return;
        var mine = !automatic || state.joined;
        state.joined = false;
        return decide(reply, !mine);
      }).finally(function () { state.inflight = false; });
    }

    function schedule() {
      C(state.retryTimer);
      state.auto = true;
      state.retryTimer = T(function () { if (state.auto && !state.inflight) request(true); }, RETRY_MS);
    }

    function onOnline() {
      if (state.gated) { connectionBack(); return; }
      /* Between requests, an `online` event sends at once and restarts the count. */
      if (state.auto && !state.inflight) { C(state.retryTimer); request(true); }
    }

    /* The needs-connection state ends on an `online` event or on any request
       of the host's that succeeds (it calls connectionBack): keys enabled,
       pin.connection_back written once, politely; focus stays where it was. */
    function connectionBack() {
      if (!state.gated) return;
      state.gated = false; state.lastCause = '';
      pad.ungate(t('pin.connection_back'));
    }

    pad.onsubmit = function (code, gid, cause) {
      if (state.dead) return;
      if (state.inflight && cause !== 'retry') return;
      if (cause === 'retry') {
        /* Try again joins an automatic request in flight: its answer is the person's. */
        if (state.inflight) { state.joined = true; return; }
        C(state.retryTimer); state.lastCause = '';
        return request(false);
      }
      state.code = code; state.typedAt = now(); state.lastCause = '';
      /* One typed code is one punch: its retries, automatic or not, carry the
         same identity, so a late duplicate cannot open a second shift. */
      state.opId = opIdentity();
      return request(false);
    };
    function onAction(ev) {
      var d = ev && ev.detail;
      if (!d || d.action !== 'k.pin-pad.action') return;
      if (opts.onAction) opts.onAction(d.id);
    }
    pad.addEventListener('kiwi:action', onAction);
    if (typeof root.addEventListener === 'function') root.addEventListener('online', onOnline);

    /* Needs a connection, known when the pad opens (§10.2, revision 18, M2). */
    if (use === 'approval' && opts.act && opts.act.needsConnection && typeof opts.isOffline === 'function' && opts.isOffline()) {
      state.gated = true;
      pad.gate(t('pin.till.needs_connection', { act: actLabel }));
    }

    return {
      state: state,
      connectionBack: connectionBack,
      destroy: function () {
        state.dead = true;
        C(state.retryTimer); C(state.pauseTimer);
        pad.onsubmit = null;
        pad.removeEventListener('kiwi:action', onAction);
        if (typeof root.removeEventListener === 'function') root.removeEventListener('online', onOnline);
      }
    };
  }

  root.KiwiPinFlow = { TIMEOUT_MS: TIMEOUT_MS, RETRY_MS: RETRY_MS, CLOCK_EXPIRY_MS: CLOCK_EXPIRY_MS, USES: USES,
    classify: classify, fromRow: fromRow, send: send, attach: attach };
})(typeof window !== 'undefined' ? window : globalThis);
