/* ═════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/access-reset.js · forgot and reset password on the kit
 * (spec §18.8, R1 to R7; stage 6). Loaded only when the access flag is on
 * (kiwiSkin2027:access, or ?skin=2027 for one load); with it off, reset.html
 * draws its shipped flow.
 *
 * The routes and the no-oracle rule are the shipped ones (functions/auth/
 * forgot.js, reset.js): the request answers the same for a known and an
 * unknown address, so no screen says whether an account exists. One state per
 * answer, as §18.8's table writes it:
 *   R1 request · R2 link sent · R3 mail unavailable · R4 checking the link ·
 *   R5 invalid or expired (or used, after a lost update) · R6 new password ·
 *   R7 done.
 * The remembered address (§18.8, revision 7): on a 200, R1 keeps the address
 * it sent on this device, localStorage kiwiResetEmail = {email, ts}, read only
 * while under an hour old, deleted at R7, at Back and on any read past the
 * hour; R5's Get a new link then posts it in one tap.
 * No haptic anywhere: a reset is not a commit (§15.6).
 * ═════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  var doc = root.document;
  if (!K || doc.documentElement.getAttribute('data-skin-2027') !== 'access') return;
  var t = function (k, a) { return String(K.t(k, a)).replace(/[⁦-⁩]/g, ''); };
  var esc = K.esc;

  var KEY = 'kiwiResetEmail', HOUR = 3600000;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var view = null, timers = [], token = '';

  function remembered() {
    try {
      var v = JSON.parse(root.localStorage.getItem(KEY) || 'null');
      if (v && v.email && Date.now() - Number(v.ts) < HOUR) return String(v.email);
      root.localStorage.removeItem(KEY);
    } catch (_) {}
    return '';
  }
  function remember(email) { try { root.localStorage.setItem(KEY, JSON.stringify({ email: email, ts: Date.now() })); } catch (_) {} }
  function forget() { try { root.localStorage.removeItem(KEY); } catch (_) {} }
  function backHref() { return '/dashboard?lang=' + (doc.documentElement.lang || 'fr'); }

  function post(url, body) {
    return root.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j || {} }; }, function () { return { status: r.status, j: {} }; }); });
  }

  /* One screen at a time; data-state names it for the tests (§18.8's rows). */
  function draw(state, html) {
    timers.forEach(function (x) { root.clearTimeout(x); root.clearInterval(x); });
    timers = [];
    view.setAttribute('data-state', state);
    view.innerHTML = html;
  }
  function head(title, body) {
    return '<h1 class="k-heading k-ac__t">' + esc(title) + '</h1>' + (body ? '<p class="k-body k-ink2 k-ac__p">' + esc(body) + '</p>' : '');
  }
  var BANNER = '<k-banner live class="k-ac__bn"></k-banner>';
  function primary(label, act) { return '<k-button variant="primary" size="L" full data-do="' + act + '" label="' + esc(label) + '"></k-button>'; }
  function back() { return '<a class="k-ac__plain k-body" data-back href="' + esc(backHref()) + '">' + esc(t('ob.forgot.back')) + '</a>'; }
  function $(sel) { return view.querySelector(sel); }
  function banner(key, tone, action) {
    var b = $('k-banner');
    if (!b) return;
    if (action) b.setAttribute('action-label', t(action)); else b.removeAttribute('action-label');
    b.setAttribute('tone', tone || 'danger');
    b.setAttribute('message', key ? t(key) : '');
  }
  function busy(btn, on) { if (on) btn.setAttribute('loading', ''); else btn.removeAttribute('loading'); }
  /* The primary stays disabled for retry_after, then comes back without a
     reload; with a line, the minutes are counted down (the PIN pad's rule). */
  function holdFor(btn, seconds, line) {
    var until = Date.now() + Math.max(1, Number(seconds) || 60) * 1000;
    btn.setAttribute('disabled', '');
    function tick() {
      var left = until - Date.now();
      if (left <= 0) {
        btn.removeAttribute('disabled');
        if (line) line.textContent = '';
        return;
      }
      if (line) line.textContent = t('ob.reset.retry_in', { n: Math.ceil(left / 60000) });
      /* the next change of the minute count, or the end */
      timers.push(root.setTimeout(tick, ((left - 1) % 60000) + 1));
    }
    tick();
  }

  /* ── R1 · Request ── */
  function request(prefill) {
    draw('request', head(t('ob.forgot.title'), t('ob.forgot.body')) + BANNER +
      '<k-field data-f="email" type="email" autocomplete="email" inputmode="email" enterkeyhint="send" label="' + esc(t('ob.email')) + '"></k-field>' +
      primary(t('ob.forgot.send'), 'send') + back());
    var f = $('[data-f="email"]');
    if (prefill) f.value = prefill;
  }
  function sendRequest() {
    var f = $('[data-f="email"]'), btn = $('[data-do="send"]');
    var v = String(f.value || '').trim();
    f.removeAttribute('error');
    banner('');
    if (!EMAIL_RE.test(v) || v.length > 254) { f.setAttribute('error', t('ob.err.email')); return; }
    busy(btn, true);
    post('/auth/forgot', { email: v }).then(function (res) {
      busy(btn, false);
      if (res.status === 200 && res.j.ok) { remember(v); if (res.j.mail) sent(); else noMail(); return; }
      if (res.status === 400 && res.j.error === 'bad-email') { f.setAttribute('error', t('ob.err.email')); return; }
      if (res.status === 429) { banner('ob.forgot.rate', 'warning'); holdFor(btn, res.j.retry_after); return; }
      banner('ob.forgot.unavailable', 'warning');
    }, function () { busy(btn, false); banner('ob.offline', 'warning'); });
  }

  /* ── R2 · Link sent, R3 · Mail unavailable ── */
  function sent() { draw('sent', head(t('ob.forgot.sent_title'), t('ob.forgot.sent_body')) + back()); }
  function noMail() {
    draw('no-mail', head(t('ob.forgot.no_mail_title'), t('ob.forgot.no_mail_body')) + primary(t('ob.forgot.support'), 'support') + back());
  }

  /* ── R4 · Checking the link ── */
  function check() {
    draw('checking', '<span class="k-skel k-ac__sk1"></span><span class="k-skel k-ac__sk2"></span><span class="k-skel k-ac__sk3"></span>' +
      '<p class="k-vh" role="status">' + esc(t('ob.reset.checking')) + '</p>' + BANNER);
    root.fetch('/auth/reset?token=' + encodeURIComponent(token), { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 503) { failCheck('ob.reset.check_failed'); return; }
        return r.json().then(function (j) { if (j && j.valid) form(); else dead(false); }, function () { dead(false); });
      }, function () { failCheck('ob.offline'); });
  }
  function failCheck(key) {
    view.setAttribute('data-state', 'check-failed');
    banner(key, key === 'ob.offline' ? 'warning' : 'danger', 'action.try_again');
  }

  /* ── R5 · Invalid or expired link (used: the update failed and the link is lost) ── */
  function dead(used) {
    var rem = remembered();
    draw(used ? 'used' : 'dead', head(t('ob.reset.dead_title'), t(used ? 'ob.reset.used_body' : 'ob.reset.dead_body')) + BANNER +
      primary(t('ob.reset.again'), 'again') +
      (rem ? '<p class="k-foot k-ink2 k-ac__hint">' + esc(t('ob.reset.again_hint')) + '</p>' : '') + back());
  }
  function again() {
    var rem = remembered(), btn = $('[data-do="again"]');
    if (!rem) { request(''); return; }
    banner('');
    busy(btn, true);
    post('/auth/forgot', { email: rem }).then(function (res) {
      busy(btn, false);
      if (res.status === 200 && res.j.ok) { remember(rem); if (res.j.mail) sent(); else noMail(); return; }
      if (res.status === 429) { banner('ob.forgot.rate', 'warning'); holdFor(btn, res.j.retry_after); return; }
      banner('ob.forgot.unavailable', 'warning');
    }, function () { busy(btn, false); banner('ob.offline', 'warning'); });
  }

  /* ── R6 · New password ── */
  function form() {
    draw('form', head(t('ob.reset.title')) + BANNER + '<p class="k-foot k-ink2 k-ac__retry" aria-live="polite"></p>' +
      '<k-field data-f="p1" type="password" autocomplete="new-password" label="' + esc(t('ob.reset.new')) + '" helper="' + esc(t('ob.pw.rules')) + '"></k-field>' +
      '<k-field data-f="p2" type="password" autocomplete="new-password" enterkeyhint="done" label="' + esc(t('ob.reset.confirm')) + '"></k-field>' +
      '<button type="button" class="k-ac__plain k-body" data-show aria-pressed="false">' + esc(t('ob.show_password')) + '</button>' +
      primary(t('ob.reset.save'), 'save'));
  }
  var WEAK = { short: 'ob.err.pw_short', long: 'ob.err.pw_long', common: 'ob.err.pw_common', personal: 'ob.err.pw_personal' };
  function save() {
    var f1 = $('[data-f="p1"]'), f2 = $('[data-f="p2"]'), btn = $('[data-do="save"]');
    var a = String(f1.value || ''), b = String(f2.value || '');
    f1.removeAttribute('error'); f2.removeAttribute('error');
    banner('');
    if (a.length < 10) { f1.setAttribute('error', t('ob.err.pw_short')); return; }
    if (a !== b) { f2.setAttribute('error', t('ob.reset.differ')); return; }
    busy(btn, true);
    post('/auth/reset', { token: token, password: a }).then(function (res) {
      busy(btn, false);
      var j = res.j, err = j.error || '';
      if (res.status === 200 && j.ok) { done(); return; }
      if (err === 'invalid') { dead(false); return; }
      if (err === 'update-failed') { if (j.retry) banner('ob.reset.failed'); else dead(true); return; }
      if (err === 'weak') { f1.setAttribute('error', t(WEAK[j.reason] || 'ob.err.pw_short')); return; }
      if (res.status === 429) { banner('ob.reset.rate', 'warning'); holdFor(btn, j.retry_after, $('.k-ac__retry')); return; }
      if (err === 'rate-limit-unavailable') { banner('ob.forgot.unavailable', 'warning'); return; }
      banner('ob.reset.failed');
    }, function () { busy(btn, false); banner('ob.offline', 'warning'); });
  }
  function toggleShow(btn) {
    var on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    ['p1', 'p2'].forEach(function (k) {
      var f = $('[data-f="' + k + '"]');
      f.setAttribute('type', on ? 'text' : 'password');
      if (f.render) f.render();
    });
  }

  /* ── R7 · Done: the server signed the merchant in ── */
  function done() {
    forget();
    draw('done', '<p class="k-heading k-ac__t" role="status">' + esc(t('ob.reset.done')) + '</p>');
    var dur = 600;
    try { dur = parseFloat(root.getComputedStyle(doc.documentElement).getPropertyValue('--k-dur-7')) || 600; } catch (_) {}
    timers.push(root.setTimeout(function () { root.location.href = '/dashboard.html'; }, dur));
  }

  function onAction(e) {
    var d = e.detail || {};
    var w = e.target && e.target.getAttribute && e.target.getAttribute('data-do');
    if (d.action === 'k.banner.action') { check(); return; }
    if (d.action !== 'k.button.press') return;
    if (w === 'send') sendRequest();
    else if (w === 'support') root.location.href = '/support.html#mot-de-passe-oublie';
    else if (w === 'again') again();
    else if (w === 'save') save();
  }
  function onClick(e) {
    var show = e.target.closest && e.target.closest('[data-show]');
    if (show) { toggleShow(show); return; }
    if (e.target.closest && e.target.closest('[data-back]')) forget();
  }
  /* Enter in a field sends the screen's primary. */
  function onKey(e) {
    if (e.key !== 'Enter' || !e.target || e.target.localName !== 'k-field') return;
    var state = view.getAttribute('data-state');
    if (state === 'request') sendRequest();
    else if (state === 'form') save();
  }

  function start() {
    view = doc.getElementById('view');
    if (!view) return;
    view.classList.add('k-ac');
    view.addEventListener('kiwi:action', onAction);
    view.addEventListener('click', onClick);
    view.addEventListener('keydown', onKey);
    try { token = new URLSearchParams(root.location.search).get('token') || ''; } catch (_) { token = ''; }
    if (token) check(); else request(remembered());
  }
  root.KiwiAccessReset = { start: start };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
