/* ═════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/till-attendance.js · the till's attendance code on the
 * kit (spec §10.34; stage 4). Loaded only when the till's flag is on
 * (kiwiSkin2027:till, or ?skin=2027 for one load); with it off the till keeps
 * its shipped sheet, which replaces the code each time it opens.
 *
 *   KiwiTillAttendance.open(api)  a sheet with <k-code-display>; true if it
 *                                 opened
 *     api.merchant()              the paired merchant
 *     api.post(body)              POST /api/team/live → Promise<Response>
 *     api.time(ts)                the till's clock text for a timestamp
 *     api.venue()                 the venue's name, for the unpaired line
 *   KiwiTillAttendance.close()
 *
 * One code per merchant, the same on every till: opening asks
 * `current-attendance-code`, which returns the code another till already
 * shows. While open it asks again every 10 s and, on a timer, when the
 * SERVER's clock reaches expiresTs − 60 s (the answer's `now`, carried on
 * the till's monotonic clock), which is when the server replaces it. A new
 * code crossfades in and is announced (<k-code-display>). Replacing it on
 * purpose asks first (attendance.replace_body), then calls the shipped
 * `generate-attendance-code`.
 * ═════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  var CE = root.customElements;
  if (!K || !CE || !CE.get('k-code-display') || !CE.get('k-sheet')) return;
  var doc = root.document;
  var t = function (k, a) { return String(K.t(k, a)).replace(/[⁦-⁩]/g, ''); };
  var mono = function () { return root.performance && root.performance.now ? root.performance.now() : Date.now(); };

  var api = null, sheet = null, disp = null, ask = null;
  var live = false, busy = false, last = null, poll = 0, renew = 0;

  function stop() { clearInterval(poll); clearTimeout(renew); poll = 0; renew = 0; }

  function request(action) {
    if (busy || !live) return Promise.resolve();
    busy = true;
    var sent = mono();
    return Promise.resolve(api.post({ merchant: api.merchant(), action: action })).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!live) return;
        if (!res.ok || !data || !/^\d{6}$/.test(String(data.code || ''))) { fail(res.status, data || {}); return; }
        show(data, (sent + mono()) / 2);
      });
    }).catch(function () { if (live) fail(0, {}); }).then(function () { busy = false; });
  }

  function show(data, at) {
    last = data;
    var changeAt = Number(data.expiresTs) - 60 * 1000;
    disp.setAttribute('time', api.time(changeAt));
    disp.setAttribute('code', String(data.code));
    disp.setAttribute('state', 'shown');
    /* The server's clock decides: how long until it reaches expiresTs − 60 s,
       counted from the answer's own moment on the till's monotonic clock. */
    var wait = changeAt - (Number(data.now) || Date.now());
    clearTimeout(renew);
    renew = setTimeout(function () { request('current-attendance-code'); }, Math.max(0, wait - (mono() - at)));
  }

  function fail(status, data) {
    var err = String(data.error || '');
    if (status === 402) disp.setAttribute('state', 'subscription');
    else if (err === 'store-suspended') disp.setAttribute('state', 'suspended');
    else if (status === 403) { disp.setAttribute('venue', api.venue ? api.venue() : ''); disp.setAttribute('state', 'unpaired'); }
    else if (last) {
      disp.setAttribute('time', api.time(Number(last.expiresTs)));
      disp.setAttribute('state', 'refresh-failed');
    } else disp.setAttribute('state', 'failed');
  }

  /* Replace on purpose: a confirm sheet (Tier B, no reason chips, §11). */
  function confirmReplace() {
    if (!ask) {
      ask = doc.createElement('k-sheet');
      ask.setAttribute('confirm', '');
      ask.innerHTML = '<p class="k-body" style="margin:0 0 16px"></p>' +
        '<k-button variant="primary" full data-yes></k-button><k-button full data-no style="margin-top:8px;display:block"></k-button>';
      ask.addEventListener('kiwi:action', function (e) {
        var d = e.detail || {};
        if (d.action === 'k.sheet.close') { ask.removeAttribute('open'); return; }
        if (d.action !== 'k.button.press') return;
        var yes = e.target && e.target.hasAttribute && e.target.hasAttribute('data-yes');
        ask.removeAttribute('open');
        if (!yes) return;
        disp.setAttribute('state', 'loading');
        request('generate-attendance-code');
      });
      doc.body.appendChild(ask);
    }
    ask.setAttribute('heading', t('attendance.replace'));
    ask.querySelector('p').textContent = t('attendance.replace_body');
    ask.querySelector('[data-yes]').setAttribute('label', t('attendance.replace'));
    ask.querySelector('[data-no]').setAttribute('label', t('action.cancel'));
    ask.setAttribute('open', '');
  }

  function open(a) {
    api = a || {};
    if (!api.post || !api.merchant) return false;
    if (!sheet) {
      sheet = doc.createElement('k-sheet');
      disp = doc.createElement('k-code-display');
      disp.setAttribute('kind', 'attendance');
      sheet.appendChild(disp);
      sheet.addEventListener('kiwi:action', function (e) {
        var d = e.detail || {};
        if (d.action === 'k.sheet.close') { close(); return; }
        if (d.action === 'k.code-display.replace') { confirmReplace(); return; }
        if (d.action === 'k.code-display.retry') { disp.setAttribute('state', 'loading'); request('current-attendance-code'); }
      });
      doc.body.appendChild(sheet);
    }
    live = true; last = null; busy = false;
    disp.removeAttribute('code');
    disp.setAttribute('state', 'loading');
    sheet.setAttribute('open', '');
    request('current-attendance-code');
    stop();
    poll = setInterval(function () { request('current-attendance-code'); }, 10 * 1000);
    return true;
  }

  function close() {
    live = false;
    stop();
    if (sheet) sheet.removeAttribute('open');
  }

  root.KiwiTillAttendance = { open: open, close: close };
})(typeof window !== 'undefined' ? window : globalThis);
