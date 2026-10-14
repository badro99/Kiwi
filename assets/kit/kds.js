/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/kds.js · <k-lane>, the kitchen lane (spec §10.28, §18.7,
 * §13.6).
 *
 *   <k-lane lane="new|preparing|ready" columns warn late> .tickets
 *
 * One root per lane: every ticket and its item action are drawn here, from the
 * shared button module (the collection rule, §20.6). Tickets fill the lane
 * column by column in the order given; the last one that does not fit full is
 * tried compressed (kds.compressed), and the rest become the newer card
 * (kds.newer). The kitchen never buzzes (§15.6): no haptic is played here.
 *
 * ticket: { id, number, minutes, source: {kind: 'table'|'takeaway'|'delivery',
 *           label}, items: [{qty, name, mods:[], voided}], note, recalled,
 *           saving, error }
 * Events: k.lane.action (id, {action: start|ready|served}), k.lane.retry,
 *         k.lane.newer.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K) return;
  var esc = K.esc, t = K.t, th = K.th, numHtml = K.numHtml, icon = K.icon, C = K.controls;

  function elapsed(m) { var f = root.KiwiFormat; return f ? f.elapsed(m) : (m < 1 ? '0' : m + ' min'); }
  var ACTION = { 'new': ['start', 'kds.start'], preparing: ['ready', 'kds.mark_ready'], ready: ['served', 'kds.mark_served'] };

  var KLane = K.make({
    setup: function () {
      var self = this;
      C.button.bind(this.shadowRoot, function (el, g) {
        var tk = el.closest('[data-t]');
        var w = el.getAttribute('data-w');
        if (w === 'newer') { self.emit('newer', null, null); return; }
        self.emit(w === 'retry' ? 'retry' : 'action', tk && tk.getAttribute('data-t'), { action: w, gestureId: g });
      }, '[data-w]');
      if (root.ResizeObserver) { try { new ResizeObserver(function () { self.fit(); }).observe(this); } catch (_) {} }
    },
    tone: function (tk) {
      var m = tk.minutes || 0;
      if (this.str('lane') === 'ready') return 'calm';
      if (m >= this.int('late', 15)) return 'late';
      if (m >= this.int('warn', 8)) return 'warning';
      return 'calm';
    },
    ticket: function (tk, compressed) {
      var lane = this.str('lane', 'new'), tone = this.tone(tk), act = ACTION[lane];
      var src = tk.source || {};
      var srcIcon = src.kind === 'delivery' ? icon('two_wheeler', 24) : '';
      var stateWord = tone === 'late' ? '<span class="sw">' + icon('error', 24) + th('kds.late') + '</span>' : (tone === 'warning' ? icon('timer', 24, 'tw') : '');
      var items = tk.items || [];
      var body;
      if (lane === 'ready') body = '';
      else if (compressed) body = '<p class="k-body cmp">' + th('kds.compressed', { n: items.length }) + '</p>';
      else {
        body = '<ul class="its">' + items.map(function (it) {
          return '<li class="it' + (it.voided ? ' vd' : '') + '"><span class="q k-heading k-num">' + esc(it.qty) + '</span><span class="nm"><span class="k-body n">' + esc(it.name) + '</span>' +
            (it.mods || []).map(function (m) { return '<span class="k-callout k-ink2">' + esc(m) + '</span>'; }).join('') +
            (it.voided ? '<span class="k-foot vw">' + th('kds.voided') + '</span>' : '') + '</span></li>';
        }).join('') + '</ul>' + (tk.note ? '<p class="nt k-body">' + icon('warning', 32) + '<span>' + esc(tk.note) + '</span></p>' : '');
      }
      var foot = tk.error
        ? '<p class="k-foot er">' + th('kds.not_saved') + '</p>' + C.button.render({ variant: 'item', size: 'K', full: true, label: t('action.try_again'), id: 'r-' + tk.id, attrs: ' data-w="retry"' })
        : C.button.render({ variant: 'item', size: 'K', full: true, label: t(act[1]), id: 'a-' + tk.id, attrs: ' data-w="' + act[0] + '"', loading: !!tk.saving, spinning: !!tk.saving });
      return '<article class="tk ' + tone + (tk.recalled ? ' rc' : '') + (lane === 'ready' ? ' rd' : '') + '" data-t="' + esc(tk.id) + '" aria-label="' + esc(t('kds.announce', { n: tk.number, source: src.label || '' })) + '">' +
        '<header class="th"><div class="r1"><span class="k-display k-num no">' + esc(tk.number) + '</span><span class="k-title k-num tm">' + esc(elapsed(tk.minutes || 0)) + '</span></div>' +
        '<div class="r2"><span class="src k-callout">' + srcIcon + esc(src.label || '') + '</span>' + stateWord + '</div></header>' +
        body + '<footer class="tf">' + foot + '</footer></article>';
    },
    render: function () {
      var list = this.tickets || [];
      this.shadowRoot.innerHTML = list.length ? '<div class="cols"></div>' : '<p class="k-callout k-ink3 em">' + th('kds.no_new') + '</p>';
      this.fit();
    },
    /* §13.6: fill the columns; compress the one that does not fit; the rest
       become the newer card. Heights are measured, never assumed. */
    fit: function () {
      var box = this.$('.cols'), list = this.tickets || [];
      if (!box) return;
      var n = Math.max(1, this.int('columns', 1)), H = this.clientHeight || Infinity, gap = 16, self = this;
      var cols = [];
      for (var i = 0; i < n; i++) cols.push('');
      box.style.gridTemplateColumns = 'repeat(' + n + ',minmax(0,1fr))';
      box.innerHTML = cols.map(function () { return '<div class="col"></div>'; }).join('');
      var colEls = this.$$('.col'), c = 0, used = 0, shown = 0;
      for (var k = 0; k < list.length; k++) {
        var col = colEls[c];
        var tmp = root.document.createElement('div');
        tmp.innerHTML = this.ticket(list[k], false);
        var node = tmp.firstChild;
        col.appendChild(node);
        var h = node.offsetHeight + (used ? gap : 0);
        if (used + h <= H) { used += h; shown++; continue; }
        col.removeChild(node);
        if (c < n - 1) { c++; used = 0; k--; continue; }
        /* last column: try compressed, then the newer card */
        tmp.innerHTML = this.ticket(list[k], true);
        node = tmp.firstChild;
        col.appendChild(node);
        var left = list.length - k - 1;
        if (used + node.offsetHeight + gap + (left ? 88 + gap : 0) <= H) { used += node.offsetHeight + gap; shown++; continue; }
        col.removeChild(node);
        break;
      }
      var rest = list.length - shown;
      if (rest > 0) {
        colEls[c].insertAdjacentHTML('beforeend', '<div class="nw">' + C.button.render({ variant: 'secondary', size: 'K', full: true, label: t('kds.newer', { n: rest }), ariaLabel: t('kds.newer_open'), id: 'nw', attrs: ' data-w="newer"' }) + '</div>');
      }
      self.setAttribute('data-shown', String(shown));
    }
  });
  K.define('k-lane', KLane, {
    attrs: ['lane', 'columns', 'warn', 'late'], props: ['tickets'],
    css: C.button.css + ':host{display:block;height:100%;overflow:hidden}' +
      '.cols{display:grid;gap:16px;align-items:start}.col{display:flex;flex-direction:column;gap:16px;min-width:0}' +
      '.tk{border-radius:var(--k-r-3);background-color:var(--k-surface-1);overflow:hidden}' +
      '.th{padding:12px;box-shadow:inset 0 -1px 0 var(--k-line-strong)}' +
      '.r1{display:flex;align-items:baseline;justify-content:space-between;gap:12px;min-height:70px}.r2{display:flex;align-items:center;gap:12px;margin-block-start:4px}' +
      '.src{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:4px 12px;border-radius:999px;background-color:var(--k-surface-3);font-weight:var(--k-fw-callout-strong)}' +
      '.warning .th{background-color:var(--k-warning-solid);color:var(--k-on-warning)}.warning .src,.late .src{background-color:transparent;box-shadow:inset 0 0 0 2px currentColor}' +
      '.late{box-shadow:inset 0 0 0 3px var(--k-danger-solid)}.late .th{background-color:var(--k-danger-solid);color:var(--k-on-danger)}' +
      '.sw{display:inline-flex;align-items:center;gap:6px;font-weight:var(--k-fw-callout-strong)}' +
      '.rc{box-shadow:inset 0 0 0 2px var(--k-accent)}' +
      '.its{list-style:none;margin:0;padding:8px 12px}.it{display:flex;gap:12px;min-height:56px;align-items:flex-start;padding-block:4px}' +
      '.q{flex:none;width:48px;height:48px;border-radius:var(--k-r-1);background-color:var(--k-surface-3);display:flex;align-items:center;justify-content:center}' +
      '.nm{display:flex;flex-direction:column;min-width:0}.n{font-weight:var(--k-fw-body-strong);overflow-wrap:anywhere}' +
      '.vd .n{text-decoration:line-through;color:var(--k-ink-3)}.vw{color:var(--k-danger)}' +
      '.nt{display:flex;gap:8px;align-items:flex-start;margin:0 12px 8px;padding:8px;border-radius:var(--k-r-1);background-color:var(--k-warning-tint);color:var(--k-ink-1);font-weight:var(--k-fw-body-strong)}' +
      '.cmp{margin:0;padding:4px 12px}.tf{padding:12px}.er{margin:0 0 8px;color:var(--k-danger)}' +
      '.rd .th{box-shadow:none}.em{margin:0;padding:24px;text-align:center}'
  });
})(typeof window !== 'undefined' ? window : globalThis);
