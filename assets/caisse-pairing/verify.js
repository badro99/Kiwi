  var lastVerify = { status: 0, wait: 0, offline: false };
  /* `opts.needsServer`: the act this code approves is a server write with no
     outbox (cancel a live order, reject an online order, cancel a table with a
     visit). The salted offline verifier must not approve it: the act would fail
     right after the approval. The attempt then ends with `lastVerify.offline`
     set and no identity, and the pad shows its needs-a-connection state. */
  function verifyCode(code, action, opts) {
    code = String(code || '');
    var venue = activeVenue();
    var merchant = (venue && venue.merchant) || '';
    if (!/^\d{4}$/.test(code) || !merchant) return Promise.resolve(null);
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 12000);
    lastVerify = { status: 0, wait: 0, offline: false };
    return fetch('/api/pin/verify', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ merchant: merchant, pin: code, ...(action ? { action: action } : {}) }),
    })
      .then(function (r) {
        try { if (window.KiwiTrustedClock) window.KiwiTrustedClock.observe(r); } catch (_) {}
        if (r && r.status === 429) {
          lastVerify.status = 429;
          return r.json().catch(function () { return {}; }).then(function (d) {
            lastVerify.wait = Math.max(0, Number(d && d.retry_after) || Number(r.headers.get('Retry-After')) || 0);
            return null;
          });
        }
        /* A code the server has just refused is revoked or changed: its offline
           verifier goes now. A mistyped code matches no verifier, drops nothing. */
        if (r && (r.status === 401 || r.status === 403)) return verifyOfflinePin(merchant, code).then(function (gone) {
          if (gone) offlinePinRows(merchant, function (row) { return String(row.staff && row.staff.id || '') !== String(gone.id || ''); });
          return null;
        }, function () { return null; });
        return r && r.ok ? r.json() : null;
      })
      .then(function (d) {
        if (!(d && d.ok && d.staff)) return null;
        var staff = Object.assign({}, d.staff, d.approval ? { approval: String(d.approval) } : {}, d.actorProof ? { actorProof: String(d.actorProof) } : {});
        /* The server said yes: unlock now, refresh the offline verifier behind. */
        rememberOfflinePin(merchant, code, staff);
        return staff;
      })
      .catch(function () {
        if (opts && opts.needsServer) { lastVerify.offline = true; return null; }
        return verifyOfflinePin(merchant, code);
      })
      .finally(function () { clearTimeout(timer); });
  }

  /* The 2027 pad's request (assets/kit/pin-flow.js): the server's answer as
     it came, status and body, so every row of §10.2's response table can be
     told apart. A proven code refreshes its salted row, as verifyCode does.
     `lastFailed` remembers that the till's last request threw, which is
     how the needs-connection state is known when a pad opens. */
  var lastFailed = false;
  function verifyReply(code, action) {
    var venue = activeVenue();
    var merchant = (venue && venue.merchant) || '';
    var F = window.KiwiPinFlow;
    if (!merchant) return Promise.resolve({ kind: 'answer', status: 403, json: true, body: { error: 'forbidden-till' } });
    if (!F || typeof F.send !== 'function') return Promise.resolve({ kind: 'network' });
    var body = { merchant: merchant, pin: String(code || '') };
    if (action) body.action = action;
    return F.send('/api/pin/verify', body).then(function (reply) {
      lastFailed = reply.kind !== 'answer';
      var d = reply.body;
      if (reply.kind === 'answer' && reply.status === 200 && d && d.ok && d.staff) {
        var staff = Object.assign({}, d.staff, d.approval ? { approval: String(d.approval) } : {}, d.actorProof ? { actorProof: String(d.actorProof) } : {});
        return rememberOfflinePin(merchant, code, staff).then(function () { return reply; }, function () { return reply; });
      }
      if (reply.kind === 'answer' && (reply.status === 401 || reply.status === 403)) return verifyOfflinePin(merchant, code).then(function (gone) {
        if (gone) offlinePinRows(merchant, function (row) { return String(row.staff && row.staff.id || '') !== String(gone.id || ''); });
        return reply;
      }, function () { return reply; });
      return reply;
    });
  }
  function noteApproval(who, level) {
    if (!who) return;
    var id = String(who.id || '').slice(0, 80), role = String(who.role || '').trim();
    lastOperator = { id: id, name: String(who.name || '').trim() || 'Caissier', role: role, actorProof: who.actorProof || '', verdict: who.verdict || 'online', provenAt: who.provenAt || null };
    if (level === 'manager') {
      lastManager = { id: id, name: String(who.name || '').trim() || 'Responsable', role: role, approval: String(who.approval || ''), verdict: who.verdict || 'online', provenAt: who.provenAt || null };
      lastOperator = lastManager;
    }
  }
