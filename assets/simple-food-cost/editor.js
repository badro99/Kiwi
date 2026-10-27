  /* ── rendu ───────────────────────────────────────────────────────────── */
  const statusLabel = (st) => tr({ ok: 'stOk', incomplete: 'stIncomplete', stale: 'stStale', empty: 'stEmpty' }[st] || 'stEmpty');
  const visibleSheets = () => S.sheets.filter((s) => S.showArchived || !s.archived);
  function banner() {
    const out = [];
    if (!online()) out.push(`<p class="sfc-note warn" data-sfc-state="offline">${esc(tr('offline'))}</p>`);
    if (S.status === 'ready' && !S.enabled) out.push(`<p class="sfc-note warn" data-sfc-state="readonly">${esc(tr('readOnly'))}</p>`);
    return out.join('');
  }
  function head() {
    return `<div class="sfc-head"><div><div class="mi-title">${esc(tr('title'))}</div><div class="mi-sub">${esc(tr('sub'))}</div></div></div>`;
  }
  function listView() {
    const toolbar = `<div class="sfc-toolbar">${editable() ? `<button type="button" class="sfc-btn primary" data-sfc="new">${esc(tr('newSheet'))}</button>` : ''}<button data-activation=money type="button" class="sfc-btn" data-sfc="export-all"${S.sheets.length ? '' : ' disabled'}>${esc(tr('exportAll'))}</button>${S.sheets.some((s) => s.archived) ? `<button type="button" class="sfc-btn ghost" data-sfc="toggle-archived">${esc(tr(S.showArchived ? 'hideArchived' : 'showArchived'))}</button>` : ''}</div>`;
    const list = visibleSheets();
    if (!list.length) return toolbar + `<div class="rmw-empty" data-sfc-state="empty"><h3>${esc(tr('empty'))}</h3><p>${esc(tr('emptyDesc'))}</p></div>`;
    const row = (s) => {
      const c = calc(s.data);
      const portion = c.perPortion != null ? money(c.perPortion) : c.lines.length ? `<span class="sfc-unknown">${esc(tr('atLeast', { amount: money(c.knownPerPortion) }))}</span>` : '·';
      return `<tr data-sfc-row="${esc(s.id)}"><td><b>${esc(s.name)}</b>${s.archived ? `<small>${esc(tr('archived'))}</small>` : ''}</td><td>${portion}</td><td>${pct(c.pct)}</td><td><span class="sfc-st ${c.status}">${esc(statusLabel(c.status))}</span></td><td><small>${esc(when(s.updatedTs))}<br>${esc(s.updatedBy || '')}</small></td><td>${s.kind === 'template' && editable() ? `<button type="button" class="sfc-btn" data-sfc="use-template" data-id="${esc(s.id)}">${esc(tr('useTemplate'))}</button> ` : ''}<button type="button" class="sfc-btn" data-sfc="open" data-id="${esc(s.id)}">${esc(tr('open'))}</button></td></tr>`;
    };
    const table = (rows, heading) => `<div class="mi-list-wrap" tabindex="0" role="region" aria-label="${esc(tr(heading))}"><table class="mi-list sfc-table"><thead><tr><th>${esc(tr('colName'))}</th><th>${esc(tr('colPortion'))}</th><th>${esc(tr('colPct'))}</th><th>${esc(tr('colStatus'))}</th><th>${esc(tr('colUpdated'))}</th><th></th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table></div>`;
    const sheets = list.filter((s) => s.kind !== 'template'), tpls = list.filter((s) => s.kind === 'template');
    return toolbar + (sheets.length ? `<h3 class="sfc-h3">${esc(tr('sheets'))}</h3>${table(sheets, 'sheets')}` : '') + (tpls.length ? `<h3 class="sfc-h3">${esc(tr('templates'))}</h3>${table(tpls, 'templates')}` : '');
  }
  function unitOptions(selected) {
    const list = units() ? units().list() : [{ id: 'g' }, { id: 'kg' }, { id: 'ml' }, { id: 'L' }, { id: 'unité' }];
    const sel = selected || '';
    return `<option value=""${sel ? '' : ' selected'}>·</option>` + list.map((u) => `<option value="${esc(u.id)}"${u.id === sel ? ' selected' : ''}>${esc(u.id)}</option>`).join('');
  }
  const inp = (field, value, attrs) => `<input data-sfc-field="${field}" value="${esc(value == null ? '' : value)}"${attrs || ''}${editable() ? '' : ' disabled'}>`;
  /* Les champs d'une ligne n'avaient pour nom que l'en-tête de leur colonne,
     que le lecteur d'écran ne relie pas au champ (et que le téléphone masque) :
     des « Prix du lot » indiscernables d'une ligne à l'autre. Chacun porte
     désormais l'ingrédient ET le champ, « Poulet · Prix du lot », dans la
     langue de l'écran (axe, 23 octobre). */
  const lineWho = (l, i) => String((l && l.name) || '').trim() || tr('lineN', { n: i + 1 });
  const lineLabel = (l, i, key) => (key === 'lName' ? `${tr('lName')} · ${lineWho(l, i)}` : `${lineWho(l, i)} · ${tr(key)}`);
  const named = (l, i, key) => ` data-sfc-label="${key}" aria-label="${esc(lineLabel(l, i, key))}"`;
  function relabelLine(row, l, i) {
    row.querySelectorAll('[data-sfc-label]').forEach((el) => el.setAttribute('aria-label', lineLabel(l, i, el.getAttribute('data-sfc-label'))));
  }
  const numIn = (field, value, extra) => inp(field, value, ` type="number" inputmode="decimal" step="any" min="0"${extra || ''}`);
  function lineCostCell(r) {
    if (r.cost != null) return `${money(r.cost)}${r.stale ? `<small class="warn">${esc(tr('oldPrice', { days: r.age }))}</small>` : r.undated ? `<small>${esc(tr('undated'))}</small>` : ''}`;
    return `<span class="sfc-unknown">${esc(tr('unknown'))}</span><small>${esc(tr({ price: 'rPrice', packQty: 'rPackQty', useQty: 'rUseQty', unit: 'rUnit', yield: 'rYield' }[r.reason] || 'rPrice'))}</small>`;
  }
  function summary(c, d) {
    const notes = [];
    if (c.unknown.length) notes.push(`<p class="warn">${esc(tr('incompleteNote', { n: c.unknown.length, names: c.unknown.map((r) => r.name || '·').join(', ') }))}</p>`);
    if (c.stale.length) notes.push(`<p class="warn">${esc(tr('staleNote', { n: c.stale.length }))}</p>`);
    if (c.price == null) notes.push(`<p>${esc(tr('noPrice'))}</p>`);
    else if (c.vatOn) notes.push(`<p>${esc(tr('vatNote', { rate: c.vatRate }))}</p>`);
    const cellv = (label, v, cls) => `<div${cls ? ` class="${cls}"` : ''}><span>${esc(label)}</span><b>${v}</b></div>`;
    const portion = c.perPortion != null ? money(c.perPortion) : `<span class="sfc-unknown">${esc(c.lines.length ? tr('atLeast', { amount: money(c.knownPerPortion) }) : tr('unknown'))}</span>`;
    return `<div class="sfc-summary" data-sfc-summary data-sfc-status="${c.status}">${cellv(tr('sumFood'), money(c.food))}${cellv(tr('sumPack'), money(c.packaging))}${cellv(tr('sumTotal'), c.total != null ? money(c.total) : `<span class="sfc-unknown">${esc(tr('atLeast', { amount: money(c.known) }))}</span>`)}${cellv(tr('sumPortion'), portion, 'hl')}${cellv(tr('sumPriceHT'), money(c.priceHT))}${cellv(tr('sumPct'), pct(c.pct), 'hl')}${cellv(tr('sumContribution'), money(c.contribution))}${cellv(tr('sumSuggested'), c.target ? money(c.suggested) : '·')}</div>${notes.length ? `<div class="rmw-perf-notes sfc-notes">${notes.join('')}</div>` : ''}`;
  }
  function editorView() {
    const d = S.draft, c = calc(d), sheet = S.sheets.find((s) => s.id === S.openId) || null;
    const items = menuItems(), it = d.menuItemId ? menuItem(d.menuItemId) : null;
    const priceHint = it && isNum(it.price) && +it.price !== +d.sellingPrice ? `<small class="sfc-hint">${esc(tr('menuPriceNow', { amount: money(it.price) }))} ${editable() ? `<button type="button" class="sfc-link" data-sfc="use-menu-price">${esc(tr('usePrice'))}</button>` : ''}</small>` : '';
    const conflict = S.conflict ? `<div class="sfc-note warn" data-sfc-state="conflict"><p>${esc(tr('conflict', { who: S.conflict.updatedBy || '·', when: when(S.conflict.updatedTs) }))}</p><button type="button" class="sfc-btn" data-sfc="take-server">${esc(tr('reloadServer'))}</button> <button type="button" class="sfc-btn" data-sfc="keep-mine">${esc(tr('keepMine'))}</button></div>` : '';
    const msg = S.message ? `<p class="sfc-note ${S.messageKind === 'ok' ? 'ok' : 'warn'}" role="status">${esc(S.message)}</p>` : '';
    const lines = (d.lines || []).map((l, i) => `<tr data-sfc-line="${i}"><td>${inp('name', l.name, ` maxlength="120"${named(l, i, 'lName')}`)}</td><td data-sfc-linecost="${i}">${lineCostCell(c.lines[i])}</td><td><select data-sfc-field="type"${named(l, i, 'lType')}${editable() ? '' : ' disabled'}><option value="food"${l.type !== 'packaging' ? ' selected' : ''}>${esc(tr('food'))}</option><option value="packaging"${l.type === 'packaging' ? ' selected' : ''}>${esc(tr('packaging'))}</option></select></td><td>${numIn('packPrice', l.packPrice, named(l, i, 'lPackPrice'))}</td><td>${numIn('packQty', l.packQty, named(l, i, 'lPackQty'))}</td><td><select data-sfc-field="packUnit"${named(l, i, 'lPackUnit')}${editable() ? '' : ' disabled'}>${unitOptions(l.packUnit)}</select></td><td>${numIn('useQty', l.useQty, named(l, i, 'lUseQty'))}</td><td><select data-sfc-field="useUnit"${named(l, i, 'lUseUnit')}${editable() ? '' : ' disabled'}>${unitOptions(l.useUnit || l.packUnit)}</select></td><td>${numIn('yieldPct', l.yieldPct == null ? 100 : l.yieldPct, ' max="100"' + named(l, i, 'lYield'))}</td><td>${inp('priceDate', l.priceDate, ' type="date"' + named(l, i, 'lDate'))}</td><td>${editable() ? `<button type="button" class="sfc-btn ghost" data-sfc="remove-line" data-i="${i}" data-sfc-label="remove" aria-label="${esc(lineLabel(l, i, 'remove'))}">${esc(tr('remove'))}</button>` : ''}</td></tr>`).join('');
    const lbl = ['lName', 'lCost', 'lType', 'lPackPrice', 'lPackQty', 'lPackUnit', 'lUseQty', 'lUseUnit', 'lYield', 'lDate'].map((k, i) => `--l${i + 1}:${JSON.stringify(tr(k))}`).join(';');
    const history = S.history ? `<div class="sfc-history" data-sfc-history><div class="sfc-history-h"><b>${esc(tr('historyTitle'))}</b><button type="button" class="sfc-btn ghost" data-sfc="close-history">${esc(tr('close'))}</button></div>${S.historyError || S.snapshotError != null ? `<div role="alert">${esc(tr('readError'))}<button type="button" data-sfc="${S.historyError ? 'history' : 'view-version'}" data-v="${S.snapshotError || ''}">${esc(tr('retryRead'))}</button></div>` : ''}${S.history.map((h) => `<div class="sfc-hrow"><span>${esc(tr('version', { v: h.version }))} · ${esc(when(h.ts))} · ${esc(h.actor || '')}</span><button type="button" class="sfc-btn ghost" data-sfc="view-version" data-v="${h.version}">${esc(tr('view'))}</button></div>`).join('')}${S.snapshot ? snapshotView(S.snapshot) : ''}</div>` : '';
    const actions = `<div class="sfc-actions">${editable() ? `<button data-activation=write type="button" class="sfc-btn primary" data-sfc="save"${S.saving ? ' disabled' : ''}>${esc(tr(S.saving ? 'saving' : 'save'))}</button>` : ''}${sheet && editable() ? `<button type="button" class="sfc-btn" data-sfc="duplicate">${esc(tr('duplicate'))}</button><button data-activation=write type="button" class="sfc-btn" data-sfc="save-template">${esc(tr('saveTemplate'))}</button><button type="button" class="sfc-btn" data-sfc="archive">${esc(tr(sheet.archived ? 'unarchive' : 'archive'))}</button>` : ''}${d.kind !== 'template' && it && recipeBridge() ? `<button type="button" class="sfc-btn" data-sfc="to-recipe">${esc(tr('toRecipe'))}</button>` : ''}${sheet ? `<button type="button" class="sfc-btn" data-sfc="history">${esc(tr('history'))}</button>` : ''}<button data-activation=money type="button" class="sfc-btn" data-sfc="export-sheet">${esc(tr('exportSheet'))}</button></div>`;
    return `<div class="sfc-toolbar"><button type="button" class="sfc-btn ghost" data-sfc="back">${esc(tr('back'))}</button>${d.kind === 'template' ? `<span class="sfc-st tpl">${esc(tr('kindTemplate'))}</span>` : ''}${sheet ? `<small class="sfc-hint">${esc(tr('version', { v: sheet.version }))} · ${esc(when(sheet.updatedTs))} · ${esc(sheet.updatedBy || '')}</small>` : ''}</div>${conflict}${msg}
      <div class="sfc-form">
        <label class="wide"><span>${esc(tr('name'))}</span>${inp('sheet.name', d.name, ' maxlength="120"')}</label>
        <label><span>${esc(tr('menuItem'))}</span><select data-sfc-field="sheet.menuItemId"${editable() ? '' : ' disabled'}><option value="">${esc(tr('none'))}</option>${items.map((x) => `<option value="${esc(x.id)}"${String(x.id) === String(d.menuItemId) ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}${d.menuItemId && !it ? `<option value="${esc(d.menuItemId)}" selected>${esc(d.menuItemName || d.menuItemId)}</option>` : ''}</select></label>
        <label><span>${esc(tr('sellingPrice'))}</span>${numIn('sheet.sellingPrice', d.sellingPrice)}${priceHint}</label>
        <label class="check"><input type="checkbox" data-sfc-field="sheet.vatIncluded"${d.vatIncluded ? ' checked' : ''}${editable() ? '' : ' disabled'}><span>${esc(tr('vatIncluded'))}</span></label>
        <label><span>${esc(tr('vatRate'))}</span>${numIn('sheet.vatRate', d.vatRate, ' max="100"')}</label>
        <label><span>${esc(tr('portions'))}</span>${numIn('sheet.portions', d.portions, ' min="1" step="1"')}</label>
        <label><span>${esc(tr('target'))}</span>${numIn('sheet.targetPct', d.targetPct, ' max="100"')}</label>
        <label class="wide"><span>${esc(tr('note'))}</span>${inp('sheet.note', d.note, ' maxlength="1000"')}</label>
      </div>
      <h3 class="sfc-h3">${esc(tr('lines'))}</h3>
      <div class="mi-list-wrap" tabindex="0" role="region" aria-label="${esc(tr('lines'))}"><table class="mi-list sfc-lines" style="${esc(lbl)}"><thead><tr><th>${esc(tr('lName'))}</th><th>${esc(tr('lCost'))}</th><th>${esc(tr('lType'))}</th><th>${esc(tr('lPackPrice'))}</th><th>${esc(tr('lPackQty'))}</th><th>${esc(tr('lPackUnit'))}</th><th>${esc(tr('lUseQty'))}</th><th>${esc(tr('lUseUnit'))}</th><th>${esc(tr('lYield'))}</th><th>${esc(tr('lDate'))}</th><th></th></tr></thead><tbody>${lines}</tbody></table></div>
      ${editable() ? `<div class="sfc-toolbar"><button data-activation=write type="button" class="sfc-btn" data-sfc="add-food">${esc(tr('addFood'))}</button><button data-activation=write type="button" class="sfc-btn" data-sfc="add-pack">${esc(tr('addPack'))}</button></div>` : ''}
      <div data-sfc-summary-host>${summary(c, d)}</div>
      ${actions}${history}`;
  }
  function snapshotView(snap) {
    const c = calc(snap.data || {});
    return `<div class="sfc-snapshot" data-sfc-snapshot="${snap.version}"><p><b>${esc(tr('snapshotOf', { v: snap.version, when: when(snap.ts), who: snap.actor || '' }))}</b> · ${esc(tr('frozen'))}</p>${summary(c, snap.data || {})}</div>`;
  }
  function inner() {
    if (S.status === 'idle' || S.status === 'loading') return head() + `<div class="rmw-empty" data-sfc-state="loading"><p>${esc(tr('loading'))}</p></div>`;
    if (S.status === 'forbidden') return head() + `<div class="rmw-empty" data-sfc-state="forbidden"><h3>${esc(tr('forbidden'))}</h3></div>`;
    if (S.status === 'error' || S.status === 'offline-empty') return head() + banner() + `<div class="rmw-empty" data-sfc-state="error"><h3>${esc(tr('loadError'))}</h3><button type="button" class="sfc-btn" data-sfc="retry">${esc(tr('retry'))}</button></div>`;
    return head() + banner() + (S.draft ? editorView() : listView());
  }
  function paint() {
    style();
    rememberDraft();
    const root = document.querySelector('[data-sfc-root]');
    if (root) root.innerHTML = inner();
  }
  function panel() {
    style();
    if (S.status === 'idle' || (S.merchant && S.merchant !== merchant())) {
      S.status = 'idle'; S.sheets = []; S.draft = null; S.openId = null; S.pendingSave = false;
      setTimeout(load, 0);
    }
    return `<div class="rmw-analysis-panel"><section class="mi-section sfc" data-sfc-root>${inner()}</section></div>`;
  }

  /* Pendant la saisie, seuls le coût de la ligne et le résumé se redessinent :
     le champ en cours garde le focus et le curseur. */
  function repaintFigures() {
    const root = document.querySelector('[data-sfc-root]');
    rememberDraft();
    if (!root || !S.draft) return;
    const c = calc(S.draft);
    c.lines.forEach((r, i) => { const cellEl = root.querySelector(`[data-sfc-linecost="${i}"]`); if (cellEl) cellEl.innerHTML = lineCostCell(r); });
    const host = root.querySelector('[data-sfc-summary-host]');
    if (host) host.innerHTML = summary(c, S.draft);
  }
  function readValue(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number') return el.value === '' ? null : Number(el.value);
    return el.value;
  }
  function onInput(e) {
    const el = e.target && e.target.closest && e.target.closest('[data-sfc-field]');
    if (!el || !S.draft || !el.closest('[data-sfc-root]')) return;
    const field = el.getAttribute('data-sfc-field'), v = readValue(el);
    if (field.indexOf('sheet.') === 0) {
      const k = field.slice(6);
      S.draft[k] = v;
      if (k === 'menuItemId') {
        const it = menuItem(v);
        S.draft.menuItemName = it ? String(it.name || '') : '';
        if (it && isNum(it.price) && !isNum(S.draft.sellingPrice)) S.draft.sellingPrice = +it.price;
        S.dirty = true; paint(); return;
      }
    } else {
      const row = el.closest('[data-sfc-line]');
      const line = row && S.draft.lines[+row.getAttribute('data-sfc-line')];
      if (!line) return;
      line[field] = v;
      if (field === 'packUnit' && !line.useUnit) line.useUnit = v;
      /* le nom tapé passe dans le nom de chaque champ de la ligne, sans redessiner */
      if (field === 'name' && row.querySelectorAll) relabelLine(row, line, +row.getAttribute('data-sfc-line'));
    }
    S.dirty = true;
    repaintFigures();
  }
  /* Quitter une fiche modifiée : la question passe par ask() ; sans
     modification, on part tout de suite. */
  function leaveThen(run) {
    if (!S.dirty) return run();
    ask({ title: tr('leaveTitle'), body: tr('unsaved'), yes: tr('leaveYes') }, run);
  }
  async function onClick(e) {
    const b = e.target && e.target.closest && e.target.closest('[data-sfc]');
    if (!b || !b.closest('[data-sfc-root]')) return;
    const act = b.getAttribute('data-sfc');
    const sheet = S.sheets.find((s) => s.id === (b.getAttribute('data-id') || S.openId));
    if (act === 'retry') return load();
    if (act === 'new') return openSheet(null);
    if (act === 'open') return openSheet(sheet);
    if (act === 'use-template' && sheet) {
      const d = JSON.parse(JSON.stringify(sheet.data));
      S.openId = null; S.draft = { ...d, kind: 'sheet', name: tr('copyName', { name: sheet.name }) }; S.baseVersion = 0; S.dirty = true; S.pendingSave = false; S.history = null; S.conflict = null; S.message = '';
      return paint();
    }
    if (act === 'toggle-archived') { S.showArchived = !S.showArchived; return paint(); }
    if (act === 'export-all') return exportAll();
    if (act === 'export-sheet') return exportSheet();
    if (act === 'back') return leaveThen(() => { forgetDraft(); S.pendingSave = false; S.draft = null; S.openId = null; S.dirty = false; S.history = null; S.message = ''; S.conflict = null; paint(); });
    if (!S.draft) return;
    if (act === 'add-food' || act === 'add-pack') {
      S.draft.lines = S.draft.lines || [];
      S.draft.lines.push({ id: lineId(), name: '', type: act === 'add-pack' ? 'packaging' : 'food', packPrice: null, packQty: 1, packUnit: act === 'add-pack' ? 'unité' : 'kg', useQty: null, useUnit: act === 'add-pack' ? 'unité' : 'g', yieldPct: 100, priceDate: today() });
      S.dirty = true; return paint();
    }
    if (act === 'remove-line') { S.draft.lines.splice(+b.getAttribute('data-i'), 1); S.dirty = true; return paint(); }
    if (act === 'use-menu-price') { const it = menuItem(S.draft.menuItemId); if (it) { S.draft.sellingPrice = +it.price; S.dirty = true; paint(); } return; }
    if (act === 'to-recipe') return toRecipe();
    if (act === 'save') return save(false);
    if (act === 'keep-mine') return save(true);
    if (act === 'take-server' && S.conflict) { const srv = S.conflict; S.conflict = null; return openSheet(srv); }
    if (act === 'duplicate' && sheet) return leaveThen(async () => { const copy = await action({ action: 'duplicate', id: sheet.id, kind: 'sheet', name: tr('copyName', { name: sheet.name }) }); if (copy) openSheet(copy); });
    if (act === 'save-template' && sheet) { const copy = await action({ action: 'duplicate', id: sheet.id, kind: 'template', name: tr('templateName', { name: sheet.name }) }); if (copy) { S.message = tr('saved', { v: copy.version }); S.messageKind = 'ok'; paint(); } return; }
    if (act === 'archive' && sheet) return leaveThen(async () => { const upd = await action({ action: 'archive', id: sheet.id, archived: !sheet.archived, baseVersion: sheet.version }); if (upd) openSheet(upd); });
    if (act === 'history') return loadHistory();
    if (act === 'close-history') { S.history = null; S.snapshot = null; return paint(); }
    if (act === 'view-version') return loadSnapshot(+b.getAttribute('data-v'));
  }
  let bound = false;
  function bind() {
    if (bound) return; bound = true;
    document.addEventListener('input', onInput);
    document.addEventListener('change', onInput);
    document.addEventListener('click', onClick);
    window.addEventListener('online', () => {
      if (S.pendingSave && S.dirty && S.draft && editable()) { save(false); return; }
      if (document.querySelector('[data-sfc-root]')) paint();
    });
    window.addEventListener('offline', () => { if (document.querySelector('[data-sfc-root]')) paint(); });
    window.addEventListener('kiwi:langchange', () => { if (document.querySelector('[data-sfc-root]')) paint(); });
    /* L'option arrive avec /api/config : l'onglet apparaît sans recharger. */
    document.addEventListener('kiwi-config', () => { try { if (window.KiwiFinance && window.KiwiFinance.isActive && window.KiwiFinance.isActive()) window.KiwiFinance.render(); } catch (_) {} });
    window.addEventListener('beforeunload', (e) => { if (S.dirty && S.draft) { e.preventDefault(); e.returnValue = ''; } });
  }

  function style() {
    if (document.getElementById('sfc-css')) return;
    const s = document.createElement('style');
    s.id = 'sfc-css';
    s.textContent = `
.sfc-head{margin-bottom:14px}
.sfc-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0}
.sfc-btn{font:inherit;font-size:13px;padding:8px 13px;border-radius:999px;border:1px solid var(--n-200);background:var(--surface);color:var(--ink);cursor:pointer;transition:background-color .17s,border-color .17s}
.sfc-btn:hover{border-color:var(--n-400,#9aa29e)}
.sfc-btn.primary{background:var(--atlas);border-color:var(--atlas);color:var(--paper)}
.sfc-btn.ghost{background:transparent}
.sfc-btn[disabled]{opacity:.5;cursor:default}
.sfc-link{font:inherit;background:none;border:0;padding:0;color:var(--atlas);text-decoration:underline;cursor:pointer}
.sfc-h3{font-size:14px;font-weight:600;margin:18px 0 6px}
.sfc-note{margin:10px 0;padding:10px 13px;border-radius:11px;border:1px solid var(--n-200);background:var(--paper-soft);font-size:13px}
.sfc-note.warn{border-color:color-mix(in srgb,var(--atlas) 35%,var(--n-200))}
.sfc-note.ok{border-color:var(--atlas)}
.sfc-unknown{color:var(--n-500)}
.sfc-hint{display:block;margin-top:4px;color:var(--n-500);font-size:12px}
.sfc-st{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;border:1px solid var(--n-200);background:var(--paper-soft)}
.sfc-st.ok{border-color:var(--atlas);color:var(--atlas)}
.sfc-st.incomplete,.sfc-st.stale{color:var(--n-600)}
.sfc-table td small,.sfc-lines td small{display:block;margin-top:3px;color:var(--n-500);font-size:11px}
.sfc-table td:last-child{text-align:end;white-space:nowrap}
.sfc-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.sfc-form label{display:grid;gap:5px;font-size:12px;color:var(--n-600)}
.sfc-form label.wide{grid-column:1/-1}
.sfc-form label.check{display:flex;align-items:center;gap:8px;align-self:end}
.sfc input,.sfc select{font:inherit;font-size:13px;color:var(--ink);background:var(--surface);border:1px solid var(--n-200);border-radius:9px;padding:7px 9px;min-width:0;width:100%;box-sizing:border-box}
.sfc input[type=checkbox]{width:auto}
.sfc input:disabled,.sfc select:disabled{opacity:.7}
.sfc-lines td{vertical-align:top}
/* Le select natif caché est en position absolue : sans bloc conteneur ici il
   échappe au défilement du tableau et élargit toute la page sur tablette. */
.sfc .mi-list-wrap{position:relative}
.sfc-lines{min-width:1120px}
.sfc-lines td:nth-child(1){min-width:150px}
.sfc-lines td:nth-child(2){min-width:104px;white-space:nowrap}
.sfc-lines td:nth-child(3){min-width:130px}
.sfc-lines td:nth-child(6),.sfc-lines td:nth-child(8){min-width:96px}
.sfc-lines td:nth-child(10){min-width:140px}
.sfc-lines .kiwi-select{min-width:100%}
.sfc-lines td:nth-child(n+4):nth-child(-n+9) input{max-width:110px}
.sfc-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0 8px}
.sfc-summary>div{display:grid;gap:6px;padding:14px 15px;background:var(--surface);border:1px solid var(--n-200);border-radius:13px}
.sfc-summary>div.hl{border-color:var(--atlas)}
.sfc-summary span{font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--n-500)}
.sfc-summary b{font-size:19px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.sfc-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.sfc-history{margin-top:16px;padding:14px;border:1px solid var(--n-200);border-radius:13px;background:var(--paper-soft)}
.sfc-history-h,.sfc-hrow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0}
.sfc-hrow{border-top:1px solid var(--n-200);font-size:13px}
.sfc-snapshot{margin-top:12px}
@media (max-width:900px){.sfc-summary{grid-template-columns:1fr 1fr}.sfc-form{grid-template-columns:1fr 1fr}}
@media (max-width:720px){.sfc-form{grid-template-columns:1fr}
.sfc-lines thead,.sfc-table thead{display:none}
.sfc-lines,.sfc-lines tbody,.sfc-table,.sfc-table tbody{display:block}
.sfc-lines tr,.sfc-table tr{display:grid;grid-template-columns:1fr 1fr;gap:8px 10px;padding:12px 0;border-bottom:1px solid var(--n-200)}
.sfc-lines td,.sfc-table td{display:block;padding:0}
.sfc-lines td:first-child,.sfc-table td:first-child{grid-column:1/-1}
.sfc-lines td:nth-child(2)::before{content:var(--l2)}.sfc-lines td:nth-child(3)::before{content:var(--l3)}.sfc-lines td:nth-child(4)::before{content:var(--l4)}.sfc-lines td:nth-child(5)::before{content:var(--l5)}.sfc-lines td:nth-child(6)::before{content:var(--l6)}.sfc-lines td:nth-child(7)::before{content:var(--l7)}.sfc-lines td:nth-child(8)::before{content:var(--l8)}.sfc-lines td:nth-child(9)::before{content:var(--l9)}.sfc-lines td:nth-child(10)::before{content:var(--l10)}
.sfc-lines td::before{display:block;font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--n-500);margin-bottom:3px}
.sfc-lines td:nth-child(n+4):nth-child(-n+9) input{max-width:none}
.sfc-lines{min-width:0}.sfc-lines td{min-width:0!important}
.sfc-table td:last-child{text-align:start}}
`;
    document.head.appendChild(s);
  }

  bind();
  window.KiwiSimpleFoodCost = { available, panel, compute, estimates, recipeSeed, tabLabel: () => tr('tab'), _state: S, _toRecipe: toRecipe, _exportRows: sheetRows };
}());
