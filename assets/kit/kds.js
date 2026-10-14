/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/kds.js · <k-lane>, the kitchen lane (spec §10.28, §18.7,
 * §13.6).
 *
 *   <k-lane lane="new|preparing|ready" columns="1|2|3|auto" warn late
 *           empty fit="none"> .tickets
 *
 * One root per lane: every ticket and its item action are drawn here, from the
 * shared button module (the collection rule, §20.6). Tickets fill the lane
 * column by column in the order given; the last one that does not fit full is
 * tried compressed (kds.compressed), and the rest become the newer card
 * (kds.newer). `columns="auto"` takes as many 384-wide columns as the lane
 * holds; `fit="none"` draws every ticket full and lets the lane grow (the
 * newer sheet). `empty` replaces the lane's empty line (loading, offline).
 * The kitchen never buzzes (§15.6): no haptic is played here.
 *
 * ticket: { id, number, minutes, doneAt, source: {kind: 'table'|'takeaway'|
 *           'delivery', label}, chips: [label],
 *           items: [{qty, name, tr, tag, mods: [], note, off, voided}],
 *           note, following, voidAlert: {text, busy}, unsynced, recalled,
 *           saving, error, stationOnly, recall }
 *   tr          the line in the screen's language, under the chef's name
 *   off         a line another station cooks (drawn in ink-3)
 *   doneAt      the ready lane's time, in place of the timer
 *   stationOnly the ready lane: this station is done, the order is not
 *   recall      the ready lane offers kds.recall
 * Events: k.lane.action (id, {action: start|ready|served|recall|void-accept|
 *         void-reject}), k.lane.retry, k.lane.newer.
 * Method: retime([{id, minutes}]) moves the timers and tones in place, without
 *         a rebuild, so a cook's finger never loses its button.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K) return;
  var esc = K.esc, t = K.t, th = K.th, icon = K.icon, C = K.controls;

  function elapsed(m) { var f = root.KiwiFormat; return f ? f.elapsed(m) : (m < 1 ? '0' : m + ' min'); }
  var ACTION = { 'new': ['start', 'kds.start'], preparing: ['ready', 'kds.mark_ready'], ready: ['served', 'kds.mark_served'] };
  var EMPTY = { 'new': 'kds.no_new', preparing: 'kds.no_preparing', ready: 'kds.no_ready' };
  var COL_W = 384, GAP = 16;

  var KLane = K.make({
    setup: function () {
      var self = this;
      C.button.bind(this.shadowRoot, function (el, g) {
        var tk = el.closest('[data-t]');
        var w = el.getAttribute('data-w');
        if (w === 'newer') { self.emit('newer', null, { shown: self.int('data-shown', 0) }); return; }
        self.emit(w === 'retry' ? 'retry' : 'action', tk && tk.getAttribute('data-t'), { action: w, gestureId: g });
      }, '[data-w]');
      if (root.ResizeObserver) {
        try {
          var lastW = -1, lastH = -1;
          new ResizeObserver(function () {
            /* In a sheet (fit="none") the height is the content's: only a new
               width draws the lane again. */
            if (self.clientWidth === lastW && (self.clientHeight === lastH || self.str('fit') === 'none')) return;
            lastW = self.clientWidth; lastH = self.clientHeight;
            self.fit();
          }).observe(this);
        } catch (_) {}
      }
    },
    tone: function (tk) {
      var m = tk.minutes || 0;
      if (this.str('lane') === 'ready') return 'calm';
      if (m >= this.int('late', 15)) return 'late';
      if (m >= this.int('warn', 8)) return 'warning';
      return 'calm';
    },
    stateWord: function (tone) {
      return tone === 'late' ? '<span class="sw">' + icon('error', 24) + th('kds.late') + '</span>' : (tone === 'warning' ? icon('timer', 24, 'tw') : '');
    },
    ticket: function (tk, compressed) {
      var lane = this.str('lane', 'new'), tone = this.tone(tk), act = ACTION[lane];
      var src = tk.source || {};
      var srcIcon = src.kind === 'delivery' ? icon('two_wheeler', 24) : '';
      var chips = (tk.chips || []).map(function (c) { return '<span class="src k-callout">' + esc(c) + '</span>'; }).join('');
      var items = tk.items || [];
      var body = '';
      if (lane !== 'ready' && compressed) body = '<p class="k-body cmp">' + th('kds.compressed', { n: items.length }) + '</p>';
      else if (lane !== 'ready') {
        body = '<ul class="its">' + items.map(function (it) {
          return '<li class="it' + (it.voided ? ' vd' : '') + (it.off ? ' off' : '') + '"><span class="q k-heading k-num">' + esc(it.qty) + '</span><span class="nm">' +
            (it.tag ? '<span class="k-foot k-ink2 tg">' + esc(it.tag) + '</span>' : '') +
            '<span class="k-body n">' + esc(it.name) + '</span>' +
            (it.tr ? '<span class="k-callout k-ink2">' + esc(it.tr) + '</span>' : '') +
            (it.mods || []).map(function (m) { return '<span class="k-callout k-ink2">' + esc(m) + '</span>'; }).join('') +
            (it.note ? '<span class="k-callout ln">' + esc(it.note) + '</span>' : '') +
            (it.voided ? '<span class="k-foot vw">' + th('kds.voided') + '</span>' : '') + '</span></li>';
        }).join('') + '</ul>' + (tk.note ? '<p class="nt k-body">' + icon('warning', 32) + '<span>' + esc(tk.note) + '</span></p>' : '') +
          (tk.following ? '<p class="k-callout fl">' + esc(tk.following) + '</p>' : '');
      }
      var va = tk.voidAlert;
      var voidBlock = va ? '<div class="va" role="alert"><p class="k-body vt">' + icon('warning', 32) + '<span>' + esc(va.text) + '</span></p><div class="vb">' +
        C.button.render({ variant: 'danger', size: 'K', full: true, label: t('kds.void.accept'), id: 'va-' + tk.id, attrs: ' data-w="void-accept"', loading: !!va.busy }) +
        C.button.render({ variant: 'secondary', size: 'K', full: true, label: t('kds.void.reject'), id: 'vr-' + tk.id, attrs: ' data-w="void-reject"', loading: !!va.busy }) +
        '</div></div>' : '';
      var sync = tk.unsynced ? '<p class="k-foot us" role="status">' + icon('sync_alt', 20) + th('kds.sync_pending') + '</p>' : '';
      var main = tk.stationOnly
        ? C.button.render({ variant: 'item', size: 'K', full: true, label: t('kds.station_done'), id: 'a-' + tk.id, disabled: true })
        : C.button.render({ variant: 'item', size: 'K', full: true, label: t(act[1]), id: 'a-' + tk.id, attrs: ' data-w="' + act[0] + '"', loading: !!tk.saving, spinning: !!tk.saving });
      var foot = tk.error
        ? '<p class="k-foot er">' + th('kds.not_saved') + '</p>' + C.button.render({ variant: 'item', size: 'K', full: true, label: t('action.try_again'), id: 'r-' + tk.id, attrs: ' data-w="retry"' })
        : main + (lane === 'ready' && tk.recall ? C.button.render({ variant: 'plain', label: t('kds.recall'), id: 'rc-' + tk.id, attrs: ' data-w="recall"' }) : '');
      /* §18.7: the Ready card is compact, its number in Title, the time it
         was ready beside the source; the other lanes carry the timer. */
      var ready = lane === 'ready';
      var clock = ready ? '' : '<span class="k-title k-num tm">' + esc(elapsed(tk.minutes || 0)) + '</span>';
      var done = ready && tk.doneAt ? '<span class="k-callout k-ink2 dn">' + icon('check', 24) + th('kds.ready_at', { time: tk.doneAt }) + '</span>' : '';
      return '<article class="tk ' + tone + (tk.recalled ? ' rc' : '') + (ready ? ' rd' : '') + (compressed ? ' cp' : '') + '" data-t="' + esc(tk.id) + '" aria-label="' + esc(t('kds.announce', { n: tk.number, source: src.label || '' })) + '">' +
        '<header class="th"><div class="r1"><span class="' + (ready ? 'k-title' : 'k-display') + ' k-num no">' + esc(tk.number) + '</span>' + clock + '</div>' +
        '<div class="r2"><span class="src k-callout">' + srcIcon + esc(src.label || '') + '</span>' + chips + done + '<span class="swp">' + this.stateWord(tone) + '</span></div></header>' +
        sync + body + voidBlock + '<footer class="tf">' + foot + '</footer></article>';
    },
    render: function () {
      var list = this.tickets || [];
      var empty = this.str('empty') || t(EMPTY[this.str('lane', 'new')] || 'kds.no_new');
      this.shadowRoot.innerHTML = list.length ? '<div class="cols"></div>' : '<p class="k-callout k-ink3 em">' + esc(empty) + '</p>';
      this.fit();
    },
    columnCount: function () {
      var c = this.str('columns', '1');
      if (c === 'auto') return Math.max(1, Math.floor((this.clientWidth + GAP) / (COL_W + GAP)));
      return Math.max(1, parseInt(c, 10) || 1);
    },
    /* §13.6: fill the columns; compress the one that does not fit; the rest
       become the newer card. Heights are measured, never assumed. */
    fit: function () {
      var box = this.$('.cols'), list = this.tickets || [];
      if (!box) return;
      var free = this.str('fit') === 'none';
      var n = free ? 1 : this.columnCount(), H = free ? Infinity : (this.clientHeight || Infinity), self = this;
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
        var h = node.offsetHeight + (used ? GAP : 0);
        if (used + h <= H || (k === 0 && c === 0)) { used += h; shown++; continue; }   /* the oldest is always full */
        col.removeChild(node);
        if (c < n - 1) { c++; used = 0; k--; continue; }
        /* last column: try compressed, then the newer card */
        tmp.innerHTML = this.ticket(list[k], true);
        node = tmp.firstChild;
        col.appendChild(node);
        var left = list.length - k - 1;
        if (used + node.offsetHeight + GAP + (left ? 88 + GAP : 0) <= H) { used += node.offsetHeight + GAP; shown++; continue; }
        col.removeChild(node);
        break;
      }
      var rest = list.length - shown;
      if (rest > 0) {
        colEls[c].insertAdjacentHTML('beforeend', '<div class="nw">' + C.button.render({ variant: 'secondary', size: 'K', full: true, label: t('kds.newer', { n: rest }), ariaLabel: t('kds.newer_open'), id: 'nw', attrs: ' data-w="newer"' }) + '</div>');
      }
      self.setAttribute('data-shown', String(shown));
    },
    retime: function (list) {
      var self = this, byId = {};
      (this.tickets || []).forEach(function (tk) { byId[tk.id] = tk; });
      (list || []).forEach(function (u) {
        var tk = byId[u.id];
        if (!tk || tk.minutes === u.minutes) return;
        tk.minutes = u.minutes;
        var el = self.shadowRoot.querySelector('[data-t="' + String(u.id).replace(/["\\]/g, '\\$&') + '"]');
        if (!el) return;
        var tm = el.querySelector('.tm.k-num');
        if (tm) tm.textContent = elapsed(tk.minutes || 0);
        var tone = self.tone(tk);
        if (!el.classList.contains(tone)) {
          el.classList.remove('calm', 'warning', 'late');
          el.classList.add(tone);
          var sw = el.querySelector('.swp');
          if (sw) sw.innerHTML = self.stateWord(tone);
        }
      });
    }
  });
  K.define('k-lane', KLane, {
    attrs: ['lane', 'columns', 'warn', 'late', 'empty', 'fit'], props: ['tickets'],
    css: C.button.css + ':host{display:block;height:100%;overflow:hidden}:host([fit="none"]){height:auto;overflow:visible}' +
      '.cols{display:grid;gap:16px;align-items:start}.col{display:flex;flex-direction:column;gap:16px;min-width:0}' +
      '.tk{border-radius:var(--k-r-3);background-color:var(--k-surface-1);overflow:hidden}' +
      '.th{padding:12px;box-shadow:inset 0 -1px 0 var(--k-line-strong)}' +
      '.r1{display:flex;align-items:baseline;justify-content:space-between;gap:12px;min-height:70px}.r2{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-block-start:4px}' +
      '.r1{flex-wrap:wrap}.no{min-width:0}.tm,.dn{display:inline-flex;align-items:center;gap:6px;flex:none}.rd .r1{min-height:0}' +
      '.src{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:4px 12px;border-radius:999px;background-color:var(--k-surface-3);font-weight:var(--k-fw-callout-strong)}' +
      '.swp{display:inline-flex}' +
      '.warning .th{background-color:var(--k-warning-solid);color:var(--k-on-warning)}.warning .src,.late .src{background-color:transparent;box-shadow:inset 0 0 0 2px currentColor}' +
      '.late{box-shadow:inset 0 0 0 3px var(--k-danger-solid)}.late .th{background-color:var(--k-danger-solid);color:var(--k-on-danger)}' +
      '.sw{display:inline-flex;align-items:center;gap:6px;font-weight:var(--k-fw-callout-strong)}' +
      '.rc{box-shadow:inset 0 0 0 2px var(--k-accent)}' +
      '.its{list-style:none;margin:0;padding:8px 12px}.it{display:flex;gap:12px;min-height:56px;align-items:flex-start;padding-block:4px}' +
      '.q{flex:none;width:48px;height:48px;border-radius:var(--k-r-1);background-color:var(--k-surface-3);display:flex;align-items:center;justify-content:center}' +
      '.nm{display:flex;flex-direction:column;min-width:0}.n{font-weight:var(--k-fw-body-strong);overflow-wrap:anywhere}' +
      '.ln{font-weight:var(--k-fw-callout-strong);color:var(--k-ink-1)}.tg{font-weight:var(--k-fw-callout-strong)}' +
      '.off{opacity:1}.off .n,.off .q{color:var(--k-ink-3)}' +
      '.vd .n{text-decoration:line-through;color:var(--k-ink-3)}.vw{color:var(--k-danger)}' +
      '.nt,.vt{display:flex;gap:8px;align-items:flex-start;margin:0 12px 8px;padding:8px;border-radius:var(--k-r-1);background-color:var(--k-warning-tint);color:var(--k-ink-1);font-weight:var(--k-fw-body-strong)}' +
      '.fl{margin:0 12px 8px;color:var(--k-ink-2)}' +
      '.va{margin:0 12px 8px;padding:0 0 8px;border-radius:var(--k-r-2);box-shadow:inset 0 0 0 2px var(--k-danger-solid)}.va .vt{margin:0 0 8px;background-color:var(--k-danger-tint)}.vb{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 8px}' +
      '.us{display:flex;align-items:center;gap:6px;margin:8px 12px 0;color:var(--k-ink-2)}' +
      '.cmp{margin:0;padding:4px 12px}.tf{display:flex;flex-direction:column;gap:4px;padding:12px}.tf>.k-btnw:not(.k-btnw--full){align-self:center}.er{margin:0 0 8px;color:var(--k-danger)}' +
      '.rd .th{box-shadow:none}.em{margin:0;padding:24px;text-align:center}'
  });
})(typeof window !== 'undefined' ? window : globalThis);
