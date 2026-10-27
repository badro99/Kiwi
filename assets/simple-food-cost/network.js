  /* ── question oui / non ─────────────────────────────────────────────────
     Plus de boîte native (window.confirm) : elle sortait de la langue du
     tableau de bord et de sa gestion du focus. Kiwi.modal (interactive.js)
     met le focus dans la fenêtre, le rend au bouton d'origine à la fermeture,
     et Échap, la croix ou le fond ferment sans rien faire. Le focus part sur
     Annuler : le choix sûr est celui par défaut. Sans Kiwi.modal, rien ne se
     passe (la saisie reste). */
  function ask(o, onYes) {
    const K = window.Kiwi;
    if (!K || typeof K.modal !== 'function') return false;
    const m = K.modal({
      title: o.title, width: 480,
      body: `<p style="margin:0;line-height:1.55;">${esc(o.body).replace(/\n/g, '<br>')}</p>`,
      foot: `<button type="button" class="kb ghost" data-sfc-ask="no" data-dismiss data-autofocus>${esc(tr('cancel'))}</button><button type="button" class="kb" data-sfc-ask="yes">${esc(o.yes)}</button>`,
    });
    const yes = m && m.el && m.el.querySelector('[data-sfc-ask="yes"]');
    if (yes) yes.addEventListener('click', () => { m.close(); onYes(); });
    return true;
  }

  /* ── réseau ──────────────────────────────────────────────────────────── */
  async function api(method, query, body) {
    const url = '/api/foodcost' + (query ? '?' + query : '');
    const res = await fetch(url, method === 'GET' ? { headers: { Accept: 'application/json' }, credentials: 'same-origin' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    return { status: res.status, data: data || {} };
  }
  async function load() {
    S.merchant = merchant();
    if (!S.merchant) { S.status = 'error'; paint(); return; }
    S.status = 'loading'; paint();
    try {
      const r = await api('GET', 'merchant=' + encodeURIComponent(S.merchant));
      if (r.status === 403) { S.status = 'forbidden'; }
      else if (r.status !== 200) { S.status = 'error'; }
      else { S.status = 'ready'; S.enabled = r.data.enabled === true; S.canEdit = r.data.canEdit === true; S.sheets = Array.isArray(r.data.sheets) ? r.data.sheets : []; }
    } catch (_) { S.status = online() ? 'error' : 'offline-empty'; }
    const restored = S.status === 'ready' && restoreDraft();
    paint();
    changed();
    /* Un enregistrement demandé hors ligne part dès que la connexion est là ;
       un 409 éventuel passe par l’écran de conflit, comme à la main. */
    if (restored && S.pendingSave && online()) save(false);
  }
  /* La Performance lit les estimations : elle se redessine quand elles bougent. */
  function changed() { try { window.dispatchEvent(new CustomEvent('kiwi:simple-food-cost')); } catch (_) {} }
  function replaceSheet(sheet) {
    const i = S.sheets.findIndex((x) => x.id === sheet.id);
    if (i < 0) S.sheets.unshift(sheet); else S.sheets[i] = sheet;
    changed();
  }
  /* Une estimation par plat, pour la Performance : seules les fiches (pas les
     modèles) non archivées et liées à un plat comptent, la plus récente
     l'emporte. null tant que les fiches ne sont pas lues : jamais un 0. */
  function estimates() {
    if (!available()) return null;
    if (S.merchant && S.merchant !== merchant()) { S.status = 'idle'; S.sheets = []; S.draft = null; S.openId = null; S.pendingSave = false; }
    if (S.status === 'idle') { S.status = 'loading'; setTimeout(load, 0); }
    if (S.status !== 'ready') return null;
    const out = {};
    S.sheets.filter((x) => x && !x.archived && x.kind !== 'template' && x.data && x.data.menuItemId)
      .sort((a, b) => (b.updatedTs || 0) - (a.updatedTs || 0))
      .forEach((x) => {
        const id = String(x.data.menuItemId);
        if (out[id]) return;
        const c = calc(x.data);
        out[id] = { sheetId: x.id, name: x.name || x.data.name || '', perPortion: c.perPortion, complete: c.complete, stale: c.stale.length > 0, status: c.status, pct: c.pct };
      });
    return out;
  }
  function openSheet(sheet) {
    S.openId = sheet ? sheet.id : null;
    S.draft = sheet ? JSON.parse(JSON.stringify(sheet.data)) : blankSheet();
    S.baseVersion = sheet ? sheet.version : 0;
    S.dirty = !sheet; S.pendingSave = false; S.conflict = null; S.history = null; S.snapshot = null; S.message = '';
    paint();
  }
  async function save(force) {
    if (!S.draft || S.saving) return;
    if (!String(S.draft.name || '').trim()) { S.message = tr('nameRequired'); S.messageKind = 'warn'; paint(); return; }
    if (!online()) { S.pendingSave = true; S.message = tr('offline'); S.messageKind = 'warn'; paint(); return; }
    S.pendingSave = false;
    S.saving = true; S.message = ''; paint();
    const base = force && S.conflict ? S.conflict.version : S.baseVersion;
    try {
      const r = await api('POST', '', { merchant: S.merchant, action: 'save', sheet: { ...S.draft, id: S.openId || '' }, baseVersion: base });
      if (r.status === 200 || r.status === 201) {
        replaceSheet(r.data.sheet); S.openId = r.data.sheet.id; S.baseVersion = r.data.sheet.version; S.dirty = false; S.conflict = null;
        S.message = tr('saved', { v: r.data.sheet.version }); S.messageKind = 'ok';
        if (S.history) loadHistory();
      } else if (r.status === 409 && r.data.sheet) {
        S.conflict = r.data.sheet; S.message = ''; replaceSheet(r.data.sheet);
      } else if (r.status === 403 && r.data.error === 'disabled') {
        S.enabled = false; S.canEdit = false; S.message = tr('disabledError'); S.messageKind = 'warn';
      } else { S.message = tr('saveError'); S.messageKind = 'warn'; }
    } catch (_) { S.message = tr('saveError'); S.messageKind = 'warn'; }
    S.saving = false; paint();
  }
  async function action(body) {
    if (!online()) { S.message = tr('offline'); S.messageKind = 'warn'; paint(); return null; }
    try {
      const r = await api('POST', '', { merchant: S.merchant, ...body });
      if (r.status === 200 || r.status === 201) { replaceSheet(r.data.sheet); return r.data.sheet; }
      if (r.status === 409 && r.data.sheet) { S.conflict = r.data.sheet; replaceSheet(r.data.sheet); paint(); return null; }
      S.message = r.data.error === 'disabled' ? tr('disabledError') : tr('saveError'); S.messageKind = 'warn'; paint(); return null;
    } catch (_) { S.message = tr('saveError'); S.messageKind = 'warn'; paint(); return null; }
  }
  async function loadHistory() {
    if (!S.openId) return;
    S.historyError = false; S.snapshotError = null;
    try {
      const r = await api('GET', 'merchant=' + encodeURIComponent(S.merchant) + '&id=' + encodeURIComponent(S.openId));
      if (r.status !== 200 || !Array.isArray(r.data.history)) throw new Error('history-read');
      S.history = r.data.history;
    } catch (_) { S.history = []; S.historyError = true; }
    paint();
  }
  async function loadSnapshot(v) {
    S.snapshot = null; S.snapshotError = null;
    try {
      const r = await api('GET', 'merchant=' + encodeURIComponent(S.merchant) + '&id=' + encodeURIComponent(S.openId) + '&version=' + v);
      if (r.status !== 200 || !r.data.snapshot) throw new Error('snapshot-read');
      S.snapshot = r.data.snapshot;
    } catch (_) { S.snapshotError = v; }
    paint();
  }

