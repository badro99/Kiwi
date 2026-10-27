/* assets/quarantine-ui.js · operations the server refused, waiting for the owner.
 *
 * A refused till refund or sale (manager approval expired, refund over the
 * sale's balance, …) needs the owner's decision, but it must never stand
 * between the merchant and their work. It used to be a card pinned under the
 * top bar of every dashboard page; it now lives where notifications live:
 *   - a count on the bell, for as long as something is waiting;
 *   - one toast the first time an operation appears on this device (the ids
 *     already announced are kept per merchant, so a reload stays silent);
 *   - an entry in the bell's drawer, and the full review list in its own
 *     drawer, opened on demand (bell entry, toast action or
 *     Kiwi.handlers['quarantine-open']).
 * Old refusals stay reviewable whatever the selected date range. */
(function () {
  'use strict';
  var entries = [], tenant = '', loading = false, busy = false, failed = false, panel = null;
  var BELL = 'button[data-mobile-notifications], button[aria-label="Notifications"]';
  function text(key) {
    var i = window.KiwiI18n, lang = i && i.getLang() || 'fr';
    return i && ((i.T[lang] || {})['quarantine.' + key] || (i.T.fr || {})['quarantine.' + key]) || key;
  }
  function el(tag, content) { var node = document.createElement(tag); if (content) node.textContent = content; return node; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function count() { return entries.length === 1 ? text('one') : text('many').replace('{n}', String(entries.length)); }
  function message(reason) {
    if (reason === 'manager-required') return text('manager');
    if (reason === 'refund-exceeds-sale') return text('cap');
    if (reason === 'sale-not-found') return text('missing');
    if (/conflict/.test(reason || '')) return text('conflict');
    return text('unknown');
  }
  function button(label, fn) {
    var b = el('button', label); b.type = 'button'; b.className = 'kb ghost';
    b.style.cssText = 'white-space:normal;min-height:44px';
    b.addEventListener('click', fn); return b;
  }

  /* Bell and toast · the only things shown without the owner asking. */
  function seenKey() { return 'kiwiQuarantineSeen@' + tenant; }
  function seen() { try { var v = JSON.parse(localStorage.getItem(seenKey()) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } }
  function bell() {
    // Phones carry a second top bar with its own bell: keep every one in step.
    document.querySelectorAll(BELL).forEach(function (b) {
      var badge = b.querySelector('[data-quarantine-badge]');
      if (!entries.length) { if (badge) badge.remove(); return; }
      if (!badge) { badge = el('span'); badge.className = 'badge'; badge.setAttribute('data-quarantine-badge', ''); b.appendChild(badge); }
      if (badge.textContent !== String(entries.length)) badge.textContent = String(entries.length);
    });
  }
  function announce() {
    if (!tenant || !entries.length) return;
    var known = seen(), fresh = entries.filter(function (r) { return known.indexOf(r.id) < 0; });
    if (!fresh.length) return;
    try { localStorage.setItem(seenKey(), JSON.stringify(known.concat(fresh.map(function (r) { return r.id; })).slice(-200))); } catch (_) {}
    if (shown() || !window.Kiwi || !window.Kiwi.toast) return;
    window.Kiwi.toast(count(), { type: 'warn', desc: text('notice'), duration: 8000, action: { label: text('view'), onClick: open } });
  }
  function notificationHtml() {
    if (!entries.length) return '';
    return '<div class="notif unread" id="kiwi-quarantine-alert" role="status">'
      + '<div class="n-ico" style="background:var(--warn-soft);color:var(--warn-ink);"><span aria-hidden="true" style="display:block;width:20px;height:20px;background:currentColor;-webkit-mask:url(assets/icons/material/warning.svg) center/contain no-repeat;mask:url(assets/icons/material/warning.svg) center/contain no-repeat"></span></div>'
      + '<div class="n-body"><div class="n-title">' + esc(count()) + '</div><div class="n-desc">' + esc(text('notice')) + '</div>'
      + '<button type="button" class="kb ghost" style="margin-top:10px;min-height:44px" data-action="quarantine-open">' + esc(text('view')) + '</button></div></div>';
  }

  /* The review list · only inside its drawer. */
  function paint() {
    if (!shown()) return;
    var body = panel.el.querySelector('.kiwi-drawer-body'); if (!body) return;
    body.replaceChildren();
    var box = el('div'); box.setAttribute('data-quarantine-list', ''); box.style.cssText = 'min-width:0;color:var(--ink)';
    if (failed) { var alert = el('p', text('unavailable')); alert.setAttribute('role', 'status'); box.append(alert); }
    if (!entries.length && !failed) { box.append(el('p', text('empty'))); body.append(box); return; }
    box.append(button(text('refresh'), load));
    var list = el('ul'); list.style.cssText = 'list-style:none;padding:0;margin:12px 0;display:grid;gap:16px';
    var lang = document.documentElement.lang || 'fr';
    entries.forEach(function (row) {
      var item = el('li'); item.style.cssText = 'padding-block:12px;border-block-start:1px solid var(--atlas);overflow-wrap:anywhere';
      var amount = new Intl.NumberFormat(lang, { style: 'currency', currency: 'MAD' }).format(row.amountCents / 100);
      var date = Number(row.ts) > 0 ? new Date(Number(row.ts)).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' }) : '';
      var title = el('strong', text(row.kind) + ' · ' + amount); title.dir = 'auto'; title.style.cssText = 'display:block;font-size:15px';
      var receipt = el('small', text('receipt') + ' · ' + row.ref + (row.originalSaleId ? ' · ' + text('original') + ' · ' + row.originalSaleId : ''));
      receipt.dir = 'auto'; receipt.style.cssText = 'display:block;margin-top:2px;color:var(--n-600,#55524C)';
      item.append(title, receipt, el('p', date + ' · ' + text(/^(cash|card|transfer|cheque|credit)$/.test(row.method) ? row.method : 'other')),
        el('p', message(row.reason)));
      if (row.lastError) item.append(el('p', message(row.lastError)));
      if (row.status === 'approving' && !row.lastError) item.append(el('p', text('processing')));
      item.querySelectorAll('p').forEach(function (p) { p.style.margin = '6px 0'; });
      var actions = el('div'); actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
      actions.append(button(text(row.status === 'approving' ? 'retry' : 'approve'), function () { decide(row, 'approve'); }));
      var decline = button(text('decline'), function () { decide(row, 'decline'); });
      decline.disabled = row.status === 'approving' && !row.lastError; actions.append(decline); item.append(actions); list.append(item);
    });
    box.append(list); body.append(box);
  }
  function shown() { return !!(panel && panel.el.isConnected && panel.el.style.pointerEvents !== 'none'); }
  function open() {
    if (!window.Kiwi || !window.Kiwi.drawer) return;
    panel = window.Kiwi.drawer({ title: text('title'), subtitle: text('intro'), body: '' });
    paint();
    load();
  }

  function render() { bell(); announce(); paint(); }
  async function decide(row, action) {
    if (busy || !window.confirm(text(action === 'decline' ? 'declineConfirm' : row.kind === 'refund' ? 'approveRefund' : 'approveSale'))) return;
    busy = true;
    if (shown()) panel.el.querySelectorAll('[data-quarantine-list] button').forEach(function (b) { b.disabled = true; });
    var selected = tenant;
    try {
      var response = await fetch('/api/quarantine', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant: selected, id: row.id, action: action }) });
      var data = await response.json();
      if (selected !== window.KiwiPlatform.tenant()) return;
      if (!response.ok || !data.ok) window.alert(text('error') + ' ' + message(data.error));
    } catch (_) { window.alert(text('error')); }
    finally { busy = false; await load(); }
  }
  async function load() {
    var K = window.KiwiPlatform;
    if (!K || loading || busy) return;
    var selected = K.tenant();
    if (!selected || window.KiwiEnv && !window.KiwiEnv.isReal()) { entries = []; failed = false; render(); return; }
    if (selected !== tenant) { tenant = selected; entries = []; failed = false; render(); }
    loading = true;
    try {
      var response = await fetch('/api/quarantine?merchant=' + encodeURIComponent(selected), { credentials: 'same-origin', cache: 'no-store' });
      if (selected !== K.tenant()) return;
      if (response.status === 403) { entries = []; failed = false; render(); return; }
      var data = await response.json();
      if (!response.ok || !data.ok || data.merchant !== selected) throw new Error('unavailable');
      entries = data.entries.filter(function (r) { return ['pending', 'approving'].includes(r.status); });
      failed = false; render();
    } catch (_) {
      // Unreachable server with nothing known: stay quiet, as every other card
      // does offline. Known operations stay counted, and the list says so.
      if (selected === K.tenant() && entries.length) { failed = true; render(); }
    }
    finally { loading = false; }
  }
  /* The bell's drawer (Kiwi.handlers.notifications) is built elsewhere; once
     it is open, put the waiting operations at the top of its list. */
  function addToBell() {
    if (!entries.length) return;
    var backs = document.querySelectorAll('.kiwi-drawer-backdrop'), back = backs[backs.length - 1];
    var body = back && back.querySelector('.kiwi-drawer-body');
    if (!body || body.querySelector('#kiwi-quarantine-alert')) return;
    var hasNotice = body.querySelector('.notif');
    if (!hasNotice) body.innerHTML = '';
    body.insertAdjacentHTML('afterbegin', notificationHtml());
  }
  function wire() {
    var H = window.Kiwi && window.Kiwi.handlers; if (!H) return;
    H['quarantine-open'] = open;
    if (typeof H.notifications === 'function' && !H.notifications.__quarantine) {
      var base = H.notifications;
      H.notifications = function () { var r = base.apply(this, arguments); addToBell(); return r; };
      H.notifications.__quarantine = true;
    }
  }
  window.KiwiQuarantineReview = { notificationHtml: notificationHtml, open: open, count: function () { return entries.length; } };
  wire();
  window.addEventListener('kiwi:langchange', function () { bell(); paint(); });
  window.addEventListener('online', load);
  setTimeout(function () { wire(); load(); }, 1800); setInterval(load, 30000);
})();
