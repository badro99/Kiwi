/* Kiwi · the catalogue spreadsheet component (window.KiwiBulkGrid)
 *
 * A grid that behaves like the spreadsheet a shopkeeper already knows:
 *   arrows / Tab / Enter to move, type to replace, F2 or double-click to edit,
 *   Escape to cancel, Shift+arrows or a mouse drag for a block, Ctrl/Cmd+C and
 *   Ctrl/Cmd+V with Excel and Google Sheets (TSV), one value pasted on a block
 *   fills it, Ctrl/Cmd+D fills down, Delete clears, Ctrl/Cmd+Z undoes the last
 *   gesture. Rows are virtualised: only the rows on screen exist in the DOM, so
 *   2 000 articles scroll like 20.
 *
 * The component knows nothing about catalogues. The page hands it columns,
 * the original rows, a validator and a parser; it keeps the EDITS apart from
 * the originals, so "what changed" is always a diff and never a guess.
 *
 *   const g = KiwiBulkGrid.create(host, { columns, rows, parse, validate, label, onChange });
 *   g.edits() · g.value(id, key) · g.setValues([{id, key, value}]) · g.reset(rows)
 *   g.setFilter(ids|null) · g.checked() · g.setFlags(map) · g.undo() · g.focus()
 */
(function () {
  'use strict';
  const ROW_H = 36, SEL_W = 44, OVERSCAN = 8;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

  function css() {
    if (document.getElementById('cbg-css')) return;
    const s = document.createElement('style');
    s.id = 'cbg-css';
    s.textContent = `
.cbg{position:relative;border:1px solid var(--n-200,rgba(10,15,13,.12));border-radius:14px;background:var(--paper,#F7F5F0);outline:none;font-size:13px;color:var(--ink,#0A0F0D)}
.cbg:focus-visible{box-shadow:0 0 0 2px var(--atlas,#0B6E4F)}
.cbg-scroll{overflow:auto;height:var(--cbg-h,560px);border-radius:14px;overscroll-behavior:contain}
.cbg-head{position:sticky;top:0;z-index:3;display:grid;background:var(--paper-soft,#EFEDE6);border-bottom:1px solid var(--n-200,rgba(10,15,13,.12));min-width:max-content}
.cbg-h{padding:0 10px;height:38px;display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;letter-spacing:.02em;color:var(--n-600,#4a5550);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-inline-end:1px solid var(--n-100,rgba(10,15,13,.06))}
.cbg-h.num{justify-content:flex-end}
.cbg-h .req{color:var(--atlas,#0B6E4F)}
.cbg-body{position:relative;min-width:max-content}
.cbg-r{position:absolute;inset-inline-start:0;top:0;display:grid;height:${ROW_H}px;min-width:100%;border-bottom:1px solid var(--n-100,rgba(10,15,13,.06))}
.cbg-r.on{background:color-mix(in srgb,var(--mint,#7DF2B0) 10%,transparent)}
.cbg-c{position:relative;padding:0 10px;display:flex;align-items:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-inline-end:1px solid var(--n-100,rgba(10,15,13,.06));cursor:cell;user-select:none}
.cbg-c.num{justify-content:flex-end;font-variant-numeric:tabular-nums}
.cbg-c.ro{color:var(--n-500,#6b7570);cursor:default}
.cbg-c.sel{justify-content:center;cursor:pointer;padding:0}
.cbg-c.in{background:color-mix(in srgb,var(--atlas,#0B6E4F) 9%,transparent)}
.cbg-c.act{box-shadow:inset 0 0 0 2px var(--atlas,#0B6E4F);z-index:1}
.cbg-c.dirty{background:color-mix(in srgb,var(--mint,#7DF2B0) 26%,transparent)}
.cbg-c.dirty::before{content:"";position:absolute;inset-block:6px;inset-inline-start:0;width:3px;border-radius:2px;background:var(--atlas,#0B6E4F)}
.cbg-c.bad{background:color-mix(in srgb,var(--danger,#C94A3A) 12%,transparent);color:var(--danger,#C94A3A)}
.cbg-c.bad::after{content:"";position:absolute;top:0;inset-inline-end:0;border:5px solid transparent;border-top-color:var(--danger,#C94A3A);border-inline-end-color:var(--danger,#C94A3A)}
.cbg-c.clash{box-shadow:inset 0 -2px 0 var(--warning,#C98A2B)}
.cbg-c .ph{color:var(--n-400,#8a938f)}
.cbg-chip{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:999px;font-size:12px;background:var(--n-100,rgba(10,15,13,.06));color:var(--n-600,#4a5550)}
.cbg-chip.yes{background:color-mix(in srgb,var(--atlas,#0B6E4F) 14%,transparent);color:var(--atlas,#0B6E4F)}
.cbg-chip::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.75}
.cbg-box{width:16px;height:16px;border-radius:5px;border:1.5px solid var(--n-300,#b9bfbc);display:inline-flex;align-items:center;justify-content:center}
.cbg-box.on{background:var(--atlas,#0B6E4F);border-color:var(--atlas,#0B6E4F)}
.cbg-box.on::after{content:"";width:8px;height:4px;border:2px solid var(--paper,#F7F5F0);border-top:0;border-inline-end:0;transform:rotate(-45deg) translate(1px,-1px)}
.cbg-box.part{border-color:var(--atlas,#0B6E4F)}
.cbg-box.part::after{content:"";width:8px;height:2px;background:var(--atlas,#0B6E4F)}
.cbg-ed{position:absolute;inset:0;width:100%;height:100%;border:0;outline:2px solid var(--atlas,#0B6E4F);outline-offset:-2px;padding:0 10px;font:inherit;color:var(--ink,#0A0F0D);background:var(--paper-elev,#FDFCF9);z-index:2}
.cbg-ed.num{text-align:end}
.cbg-empty{padding:40px 16px;text-align:center;color:var(--n-500,#6b7570)}
.cbg-tip{position:absolute;z-index:5;max-width:280px;padding:7px 10px;border-radius:8px;background:var(--ink,#0A0F0D);color:var(--paper,#F7F5F0);font-size:12px;pointer-events:none}
`;
    document.head.appendChild(s);
  }

  function create(host, opts) {
    css();
    const o = opts || {};
    const cols = o.columns;
    let rows = o.rows.slice();
    let byId = new Map(rows.map((r, i) => [r.id, i]));
    let edits = Object.create(null);         // id → { key: value }
    let flags = Object.create(null);         // id → { key: 'clash' }
    let view = rows.map((_, i) => i);        // indices into rows, in display order
    const checked = new Set();
    let act = { r: 0, c: 0 }, anchor = { r: 0, c: 0 };
    let editing = null;                      // { r, c, input, row }
    const undoStack = [];
    const rendered = new Map();              // view index → row element
    const lang = () => (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';

    const template = SEL_W + 'px ' + cols.map((c) => (c.width || 140) + 'px').join(' ');
    host.innerHTML = `<div class="cbg" role="grid" tabindex="0" aria-multiselectable="true" aria-colcount="${cols.length + 1}" aria-label="${esc(o.label || '')}">
      <div class="cbg-scroll"><div class="cbg-head" role="row" style="grid-template-columns:${template}">
        <div class="cbg-h" role="columnheader" style="justify-content:center"><span class="cbg-box" data-cbg-all></span></div>
        ${cols.map((c, j) => `<div class="cbg-h${c.num ? ' num' : ''}" role="columnheader" aria-colindex="${j + 2}" title="${esc(c.hint || c.label)}">${esc(c.label)}${c.required ? '<span class="req" aria-hidden="true">*</span>' : ''}</div>`).join('')}
      </div><div class="cbg-body" role="rowgroup"></div></div></div>`;
    const root = host.firstElementChild;
    const scroller = root.querySelector('.cbg-scroll');
    const body = root.querySelector('.cbg-body');
    const allBox = root.querySelector('[data-cbg-all]');

    /* ── values ─────────────────────────────────────────────────────────── */
    const rowAt = (r) => rows[view[r]];
    function value(id, key) {
      const e = edits[id];
      if (e && key in e) return e[key];
      const i = byId.get(id);
      return i == null ? undefined : rows[i][key];
    }
    const isDirty = (id, key) => { const e = edits[id]; return !!(e && key in e); };
    const readOnly = (row, c) => !!(c.readOnly === true || (typeof c.readOnly === 'function' && c.readOnly(row)));

    function put(changes, gesture) {
      const applied = [];
      changes.forEach(({ id, key, value: v }) => {
        const i = byId.get(id); if (i == null) return;
        const col = cols.find((c) => c.key === key);
        if (!col || readOnly(rows[i], col)) return;
        const before = value(id, key);
        const same = o.same ? o.same(key, rows[i][key], v) : rows[i][key] === v;
        if (!edits[id]) edits[id] = {};
        if (same) delete edits[id][key]; else edits[id][key] = v;
        if (!Object.keys(edits[id]).length) delete edits[id];
        if (flags[id]) { delete flags[id][key]; if (!Object.keys(flags[id]).length) delete flags[id]; }
        applied.push({ id, key, prev: before, next: v });
      });
      if (applied.length && gesture !== false) undoStack.push(applied);
      if (undoStack.length > 200) undoStack.shift();
      paint();
      if (o.onChange) o.onChange();
      return applied.length;
    }

    /* ── painting ───────────────────────────────────────────────────────── */
    function display(row, c) {
      const v = value(row.id, c.key);
      if (c.format) return c.format(v, row, (k) => value(row.id, k));
      if (v == null || v === '') return c.placeholder ? `<span class="ph">${esc(c.placeholder)}</span>` : '';
      return esc(v);
    }
    function inRange(r, c) {
      return r >= Math.min(anchor.r, act.r) && r <= Math.max(anchor.r, act.r) && c >= Math.min(anchor.c, act.c) && c <= Math.max(anchor.c, act.c);
    }
    function rowHtml(r) {
      const row = rowAt(r);
      const on = checked.has(row.id);
      let h = `<div class="cbg-c sel" role="gridcell" data-sel="${r}"><span class="cbg-box${on ? ' on' : ''}" role="checkbox" aria-checked="${on}"></span></div>`;
      cols.forEach((c, j) => {
        const err = o.validate ? o.validate(row, c.key, value(row.id, c.key)) : '';
        const cls = ['cbg-c'];
        if (c.num) cls.push('num');
        if (readOnly(row, c)) cls.push('ro');
        if (isDirty(row.id, c.key)) cls.push('dirty');
        if (err) cls.push('bad');
        if (flags[row.id] && flags[row.id][c.key]) cls.push('clash');
        if (inRange(r, j)) cls.push('in');
        if (r === act.r && j === act.c) cls.push('act');
        const tip = err ? (o.message ? o.message(err) : err) : (flags[row.id] && flags[row.id][c.key]) || '';
        h += `<div class="${cls.join(' ')}" role="gridcell" aria-colindex="${j + 2}" data-r="${r}" data-c="${j}"${r === act.r && j === act.c ? ' aria-selected="true" id="cbg-act"' : ''}${tip ? ` data-tip="${esc(tip)}"` : ''}>${display(row, c)}</div>`;
      });
      return h;
    }
    function paintRow(el, r) {
      const row = rowAt(r);
      el.className = 'cbg-r' + (checked.has(row.id) ? ' on' : '');
      el.setAttribute('aria-rowindex', String(r + 2));
      el.style.transform = `translateY(${r * ROW_H}px)`;
      el.innerHTML = rowHtml(r);
    }
    let raf = 0;
    function windowRows() {
      const top = scroller.scrollTop, h = scroller.clientHeight || 560;
      return [Math.max(0, Math.floor(top / ROW_H) - OVERSCAN), Math.min(view.length, Math.ceil((top + h) / ROW_H) + OVERSCAN)];
    }
    function render(full) {
      body.style.height = Math.max(ROW_H, view.length * ROW_H) + 'px';
      const [a, b] = windowRows();
      rendered.forEach((el, r) => {
        if (r < a || r >= b) {
          if (editing && editing.r === r) commit();
          el.remove(); rendered.delete(r);
        }
      });
      for (let r = a; r < b; r++) {
        let el = rendered.get(r);
        if (!el) {
          el = document.createElement('div'); el.setAttribute('role', 'row'); el.style.gridTemplateColumns = template;
          rendered.set(r, el); body.appendChild(el); paintRow(el, r);
        } else if (full && !(editing && editing.r === r)) paintRow(el, r);
      }
      if (!view.length) body.innerHTML = `<div class="cbg-empty">${esc(o.emptyText || '')}</div>`;
      else { const e = body.querySelector('.cbg-empty'); if (e) e.remove(); }
      const n = view.filter((i) => checked.has(rows[i].id)).length;
      allBox.className = 'cbg-box' + (n && n === view.length ? ' on' : n ? ' part' : '');
      root.setAttribute('aria-rowcount', String(view.length + 1));
      root.setAttribute('aria-activedescendant', 'cbg-act');
    }
    function paint() { render(true); }
    scroller.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(false); }); }, { passive: true });

    /* ── moving ─────────────────────────────────────────────────────────── */
    function reveal() {
      const top = act.r * ROW_H, bottom = top + ROW_H + 38;
      if (top < scroller.scrollTop) scroller.scrollTop = top;
      else if (bottom > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = bottom - scroller.clientHeight;
      const cell = body.querySelector(`[data-r="${act.r}"][data-c="${act.c}"]`);
      if (cell) {
        const cr = cell.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
        if (cr.left < sr.left + SEL_W) scroller.scrollLeft -= (sr.left + SEL_W - cr.left);
        else if (cr.right > sr.right) scroller.scrollLeft += cr.right - sr.right;
      }
    }
    function move(r, c, extend) {
      act = { r: Math.max(0, Math.min(view.length - 1, r)), c: Math.max(0, Math.min(cols.length - 1, c)) };
      if (!extend) anchor = { r: act.r, c: act.c };
      paint(); reveal(); paint();
    }
    const range = () => ({ r0: Math.min(anchor.r, act.r), r1: Math.max(anchor.r, act.r), c0: Math.min(anchor.c, act.c), c1: Math.max(anchor.c, act.c) });

    /* ── editing ────────────────────────────────────────────────────────── */
    function begin(seed) {
      if (!view.length) return;
      const row = rowAt(act.r), c = cols[act.c];
      if (readOnly(row, c)) return;
      if (c.type === 'bool') { put([{ id: row.id, key: c.key, value: seed != null ? o.parse(c, seed) : !value(row.id, c.key) }]); return; }
      reveal();
      const cell = body.querySelector(`[data-r="${act.r}"][data-c="${act.c}"]`);
      if (!cell) return;
      const input = document.createElement('input');
      input.className = 'cbg-ed' + (c.num ? ' num' : '');
      input.setAttribute('aria-label', c.label);
      if (c.num) input.inputMode = 'decimal';
      if (c.options) {
        const id = 'cbg-dl-' + c.key;
        let dl = document.getElementById(id);
        if (!dl) { dl = document.createElement('datalist'); dl.id = id; root.appendChild(dl); }
        dl.innerHTML = c.options().map((x) => `<option value="${esc(x.label)}"></option>`).join('');
        input.setAttribute('list', id);
      }
      const cur = value(row.id, c.key);
      input.value = seed != null ? seed : (c.editText ? c.editText(cur) : cur == null ? '' : String(cur));
      cell.appendChild(input);
      editing = { r: act.r, c: act.c, input, id: row.id };
      input.focus();
      if (seed == null) input.select(); else input.setSelectionRange(input.value.length, input.value.length);
      input.addEventListener('keydown', onEditKey);
      input.addEventListener('blur', () => { if (editing && editing.input === input) commit(); });
    }
    function commit(cancel) {
      if (!editing) return;
      const e = editing; editing = null;
      const c = cols[e.c];
      if (!cancel) put([{ id: e.id, key: c.key, value: o.parse(c, e.input.value) }]);
      else paint();
      root.focus({ preventScroll: true });
    }
    function onEditKey(ev) {
      const k = ev.key;
      ev.stopPropagation();
      if (k === 'Escape') { ev.preventDefault(); commit(true); }
      else if (k === 'Enter') { ev.preventDefault(); commit(); move(act.r + (ev.shiftKey ? -1 : 1), act.c); }
      else if (k === 'Tab') { ev.preventDefault(); commit(); move(act.r, act.c + (ev.shiftKey ? -1 : 1)); }
      else if ((k === 'ArrowUp' || k === 'ArrowDown') && !editing.input.getAttribute('list')) { ev.preventDefault(); commit(); move(act.r + (k === 'ArrowUp' ? -1 : 1), act.c); }
    }

    /* ── clipboard ──────────────────────────────────────────────────────── */
    function copyText() {
      const { r0, r1, c0, c1 } = range(), out = [];
      for (let r = r0; r <= r1; r++) {
        const row = rowAt(r), line = [];
        for (let c = c0; c <= c1; c++) { const col = cols[c]; line.push(col.copyText ? col.copyText(value(row.id, col.key), row) : value(row.id, col.key)); }
        out.push(line);
      }
      return window.KiwiBulkRules.toTsv(out);
    }
    function pasteText(text) {
      const grid = window.KiwiBulkRules.parseTsv(text);
      if (!grid.length || !view.length) return { applied: 0, skipped: 0, cut: 0 };
      const { r0, r1, c0, c1 } = range();
      const changes = []; let skipped = 0, cut = 0;
      const single = grid.length === 1 && grid[0].length === 1;
      const h = single ? r1 - r0 + 1 : grid.length, w = single ? c1 - c0 + 1 : Math.max(...grid.map((l) => l.length));
      for (let i = 0; i < h; i++) {
        const r = r0 + i;
        if (r >= view.length) { cut++; continue; }
        const row = rowAt(r);
        for (let j = 0; j < w; j++) {
          const c = c0 + j; if (c >= cols.length) continue;
          const col = cols[c];
          const raw = single ? grid[0][0] : (grid[i][j] == null ? '' : grid[i][j]);
          if (readOnly(row, col)) { skipped++; continue; }
          changes.push({ id: row.id, key: col.key, value: o.parse(col, raw) });
        }
      }
      if (!single) { anchor = { r: r0, c: c0 }; act = { r: Math.min(view.length - 1, r0 + h - 1), c: Math.min(cols.length - 1, c0 + w - 1) }; }
      const applied = put(changes);
      return { applied, skipped, cut };
    }
    function onClip(ev) {
      if (!root.contains(document.activeElement) || editing) return;
      if (ev.type === 'copy' || ev.type === 'cut') {
        ev.preventDefault();
        ev.clipboardData.setData('text/plain', copyText());
        if (ev.type === 'cut') clear();
        if (o.onNotice) o.onNotice('copy', range());
      } else if (ev.type === 'paste') {
        ev.preventDefault();
        const res = pasteText(ev.clipboardData.getData('text/plain'));
        if (o.onNotice) o.onNotice('paste', res);
      }
    }
    ['copy', 'cut', 'paste'].forEach((t) => document.addEventListener(t, onClip));
    function clear() {
      const { r0, r1, c0, c1 } = range(), changes = [];
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const col = cols[c]; if (col.type === 'bool') continue;
        changes.push({ id: rowAt(r).id, key: col.key, value: o.parse(col, '') });
      }
      put(changes);
    }
    function fillDown() {
      const { r0, r1, c0, c1 } = range();
      if (r1 === r0) return 0;
      const changes = [];
      for (let c = c0; c <= c1; c++) {
        const v = value(rowAt(r0).id, cols[c].key);
        for (let r = r0 + 1; r <= r1; r++) changes.push({ id: rowAt(r).id, key: cols[c].key, value: v });
      }
      return put(changes);
    }
    function undo() {
      const last = undoStack.pop();
      if (!last) return false;
      put(last.slice().reverse().map((x) => ({ id: x.id, key: x.key, value: x.prev })), false);
      return true;
    }

    /* ── keyboard ───────────────────────────────────────────────────────── */
    root.addEventListener('keydown', (ev) => {
      if (editing || ev.target !== root) return;
      const k = ev.key, mod = mac() ? ev.metaKey : ev.ctrlKey;
      const rtl = getComputedStyle(root).direction === 'rtl';
      const page = Math.max(1, Math.floor((scroller.clientHeight - 38) / ROW_H));
      let handled = true;
      if (k === 'ArrowDown') move(mod ? view.length - 1 : act.r + 1, act.c, ev.shiftKey);
      else if (k === 'ArrowUp') move(mod ? 0 : act.r - 1, act.c, ev.shiftKey);
      else if (k === 'ArrowRight') move(act.r, mod ? (rtl ? 0 : cols.length - 1) : act.c + (rtl ? -1 : 1), ev.shiftKey);
      else if (k === 'ArrowLeft') move(act.r, mod ? (rtl ? cols.length - 1 : 0) : act.c + (rtl ? 1 : -1), ev.shiftKey);
      else if (k === 'PageDown') move(act.r + page, act.c, ev.shiftKey);
      else if (k === 'PageUp') move(act.r - page, act.c, ev.shiftKey);
      else if (k === 'Home') move(mod ? 0 : act.r, 0, ev.shiftKey);
      else if (k === 'End') move(mod ? view.length - 1 : act.r, cols.length - 1, ev.shiftKey);
      else if (k === 'Tab') move(act.r, act.c + (ev.shiftKey ? -1 : 1));
      else if (k === 'Enter' || k === 'F2') { if (k === 'Enter' && ev.shiftKey) move(act.r - 1, act.c); else begin(); }
      else if (k === ' ' && ev.shiftKey) { toggleRow(rowAt(act.r).id); }
      else if (k === ' ' && cols[act.c].type === 'bool') begin();
      else if (k === 'Escape') { if (anchor.r !== act.r || anchor.c !== act.c) move(act.r, act.c); else handled = false; }
      else if (k === 'Delete' || k === 'Backspace') clear();
      else if (mod && (k === 'z' || k === 'Z')) undo();
      else if (mod && (k === 'd' || k === 'D')) fillDown();
      else if (mod && (k === 'a' || k === 'A')) { anchor = { r: 0, c: 0 }; act = { r: view.length - 1, c: cols.length - 1 }; paint(); }
      else if (!mod && !ev.altKey && k.length === 1) begin(k);
      else handled = false;
      if (handled) { ev.preventDefault(); ev.stopPropagation(); }
    });

    /* ── mouse ──────────────────────────────────────────────────────────── */
    let dragging = false;
    function toggleRow(id) { if (checked.has(id)) checked.delete(id); else checked.add(id); paint(); if (o.onSelect) o.onSelect(checked.size); }
    body.addEventListener('mousedown', (ev) => {
      const sel = ev.target.closest('[data-sel]');
      if (sel) { ev.preventDefault(); toggleRow(rowAt(+sel.dataset.sel).id); root.focus({ preventScroll: true }); return; }
      const cell = ev.target.closest('[data-r]');
      if (!cell || ev.target.classList.contains('cbg-ed')) return;
      if (editing) commit();
      ev.preventDefault();
      root.focus({ preventScroll: true });
      const r = +cell.dataset.r, c = +cell.dataset.c;
      if (cols[c].type === 'bool' && ev.target.closest('.cbg-chip') && !ev.shiftKey) { act = anchor = { r, c }; begin(); return; }
      act = { r, c }; if (!ev.shiftKey) anchor = { r, c };
      dragging = true; paint();
    });
    body.addEventListener('mouseover', (ev) => {
      const cell = ev.target.closest('[data-r]');
      showTip(cell && cell.dataset.tip ? cell : null);
      if (!dragging || !cell) return;
      const r = +cell.dataset.r, c = +cell.dataset.c;
      if (r !== act.r || c !== act.c) { act = { r, c }; paint(); }
    });
    const stopDrag = () => { dragging = false; };
    document.addEventListener('mouseup', stopDrag);
    body.addEventListener('dblclick', (ev) => { if (ev.target.closest('[data-r]') && !editing) begin(); });
    allBox.addEventListener('click', () => {
      const all = view.every((i) => checked.has(rows[i].id));
      view.forEach((i) => { if (all) checked.delete(rows[i].id); else checked.add(rows[i].id); });
      paint(); if (o.onSelect) o.onSelect(checked.size);
    });
    let tip = null;
    function showTip(cell) {
      if (!cell) { if (tip) { tip.remove(); tip = null; } return; }
      if (!tip) { tip = document.createElement('div'); tip.className = 'cbg-tip'; tip.setAttribute('role', 'tooltip'); root.appendChild(tip); }
      tip.textContent = cell.dataset.tip;
      const a = cell.getBoundingClientRect(), b = root.getBoundingClientRect();
      tip.style.top = (a.bottom - b.top + 4) + 'px';
      tip.style.insetInlineStart = Math.max(0, (getComputedStyle(root).direction === 'rtl' ? b.right - a.right : a.left - b.left)) + 'px';
    }
    root.addEventListener('mouseleave', () => showTip(null));

    function sizeTo() {
      const top = scroller.getBoundingClientRect().top;
      const h = Math.max(320, Math.round(window.innerHeight - top - (o.bottomGap || 96)));
      root.style.setProperty('--cbg-h', h + 'px');
      render(false);
    }
    window.addEventListener('resize', sizeTo);
    requestAnimationFrame(sizeTo);
    paint();

    return {
      el: root,
      edits: () => edits,
      value,
      dirtyCount: () => Object.keys(edits).length,
      setValues: (changes) => put(changes),
      reset(next) {
        if (editing) commit(true);
        rows = next.slice(); byId = new Map(rows.map((r, i) => [r.id, i]));
        const keep = Object.create(null);
        Object.keys(edits).forEach((id) => { if (byId.has(id)) {
          const e = {}; Object.keys(edits[id]).forEach((k) => { if (!(o.same ? o.same(k, rows[byId.get(id)][k], edits[id][k]) : false)) e[k] = edits[id][k]; });
          if (Object.keys(e).length) keep[id] = e;
        } });
        edits = keep;
        [...checked].forEach((id) => { if (!byId.has(id)) checked.delete(id); });
        view = rows.map((_, i) => i); undoStack.length = 0;
        rendered.forEach((el) => el.remove()); rendered.clear();
        act = { r: Math.min(act.r, Math.max(0, view.length - 1)), c: act.c }; anchor = { ...act };
        paint(); if (o.onChange) o.onChange();
      },
      discard() { edits = Object.create(null); flags = Object.create(null); undoStack.length = 0; paint(); if (o.onChange) o.onChange(); },
      setFilter(ids) {
        if (editing) commit();
        view = ids ? ids.map((id) => byId.get(id)).filter((i) => i != null) : rows.map((_, i) => i);
        rendered.forEach((el) => el.remove()); rendered.clear();
        act = { r: Math.min(act.r, Math.max(0, view.length - 1)), c: act.c }; anchor = { ...act };
        scroller.scrollTop = 0; paint();
      },
      visibleIds: () => view.map((i) => rows[i].id),
      checked: () => [...checked],
      clearChecked() { checked.clear(); paint(); if (o.onSelect) o.onSelect(0); },
      rangeIds() { const { r0, r1 } = range(); const out = []; for (let r = r0; r <= r1 && r < view.length; r++) out.push(rowAt(r).id); return out; },
      setFlags(map) { flags = map || Object.create(null); paint(); },
      undo, fillDown, paint,
      canUndo: () => undoStack.length > 0,
      focus: () => root.focus({ preventScroll: true }),
      destroy() {
        ['copy', 'cut', 'paste'].forEach((t) => document.removeEventListener(t, onClip));
        document.removeEventListener('mouseup', stopDrag);
        window.removeEventListener('resize', sizeTo);
      },
    };
  }

  window.KiwiBulkGrid = { create, ROW_H };
})();
