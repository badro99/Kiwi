  /* ── état ────────────────────────────────────────────────────────────── */
  const S = {
    status: 'idle', enabled: false, canEdit: false, sheets: [], merchant: '', showArchived: false,
    openId: null, draft: null, baseVersion: 0, dirty: false, saving: false, message: '', messageKind: '',
    conflict: null, history: null, snapshot: null, pendingSave: false,
  };
  const units = () => window.KiwiRestaurantUnits;
  const convert = (q, a, b) => { try { return units() ? units().convert(q, a, b) : (a === b ? q : null); } catch (_) { return null; } };
  const today = () => { try { const DR = window.KiwiDayReport; if (DR && DR.today) return DR.today(); } catch (_) {} return new Date().toISOString().slice(0, 10); };
  const calc = (sheet) => compute(sheet, { convert, today: today() });
  function merchant() {
    try { return (window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug && window.KiwiCloudDoc.currentSlug()) || (window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && (window.KiwiVenue.getCurrentVenueData() || {}).slug) || ''; } catch (_) { return ''; }
  }
  const online = () => { try { return navigator.onLine !== false; } catch (_) { return true; } };
  /* La saisie non enregistrée survit au rechargement. Hors ligne, « l’enregistrement
     attendra la connexion » doit être vrai : sans copie locale, un rechargement
     effaçait le calcul en silence. Une clé par compte (kiwiAccountKey) ET par
     magasin, sous le préfixe `kiwi:` que tenant-purge.js efface au changement de
     commerçant : la fiche d’un magasin ne réapparaît jamais dans un autre. */
  function draftKey() {
    if (!S.merchant) return '';
    let acct = '';
    try { acct = String(localStorage.getItem('kiwiAccountKey') || '').trim().toLowerCase(); } catch (_) { acct = ''; }
    return 'kiwi:sfcDraft:' + acct + '@' + S.merchant;
  }
  function rememberDraft() {
    const k = draftKey();
    if (!k || !S.draft) return;
    try {
      if (S.dirty) localStorage.setItem(k, JSON.stringify({ openId: S.openId, baseVersion: S.baseVersion, draft: S.draft, pendingSave: !!S.pendingSave, at: Date.now() }));
      else localStorage.removeItem(k);
    } catch (_) {}
  }
  function forgetDraft() { const k = draftKey(); if (k) { try { localStorage.removeItem(k); } catch (_) {} } }
  function restoreDraft() {
    const k = draftKey();
    if (!k || S.draft || !editable()) return false;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { saved = null; }
    if (!saved || !saved.draft || typeof saved.draft !== 'object' || !Array.isArray(saved.draft.lines)) return false;
    S.openId = saved.openId || null; S.draft = saved.draft; S.baseVersion = +saved.baseVersion || 0;
    S.dirty = true; S.pendingSave = !!saved.pendingSave; S.conflict = null; S.history = null; S.snapshot = null;
    S.message = tr('restored'); S.messageKind = 'warn';
    return true;
  }
  function available() {
    try {
      if (window.KiwiEnv && window.KiwiEnv.isReal && !window.KiwiEnv.isReal()) return false;
      return !!(window.KiwiConfig && window.KiwiConfig.features && window.KiwiConfig.features.simple_food_cost === true);
    } catch (_) { return false; }
  }
  const editable = () => S.enabled && S.canEdit;
  function menuItems() {
    try { const st = window.KiwiMenuStore; const items = st && (st.items ? st.items() : (st.data && st.data().items)) || []; return items.filter((x) => x && !x.archived); } catch (_) { return []; }
  }
  const menuItem = (id) => menuItems().find((x) => String(x.id) === String(id)) || null;
  function vatDefault() {
    try { const v = window.KiwiReceipt && window.KiwiReceipt.config && window.KiwiReceipt.config().vat; if (v && v.mode === 'rate') return { vatIncluded: v.included !== false, vatRate: +v.rate || null }; } catch (_) {}
    return { vatIncluded: false, vatRate: null };
  }
  let lineSeq = 0;
  const lineId = () => 'l' + Date.now().toString(36) + (lineSeq++).toString(36);
  function blankSheet() {
    return { name: tr('newName'), kind: 'sheet', menuItemId: '', menuItemName: '', sellingPrice: null, ...vatDefault(), portions: 1, targetPct: 30, note: '', lines: [] };
  }

  /* Fiche → brouillon de recette. Seules les lignes alimentaires nommées
     passent ; la quantité devient brute (utilisée ÷ rendement), puisque c'est
     ce qui sort du stock. Rien n'est écrit ici : l'éditeur de recette s'ouvre
     pré-rempli et seul son bouton Enregistrer crée la recette. */
  function recipeSeed(d) {
    const U = units(), lines = Array.isArray(d && d.lines) ? d.lines : [];
    const food = lines.filter((l) => l && l.type !== 'packaging' && String(l.name || '').trim());
    const ingredients = food.map((l) => {
      const y = isNum(l.yieldPct) && +l.yieldPct > 0 && +l.yieldPct <= 100 ? +l.yieldPct / 100 : 1;
      const unit = l.useUnit || l.packUnit || '';
      return { stockId: '', name: String(l.name).trim(), qty: isNum(l.useQty) ? +l.useQty / y : 0, unit: (U && U.normalize ? U.normalize(unit, '') : unit) || '' };
    });
    return { seed: { itemName: d.menuItemName || d.name || '', portions: isNum(d.portions) && +d.portions > 0 ? +d.portions : 1, prepMinutes: 0, ingredients, steps: [], note: d.note || '' }, packaging: lines.filter((l) => l && l.type === 'packaging').length };
  }
  const recipeBridge = () => { try { const w = window.KiwiRestaurantMenuWorkspace; return w && typeof w.recipeFromSheet === 'function' ? w : null; } catch (_) { return null; } };
  function toRecipe() {
    const d = S.draft, it = d && d.menuItemId ? menuItem(d.menuItemId) : null, bridge = recipeBridge();
    if (!d || !it || !bridge) return false;
    const r = recipeSeed(d);
    if (!r.seed.ingredients.length) { S.message = tr('toRecipeEmpty'); S.messageKind = 'warn'; paint(); return false; }
    let existing = false;
    try { existing = !!(window.KiwiRestaurantRecipes && window.KiwiRestaurantRecipes.get && window.KiwiRestaurantRecipes.get(it.id, it.name)); } catch (_) { existing = false; }
    const text = tr('toRecipeConfirm', { item: it.name, n: r.seed.ingredients.length, pack: r.packaging }) + (existing ? tr('toRecipeExisting') : '');
    /* La question passe par la fenêtre partagée : l'éditeur de recette ne
       s'ouvre que sur « Ouvrir le brouillon » ; Annuler, Échap ou le fond ne
       font rien. Renvoie vrai quand la question est posée. */
    return ask({ title: tr('toRecipe'), body: text, yes: tr('toRecipeYes') }, () => { bridge.recipeFromSheet(it.id, r.seed, { sheet: d.name || '' }); });
  }

