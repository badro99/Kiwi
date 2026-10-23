/* ═════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/dash-onboarding.js · the onboarding after the account,
 * on the kit (spec §18.8, steps 2 to 5 and End; stage 6). Loaded only when
 * the dashboard's flag is on; with it off, assets/onboarding.js draws its
 * shipped wizard.
 *
 *   KiwiDashOnboarding.open(kit)   onboarding.js hands over its state, its
 *                                  checks and finish() (KiwiOnboarding.kit)
 *
 * Sign-up asked the name and the business once (A1), so the flow goes on at
 * step 2 of 5: the type of business (six common types as tiles, the others in
 * a searchable list; nothing selected, Continue waits for a choice), the goals
 * and the optional daily goal, the personal code on the PIN pad twice, and
 * this device. Start using Kiwi runs the shipped finish(): the store is
 * created with the code, which goes to the server, as shipped. Then the
 * device choice: the dashboard; the till (the shipped till pairing prompt);
 * a kitchen screen or a team device, which sign the owner out of this device
 * first (ob.kds_warning, ob.team_warning) and open the kitchen screen or the
 * team sign-in.
 * ═════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  var doc = root.document;
  if (!K || doc.documentElement.getAttribute('data-skin-2027') !== 'dashboard') return;
  var t = function (k, a) { return String(K.t(k, a)).replace(/[⁦-⁩]/g, ''); };
  var esc = K.esc;

  var STEPS = ['kind', 'goals', 'code', 'device'];
  var TOTAL = 5, FIRST = 2;                    /* A1 was step 1 */
  var COMMON = 6;
  var GOAL_KEY = { sales: 'ob.goal.sales', time: 'ob.goal.time', theft: 'ob.goal.theft', margins: 'ob.goal.margins', stock: 'ob.goal.stock', loyalty: 'ob.goal.loyalty', remote: 'ob.goal.remote', multi: 'ob.goal.multi' };
  var DEVICES = ['till', 'kds', 'team', 'dashboard'];

  var api = null, box = null, at = 0, device = '', others = false, firstCode = '';

  function S() { return api.state; }
  function $(sel) { return box.querySelector(sel); }

  /* ── the frame: Back, the step and its bar, the body, the pinned primary ── */
  function frame(body, primary) {
    var n = FIRST + at;
    box.innerHTML = '<div class="k-ob__nav">' +
        (at > 0 ? '<button type="button" class="k-ob__back" data-back aria-label="' + esc(t('action.back')) + '">' + K.icon('chevron_left', 24, 'k-mir') + '</button>' : '<span class="k-ob__back" aria-hidden="true"></span>') +
        '<p class="k-foot k-ink2 k-ob__step">' + esc(t('ob.step', { n: n, total: TOTAL })) + '</p></div>' +
      '<div class="k-ob__bar" aria-hidden="true"><i style="width:' + (n / TOTAL * 100) + '%"></i></div>' +
      '<div class="k-ob__body" data-step="' + STEPS[at] + '">' + body + '</div>' +
      '<p class="k-foot k-ink2" data-draft-warning role="status"></p>' +
      (primary ? '<div class="k-ob__foot"><k-banner live tone="danger"></k-banner>' + primary + '</div>' : '');
  }
  function save() { api.save(); showDraftWarning(); }
  function showDraftWarning() {
    var warning = $('[data-draft-warning]');
    if (warning) { warning.textContent = api.draftWarning(); warning.hidden = api.draftSaved(); }
  }
  function primary(label, enabled) {
    return '<k-button variant="primary" size="L" full data-do="next" label="' + esc(label) + '"' + (enabled ? '' : ' disabled') + '></k-button>';
  }
  function enable(on) { var b = $('[data-do="next"]'); if (b) { if (on) b.removeAttribute('disabled'); else b.setAttribute('disabled', ''); } }

  /* ── 2 · the type of business ── */
  function kind() {
    var all = api.types();
    var common = all.filter(function (x) { return x.primary; });
    all.forEach(function (x) { if (common.length < COMMON && common.indexOf(x) < 0) common.push(x); });
    var tile = function (x) {
      var on = S().typeId === x.id;
      return '<button type="button" class="k-ob__tile' + (on ? ' on' : '') + '" data-kind="' + esc(x.id) + '" aria-pressed="' + on + '">' +
        '<span class="k-ob__ic">' + x.icon + '</span><span class="k-body k-ob__tl">' + esc(x.label) + '</span></button>';
    };
    frame('<h1 class="k-heading k-ob__h">' + esc(t('ob.kind')) + '</h1>' +
      '<div class="k-ob__tiles">' + common.slice(0, COMMON).map(tile).join('') + '</div>' +
      (others
        ? '<k-field search data-f="kind-q" aria-label="' + esc(t('ob.other_kinds')) + '" placeholder="' + esc(t('ob.other_kinds')) + '"></k-field><k-list data-l="kinds" selectable label="' + esc(t('ob.kind')) + '"></k-list>'
        : '<button type="button" class="k-ob__plain k-body" data-others>' + esc(t('ob.other_kinds')) + '</button>'),
      primary(t('action.continue'), !!S().typeId));
    showDraftWarning();
    if (others) listKinds('');
  }
  function listKinds(q) {
    var l = $('[data-l="kinds"]');
    if (!l) return;
    q = String(q || '').trim().toLowerCase();
    l.rows = api.types().filter(function (x) { return !q || x.label.toLowerCase().indexOf(q) >= 0; })
      .map(function (x) { return { id: x.id, title: x.label, radio: true, selected: S().typeId === x.id }; });
  }
  function pickKind(id) {
    S().typeId = id;
    save();
    Array.prototype.forEach.call(box.querySelectorAll('[data-kind]'), function (b) {
      var on = b.getAttribute('data-kind') === id;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    });
    var f = $('[data-f="kind-q"]');
    listKinds(f ? f.value : '');
    enable(true);
  }

  /* ── 3 · goals and the daily goal ── */
  function goals() {
    frame('<h1 class="k-heading k-ob__h">' + esc(t('ob.goals')) + '</h1><p class="k-body k-ink2 k-ob__p">' + esc(t('ob.goals_sub')) + '</p>' +
      '<k-chips mode="multi" label="' + esc(t('ob.goals')) + '" value="' + esc(S().goals.join(',')) + '"></k-chips>' +
      '<k-field data-f="goal" inputmode="decimal" helper="MAD" label="' + esc(t('ob.daily_goal')) + '"></k-field>',
      primary(t('action.continue'), true));
    $('k-chips').options = api.goals().map(function (g) { return { value: g.id, label: t(GOAL_KEY[g.id] || g.id) }; });
    $('[data-f="goal"]').value = S().dailyGoal || '';
  }

  /* ── 4 · the personal code, twice ── */
  function code() {
    firstCode = '';
    frame('<k-pin-pad length="4" heading="' + esc(t('ob.code')) + '" sub="' + esc(t('ob.code_sub')) + '"></k-pin-pad>', '');
    var pad = $('k-pin-pad');
    pad.onsubmit = function (c) {
      if (!firstCode) {
        var problem = api.codeProblem(c);
        if (problem) { pad.answer({ message: problem, shake: true, clear: true }); return; }
        firstCode = c;
        pad.setAttribute('heading', t('ob.code_again'));
        pad.reset();
        return;
      }
      if (c !== firstCode) {
        firstCode = '';
        pad.setAttribute('heading', t('ob.code'));
        pad.answer({ message: t('ob.code_mismatch'), shake: true, clear: true });
        return;
      }
      S().pins[0].code = c;
      go(1);
    };
  }

  /* ── 5 · this device, then Start using Kiwi ── */
  function deviceStep() {
    frame('<h1 class="k-heading k-ob__h">' + esc(t('ob.device')) + '</h1><k-list data-l="device" label="' + esc(t('ob.device')) + '"></k-list>' +
      '<p class="k-foot k-ink2 k-ob__warn" data-warn></p>',
      primary(t('ob.finish'), !!device));
    $('[data-l="device"]').rows = DEVICES.map(function (d) { return { id: d, title: t('ob.device.' + d), radio: true, selected: device === d }; });
    warn();
  }
  function warn() {
    var w = $('[data-warn]');
    if (w) w.textContent = device === 'kds' ? t('ob.kds_warning') : device === 'team' ? t('ob.team_warning') : '';
  }
  function start() {
    var btn = $('[data-do="next"]'), banner = $('k-banner');
    if (banner) banner.setAttribute('message', '');
    btn.setAttribute('loading', '');
    Promise.resolve(api.finish()).then(function (res) {
      btn.removeAttribute('loading');
      if (!res || res.error || !res.vid) { if (banner && res && res.error) banner.setAttribute('message', res.error); return; }
      if (device === 'kds' || device === 'team') {
        var next = device === 'kds' ? '/kiwi-cuisine.html' : '/kiwi-serveur.html';
        root.fetch('/auth/logout', { credentials: 'same-origin', redirect: 'manual' }).then(go2, go2);
        function go2() { root.location.href = next; }
        return;
      }
      close();
      api.enter();
    });
  }

  function render() {
    if (STEPS[at] === 'kind') kind();
    else if (STEPS[at] === 'goals') goals();
    else if (STEPS[at] === 'code') code();
    else deviceStep();
    showDraftWarning();
    var h = box.querySelector('.k-ob__h, k-pin-pad');
    if (h && h.focus) { try { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } catch (_) {} }
  }
  function go(dir) { at = Math.max(0, Math.min(STEPS.length - 1, at + dir)); render(); }

  /* Leaving a step keeps what it asked (goals and the daily goal are checked). */
  function next() {
    var step = STEPS[at];
    if (step === 'kind' && !S().typeId) return;
    if (step === 'goals') {
      S().goals = String($('k-chips').getAttribute('value') || '').split(',').filter(Boolean);
      var f = $('[data-f="goal"]');
      S().dailyGoal = String(f.value || '').trim();
      f.removeAttribute('error');
      if (api.dailyGoal() === null) { f.setAttribute('error', t('ob.err.goal')); return; }
      save();
    }
    if (step === 'device') { if (device) start(); return; }
    go(1);
  }

  function onAction(e) {
    var d = e.detail || {};
    var w = e.target && e.target.getAttribute && (e.target.getAttribute('data-do') || e.target.getAttribute('data-l'));
    if (d.action === 'k.button.press' && w === 'next') { next(); return; }
    if (d.action === 'k.list.select' && w === 'kinds') { pickKind(d.id); return; }
    if (d.action === 'k.list.select' && w === 'device') {
      device = d.id;
      $('[data-l="device"]').rows = DEVICES.map(function (x) { return { id: x, title: t('ob.device.' + x), radio: true, selected: device === x }; });
      warn();
      enable(true);
    }
  }
  function onClick(e) {
    var k = e.target.closest && e.target.closest('[data-kind]');
    if (k) { pickKind(k.getAttribute('data-kind')); return; }
    if (e.target.closest && e.target.closest('[data-others]')) { others = true; kind(); return; }
    if (e.target.closest && e.target.closest('[data-back]')) go(-1);
  }
  function onInput(e) { if (e.target && e.target.getAttribute && e.target.getAttribute('data-f') === 'kind-q') listKinds(e.target.value); }

  function close() {
    if (box && box.parentNode) box.parentNode.removeChild(box);
    box = null;
    doc.documentElement.style.overflow = '';
    if (api) api.done();
  }

  function open(kit) {
    if (!kit || !kit.state) return false;
    api = kit; at = 0; device = ''; others = false;
    try { if (root.__kiwiLock && root.__kiwiLock.hide) root.__kiwiLock.hide(); } catch (_) {}
    doc.documentElement.style.overflow = 'hidden';
    /* A div: the dashboard's bare section rule (§20.8) would pad a section. */
    box = doc.createElement('div');
    box.id = 'kit-onboarding';
    box.className = 'k-ob';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', t('ob.finish'));
    box.addEventListener('kiwi:action', onAction);
    box.addEventListener('click', onClick);
    box.addEventListener('input', onInput);
    doc.body.appendChild(box);
    render();
    return true;
  }

  root.KiwiDashOnboarding = { open: open };
})(typeof window !== 'undefined' ? window : globalThis);
