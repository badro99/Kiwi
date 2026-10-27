/* ═════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/team-split.js · the team app's split view on iPad and
 * wider (spec §12, §13.4; stage 6). Loaded only with the team app's flag
 * (kiwiSkin2027:team, or ?skin=2027 for one load).
 *
 * From 768 wide, the tabs become a sidebar (an 88 rail at the leading edge)
 * and an open table sits beside the tables list (360), instead of covering
 * it. kit.css draws the layout; this file only keeps the list live while a
 * table is open: kiwi-serveur.html's showScreen() makes every other screen
 * hidden and inert, and the list must stay readable and tappable beside the
 * detail. Tapping another table first runs the shipped Back (returnToFloor,
 * which releases the open table's lock), so no lock is left behind; the
 * shipped tap then opens the new one. The page keeps every decision.
 * ═════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var doc = root.document;
  if (doc.documentElement.getAttribute('data-skin-2027') !== 'team') return;
  var WIDE = '(min-width: 768px)';
  var mq = root.matchMedia ? root.matchMedia(WIDE) : null;
  var main = null, table = null;

  function wide() { return !!(mq && mq.matches); }
  function open() { return !!(table && table.classList.contains('is-active')); }

  /* The list beside an open table: visible, announced, tappable. */
  function sync() {
    var on = wide() && open();
    if (on) doc.documentElement.setAttribute('data-k-split', 'open');
    else doc.documentElement.removeAttribute('data-k-split');
    mark();
    if (!main) return;
    /* Written only when it changes: the observer below watches it. */
    var hide = !on && !main.classList.contains('is-active');
    if (!on && !hide) return;
    if (main.inert !== hide) main.inert = hide;
    if (main.getAttribute('aria-hidden') !== String(hide)) main.setAttribute('aria-hidden', String(hide));
  }

  /* The open table is the selected row of the list (§10.8), re-marked
     whenever the page redraws its cards. */
  function openId() {
    try { return open() && typeof activeTableId !== 'undefined' ? activeTableId : null; } catch (_) { return null; }
  }
  function mark() {
    var id = wide() ? openId() : null;
    Array.prototype.forEach.call(doc.querySelectorAll('#screen-main .table-card'), function (c) {
      var on = id != null && c.getAttribute('data-table') === String(id);
      if (on !== c.hasAttribute('data-k-sel')) c.toggleAttribute('data-k-sel', on);
      if (c.getAttribute('aria-current') !== (on ? 'true' : null)) { if (on) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current'); }
    });
  }

  /* Another table while one is open: the shipped Back first. */
  function onTap(e) {
    if (!wide() || !open()) return;
    var card = e.target.closest && e.target.closest('#screen-main .table-card');
    if (!card) return;
    /* The table already open: nothing to do, its lock stays. */
    if (card.getAttribute('data-table') === String(openId())) { e.stopPropagation(); return; }
    var back = doc.getElementById('td-back');
    if (back) back.click();
  }

  /* The shipped renderer keeps MAD literals. Localize its amount-only nodes
     with the same formatter as the till, without changing the flag-off path. */
  var amounts = new WeakMap();
  function currency() {
    if (!root.KiwiFormat) return;
    var lang = doc.documentElement.lang || 'fr';
    var f = root.KiwiFormat.for(lang);
    doc.querySelectorAll('.tc-amount, .td-item-price, .td-summary .mono, .td-total-row .val').forEach(function (node) {
      if (node.children.length) return;
      var saved = amounts.get(node);
      var text = node.textContent.replace(/[\u2066-\u2069]/g, '');
      var m = text.match(/^([\d\s\u00a0\u202f]+)(?:[,.](\d+))?\s*(?:MAD|درهم)$/);
      if (!saved || saved.text !== node.textContent) {
        if (!m) return;
        saved = { value: Number(m[1].replace(/\s/g, '') + (m[2] ? '.' + m[2] : '')), digits: m[2] ? m[2].length : 0 };
      }
      var next = f.money(saved.value, saved.digits);
      saved.text = next;
      amounts.set(node, saved);
      if (node.textContent !== next) node.textContent = next;
    });
  }

  function start() {
    main = doc.getElementById('screen-main');
    table = doc.getElementById('screen-table');
    if (!main || !table) return;
    doc.documentElement.setAttribute('data-k-team-split', '');
    new root.MutationObserver(currency).observe(doc.querySelector('.app'), { childList: true, subtree: true, characterData: true });
    new root.MutationObserver(currency).observe(doc.documentElement, { attributes: true, attributeFilter: ['lang'] });
    currency();
    new root.MutationObserver(sync).observe(table, { attributes: true, attributeFilter: ['class'] });
    new root.MutationObserver(function () { if (doc.documentElement.hasAttribute('data-k-split')) sync(); }).observe(main, { attributes: true, attributeFilter: ['aria-hidden'] });
    var zones = doc.getElementById('tables-zones');
    if (zones) new root.MutationObserver(mark).observe(zones, { childList: true, subtree: true });
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', sync); else if (mq.addListener) mq.addListener(sync); }
    doc.addEventListener('click', onTap, true);
    sync();
  }

  root.KiwiTeamSplit = { sync: sync };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
