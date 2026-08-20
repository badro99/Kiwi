/* Kiwi · automatic production tickets for specialised food trades.
 *
 * The restaurant till already owns the durable, idempotent print queue.  This
 * adapter gives the same guarantee to the five specialist food workflows
 * without teaching each POS how printers, retries or duplicate suppression
 * work.  Callers submit only after an order has entered production.
 */
(function () {
  'use strict';

  var TRADE = {
    fastfood: { title: 'CUISINE · FAST-FOOD', station: 'Cuisine' },
    pizzeria: { title: 'PIZZERIA', station: 'Four' },
    bakery: { title: 'BOULANGERIE', station: 'Fournil' },
    traiteur: { title: 'TRAITEUR', station: 'Production' },
    foodtruck: { title: 'CUISINE · FOOD TRUCK', station: 'Cuisine' },
  };

  function clean(value) { return String(value == null ? '' : value).trim(); }
  function idPart(value) { return clean(value).replace(/[^a-zA-Z0-9:_-]/g, '-').slice(0, 90); }
  function atValue(value) {
    var n = value instanceof Date ? value.getTime() : Number(value);
    return Number.isFinite(n) && n > 0 ? n : Date.now();
  }
  function timeOf(value) {
    var d = new Date(atValue(value));
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function normalizeLine(raw, fallbackStation) {
    raw = raw || {};
    var qty = Math.max(1, Math.min(9999, Math.round(Number(raw.qty) || 1)));
    var name = clean(raw.name);
    if (!name) return null;
    return {
      qty: qty,
      name: name.slice(0, 160),
      note: clean(raw.note).slice(0, 240),
      station: clean(raw.station || fallbackStation) || fallbackStation,
    };
  }

  function plan(input) {
    input = input || {};
    var trade = clean(input.trade).toLowerCase();
    var spec = TRADE[trade];
    var ref = clean(input.ref);
    if (!spec || !ref || input.committed === false) return [];
    var createdAt = atValue(input.at);
    var groups = Object.create(null);
    (Array.isArray(input.lines) ? input.lines : []).forEach(function (raw) {
      var line = normalizeLine(raw, spec.station);
      if (!line) return;
      if (!groups[line.station]) groups[line.station] = [];
      groups[line.station].push({ qty: line.qty, name: line.name, note: line.note });
    });
    return Object.keys(groups).sort().map(function (station) {
      return {
        id: ['food', trade, idPart(ref), idPart(station)].join(':'),
        createdAt: createdAt,
        station: station,
        payload: {
          title: clean(input.title || (spec.title + ' · ' + station)).toUpperCase(),
          table: clean(input.destination),
          order: '#' + ref,
          time: timeOf(createdAt),
          items: groups[station],
          station: station,
        },
      };
    });
  }

  function enqueue(input, options) {
    var jobs = plan(input);
    if (!jobs.length) return { accepted: 0, skipped: 'empty-or-uncommitted' };
    var queue = window.KiwiKitchenPrint;
    if (!queue || typeof queue.enqueue !== 'function') return { accepted: 0, skipped: 'queue-unavailable' };
    return queue.enqueue(jobs, options || {});
  }

  function tradeKey(trade) {
    var key = clean(trade).toLowerCase();
    return key === 'boulangerie' ? 'bakery' : key;
  }
  function eligible(trade) { return !!TRADE[tradeKey(trade)]; }
  function install(root, trade) {
    trade = tradeKey(trade);
    if (!root || !eligible(trade) || root.querySelector('.kfpp-setup')) return;
    if (!document.getElementById('kfpp-style')) {
      var style = document.createElement('style');
      style.id = 'kfpp-style';
      style.textContent = '.kfpp-setup{width:100%;min-height:48px;display:grid;grid-template-columns:24px minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(125,242,176,.2);border-radius:13px;background:rgba(125,242,176,.07);color:#f7f5f0;text-align:left;font:inherit;cursor:pointer}.kfpp-setup svg{width:20px;height:20px;color:#7df2b0}.kfpp-setup span{font-size:12px;font-weight:750}.kfpp-setup b{font-size:10px;color:#aeb8b2}.kfpp-setup.is-ready b{color:#7df2b0}.kfpp-setup.is-waiting b{color:#f3bd55}@media(max-width:760px){.kfpp-setup{min-height:44px;padding:9px}.kfpp-setup b{display:none}}';
      document.head.appendChild(style);
    }
    var nav = root.querySelector('nav[id$="-nav"]') || root.querySelector('nav');
    if (!nav) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'kfpp-setup';
    button.setAttribute('data-action', 'printer-connect');
    button.setAttribute('aria-label', 'Configurer l’impression production automatique');
    button.innerHTML = '<i data-lucide="printer"></i><span>Impression production</span><b data-kfpp-state>Configurer</b>';
    nav.appendChild(button);
    function paint() {
      var queue = window.KiwiKitchenPrint;
      var s = queue && queue.status ? queue.status() : null;
      var label = button.querySelector('[data-kfpp-state]');
      button.classList.toggle('is-ready', !!(s && s.printerReady && !s.pending));
      button.classList.toggle('is-waiting', !!(s && s.pending));
      label.textContent = s && s.pending ? s.pending + ' en attente' : (s && s.printerReady ? 'Prêt' : 'Configurer');
    }
    paint();
    window.addEventListener('kiwi:kitchen-print-status', paint);
    if (window.lucide) try { window.lucide.createIcons(); } catch (_) {}
  }

  window.KiwiFoodProductionPrint = {
    enqueue: enqueue,
    plan: plan,
    eligible: eligible,
    install: install,
    trades: Object.keys(TRADE),
  };
})();
