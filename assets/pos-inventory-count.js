/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · POS Inventory Count Engine (assets/pos-inventory-count.js)
 * ───────────────────────────────────────────────────────────────────────────
 * Guide d'inventaire physique universel en caisse (Boutique, Maison, Restaurant).
 *
 * Principes :
 *  1. Comptage à l'aveugle par défaut — le caissier ne voit pas le stock attendu
 *     ni les écarts pendant la saisie.
 *  2. Gel complet des métadonnées — nom produit, déclinaison (couleur, taille),
 *     SKU, code-barres principal, unité et coût de référence.
 *  3. « La revue est le seul chemin d'écriture » — la soumission enregistre un
 *     document d'inventaire gelé avec le statut 'submitted'. Aucun stock n'est
 *     modifié tant que le propriétaire n'a pas validé dans son tableau de bord.
 * ═══════════════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Les moteurs adossés au CATALOGUE boutique (window.KiwiBoutiqueCatalog) :
     la boutique et la maison tiennent le même inventaire produit × déclinaison.
     Le moteur « ledger » est celui des verticales qui comptent des ingrédients
     (window.stockItems). Un moteur inconnu qui tomberait ici compterait le
     mauvais stock en silence — d'où la liste nommée plutôt qu'un `else`. */
  const CATALOG_ENGINES = ['boutique', 'maison'];
  function usesCatalog(engine) {
    return CATALOG_ENGINES.indexOf(engine) >= 0 && !!window.KiwiBoutiqueCatalog;
  }

  function detectEngine() {
    if (window.KiwiBoutiqueCatalog) return 'boutique';
    return 'ledger';
  }

  function getCashier() {
    /* La caisse boutique (et la maison) savent qui est au comptoir par
       window.KiwiStaff (caisse-pairing.js) ; window.currentCashier n'est
       jamais posé sur elles, et chaque inventaire partait signé « Caissier ». */
    const staff = window.KiwiStaff;
    if (staff && typeof staff === 'object' && staff.name) {
      return { id: staff.id || 'caisse-1', name: staff.name, role: staff.role || 'Caissier' };
    }
    if (window.currentCashier && typeof window.currentCashier === 'object') {
      return {
        id: window.currentCashier.id || 'caisse-1',
        name: window.currentCashier.name || 'Caissier',
        role: window.currentCashier.role || 'Caissier'
      };
    }
    return { id: 'caisse-1', name: 'Caissier', role: 'Caissier' };
  }

  function merchantScope() {
    try {
      const paired = window.KiwiPlatform?.pairedVenue?.()
        || JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
      return String((paired && paired.merchant) || localStorage.getItem('kiwiLiveMerchant') || 'local')
        .replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'local';
    } catch (_) { return 'local'; }
  }

  function draftKey(engine) { return `kiwi:inventoryCountDraft:${merchantScope()}:${engine}`; }

  /* Le magasin à NOMMER au serveur. Une caisse appairée n'est reconnue par son
     cookie que si la requête nomme le magasin (functions/api/_private.js,
     resolveTenant) : sans lui, l'envoi répondait 401 et l'inventaire ne
     quittait jamais la tablette. Même source que le registre des stocks. */
  function countMerchant() {
    try {
      const m = window.KiwiInventory && typeof window.KiwiInventory.merchant === 'function' && window.KiwiInventory.merchant();
      if (m) return String(m).slice(0, 64);
    } catch (_) {}
    const s = merchantScope();
    return s === 'local' ? '' : s;
  }

  /* Pourquoi un écart (revue avant envoi). Le code voyage dans le brouillon ;
     le serveur reçoit le libellé dans `explanation`, que le tableau de bord
     montre dans sa colonne Motif. */
  const REASONS = [
    ['casse', 'Cassé ou abîmé'],
    ['perdu', 'Perdu ou volé'],
    ['erreur', 'Erreur d’étiquette ou de saisie'],
    ['autre', 'Autre'],
  ];
  const reasonLabel = (code) => { const r = REASONS.find((x) => x[0] === code); return r ? r[1] : ''; };
  const hasGap = (it) => it.counted && Number(it.countedQty) !== Number(it.systemQty);

  function saveDraft() {
    if (!countState.isOpen || countState.step === 'submitted') return false;
    try {
      const counted = countState.items.filter((item) => item.counted).map((item) => ({
        key: item.key, itemId: item.itemId, variantId: item.variantId,
        countedQty: item.countedQty, explanation: item.explanation || '', note: item.note || '', reason: item.reason || ''
      }));
      localStorage.setItem(draftKey(countState.engine), JSON.stringify({
        version: 1, engine: countState.engine, intentId: countState.intentId, supersedes: countState.supersedes || '',
        savedAt: Date.now(), counted
      }));
      countState.draftSavedAt = Date.now();
      return true;
    } catch (_) { return false; }
  }

  function restoreDraft(engine, items) {
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(draftKey(engine)) || 'null'); } catch (_) {}
    if (!draft || draft.version !== 1 || !Array.isArray(draft.counted)) return null;
    const byKey = new Map(items.map((item) => [item.key, item]));
    draft.counted.forEach((saved) => {
      const item = byKey.get(saved.key);
      /* Never force-match by product name. A renamed/recreated variant is not
         proof of identity and must remain untouched. */
      if (!item || item.itemId !== saved.itemId || item.variantId !== saved.variantId) return;
      const qty = Number(saved.countedQty);
      if (!Number.isFinite(qty) || qty < 0) return;
      item.counted = true; item.countedQty = qty;
      item.explanation = String(saved.explanation || '').slice(0, 300);
      item.note = String(saved.note || '').slice(0, 300);
      item.reason = REASONS.some((r) => r[0] === saved.reason) ? saved.reason : '';
    });
    return draft;
  }

  function clearDraft(engine) {
    try { localStorage.removeItem(draftKey(engine)); } catch (_) {}
  }

  function uniqueValues(items, field) {
    return Array.from(new Set(items.map((item) => String(item[field] || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'fr'));
  }

  function loadCountableItems(engine) {
    const items = [];
    if (usesCatalog(engine)) {
      /* ON PASSE PAR L'API PUBLIQUE DU CATALOGUE, PAS PAR SA FORME INTERNE.
         La première version appelait `KiwiBoutiqueCatalog.export()` et
         `stockOf()` : deux méthodes qui n'ont jamais existé. `export` étant
         `undefined`, le ternaire retombait sur `null`, la liste des variantes
         était vide, et le comptage s'ouvrait sur « 0 / 0 articles » devant un
         inventaire de sept déclinaisons. Aucune erreur en console : lire une
         propriété absente rend `undefined`, pas une exception. C'est pour ça
         que tools/pos-inventory-count-test.mjs vérifie l'existence de chaque
         méthode appelée ici — un renommage côté catalogue doit casser le
         build, pas l'écran du caissier. */
      try {
        const cat = window.KiwiBoutiqueCatalog;
        const products = cat.listProducts ? cat.listProducts({}) : [];
        const categories = new Map((cat.listCategories ? cat.listCategories() : []).map((row) => [row.id, row.name]));
        products.forEach((p) => {
          if (!p || !p.id) return;
          const variants = cat.listVariants ? cat.listVariants(p.id) : [];
          variants.forEach((v) => {
            if (!v || !v.id) return;
            /* Le code-barres passe par primaryBarcode() : `v.barcodes` est une
               liste d'OBJETS {code, type, primary}. `barcodes[0]` rendait donc
               un objet, affiché « [object Object] » et introuvable à la
               douchette. */
            const barcode = (cat.primaryBarcode ? cat.primaryBarcode(v) : '') || '';
            items.push({
              key: 'v_' + v.id,
              itemId: p.id,
              variantId: v.id,
              locationId: 'magasin',
              productName: p.name || 'Article',
              /* Pour la vignette du comptage (peau 2027) : la photo du
                 commerçant, sinon la photo choisie par le nom (retail-photos). */
              photo: p.photo || '',
              art: p.art || '',
              artPicked: !!p.artPicked,
              colorId: v.colorId || '',
              category: categories.get(p.categoryId) || p.category || p.categoryId || '',
              brand: p.brand || p.marque || '',
              collection: p.collection || p.collectionName || '',
              supplier: p.supplier || p.supplierName || '',
              /* La NUANCE d'origine si le magasin en a saisi une, sinon la
                 famille : c'est ce que le caissier lit sur l'étiquette. */
              color: v.colorSource || v.colorLabel || v.colorId || '',
              size: v.size || '',
              sku: v.sku || barcode,
              barcode: barcode,
              unit: 'pièce',
              /* Le coût vit sur le PRODUIT, jamais sur la déclinaison. */
              unitCost: Number(p.cost || 0),
              /* `v.stock` est le stock matérialisé (socle + mouvements) — le
                 même nombre que la grille et les ruptures. `v.base` est le
                 socle seul : il aurait ignoré toutes les ventes du jour. */
              systemQty: Number(v.stock || 0),
              countedQty: 0,
              counted: false,
              explanation: '',
              note: ''
            });
          });
        });
      } catch (_) {}
    } else {
      // Moteur Ledger / Restaurant / Épicerie
      const stockItems = window.stockItems || [];
      const ledgerLocation = (window.KiwiInventory && window.KiwiInventory.locationId)
        ? window.KiwiInventory.locationId()
        : 'principal';
      stockItems.forEach(it => {
        if (!it || !it.id) return;
        const cost = Number(it.cost || 0);
        items.push({
          key: `it_${it.id}`,
          itemId: it.id,
          variantId: '',
          locationId: ledgerLocation,
          productName: it.name,
          category: it.category || it.cat || '',
          brand: it.brand || '',
          collection: it.collection || '',
          supplier: it.supplier || '',
          color: '',
          size: '',
          sku: it.id,
          barcode: '',
          unit: it.unit || 'unité',
          unitCost: cost,
          systemQty: (window.KiwiInventory && window.KiwiInventory.balance)
            ? window.KiwiInventory.balance(it.id, { locationId: ledgerLocation })
            : Number(it.stock || 0),
          countedQty: 0,
          counted: false,
          explanation: '',
          note: ''
        });
      });
    }
    return items;
  }

  let countState = {
    isOpen: false,
    engine: 'ledger',
    items: [],
    filter: 'all',
    search: '',
    dimensions: { category: '', brand: '', collection: '', supplier: '', locationId: '' },
    blindMode: true,
    step: 'counting', // 'counting' | 'review' | 'submitted'
    submittedCountId: null,
    intentId: null
  };

  function newCountIntentId() {
    try { if (window.crypto && window.crypto.randomUUID) return 'count:' + window.crypto.randomUUID(); } catch (_) {}
    return 'count:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2, 14);
  }

  /* ─── Peau 2027 (html[data-skin-2027="till"]) ───────────────────────────
     Même état, mêmes crochets (data-cnt-*, #pos-cnt-*) : wireEvents ne sait
     pas quelle mise en page il sert. La boîte partagée #sk-modal-box fait
     480 px : sous la peau elle s'élargit (.kcnt-box) le temps du comptage, et
     chaque article devient une carte avec sa photo, comme la grille de vente
     (propriétaire, 2026-10-30 : « je veux voir la photo des produits »).
     Toucher la photo compte une pièce de plus. */
  function kitOn() {
    return document.documentElement.getAttribute('data-skin-2027') === 'till';
  }
  /* La photo choisie par le nom vit dans un module (retail-photos.js, celui
     des grilles boutique et maison). Le comptage est un script classique :
     il le charge à la demande et se redessine quand il arrive. */
  let photoMod = null;
  let photoAsked = false;
  function kitPhotos() {
    if (photoMod || photoAsked) return;
    photoAsked = true;
    import('/assets/retail-photos.js?v=5').then((m) => {
      photoMod = m;
      if (countState.isOpen && countState.step !== 'submitted' && kitOn()) renderModal();
    }).catch(() => {});
  }
  function kitThumb(it) {
    if (it.photo) return `<img src="${esc(it.photo)}" alt="" loading="lazy" decoding="async" draggable="false">`;
    if (photoMod && usesCatalog(countState.engine)) {
      /* La couleur passe par le produit, pas en force : le nom (« Hoodie noir »)
         l'emporte, et le gris que le catalogue met d'office ne compte pas — la
         même règle que la grille de vente (retail-photos.js › colourOf). */
      return photoMod.photoImg({ name: it.productName, art: it.art, artPicked: it.artPicked, colors: it.color ? [it.color] : [] }, 'kcnt-auto', countState.engine === 'maison' ? 'tag' : 'cintre');
    }
    const letter = String(it.productName || '?').trim().charAt(0).toUpperCase();
    return `<span class="kcnt-mono">${esc(letter)}</span>`;
  }
  function kitMeta(it) {
    const variant = [it.color, it.size].filter(Boolean).join(' · ');
    return `${variant ? `<span class="kcnt-chip">${esc(variant)}</span>` : ''}${it.sku ? `<span class="kcnt-code">${esc(it.sku)}</span>` : ''}`;
  }
  function kitModalHtml(v) {
    kitCss();
    kitPhotos();
    const step = countState.step;
    const head = `<header class="kcnt-hd">
        <div class="kcnt-ttl">
          <h3>${step === 'review' ? 'Récapitulatif avant transmission' : 'Inventaire physique'}</h3>
          <p>${step === 'review'
            ? `Vérifiez les quantités saisies par <b>${esc(v.cashier.name)}</b> avant l'envoi.${v.gaps ? ` <b class="kcnt-warn-ink">${v.gaps} écart${v.gaps > 1 ? 's' : ''}</b> : dites pourquoi si vous le savez.` : ''}`
            : `Comptez chaque article en rayon. <b>${esc(v.cashier.name)}</b> compte, le propriétaire valide avant que le stock ne bouge.`}</p>
        </div>
        <button type="button" class="kcnt-x" data-cnt-close aria-label="Fermer le comptage" title="Fermer le comptage"><i data-icon="close"></i></button>
      </header>`;
    const ask = countState.correctionNote && step !== 'submitted'
      ? `<div class="kcnt-note"><b>Le propriétaire demande des précisions :</b> ${esc(countState.correctionNote)}</div>` : '';
    if (step === 'submitted') {
      return `<div class="kcnt kcnt-done">
        <button type="button" class="kcnt-x" data-cnt-close aria-label="Fermer le comptage"><i data-icon="close"></i></button>
        <span class="kcnt-done-ic"><i data-icon="check"></i></span>
        <h3>Inventaire transmis</h3>
        <p>Votre comptage (${v.countedCount} article${v.countedCount > 1 ? 's' : ''}) est enregistré sous la référence <b class="kcnt-code">${esc(countState.submittedCountId)}</b>.</p>
        <div class="kcnt-done-card"><b>Le stock ne bouge pas encore</b><span>Il sera ajusté quand le propriétaire aura validé cet inventaire depuis son tableau de bord.</span></div>
        <button type="button" class="kcnt-btn primary" id="pos-cnt-finish-btn">Retour à la caisse</button>
      </div>`;
    }
    if (step === 'review') {
      const rows = v.items.filter((i) => i.counted).map((it) => `<div class="kcnt-rv${hasGap(it) ? ' has-gap' : ''}">
          <span class="kcnt-rv-ph">${kitThumb(it)}</span>
          <div class="kcnt-info"><b>${esc(it.productName)}</b><span>${kitMeta(it)}</span></div>
          <div class="kcnt-qty">${it.countedQty}<small>${esc(it.unit)}</small></div>
          ${hasGap(it) ? `<div class="kcnt-gap">
            <span class="kcnt-gap-tag">Écart avec le système</span>
            <select data-cnt-reason="${esc(it.key)}" aria-label="Motif de l’écart" data-kiwi-native-select>
              <option value="">Motif (facultatif)…</option>
              ${REASONS.map(([val, l]) => `<option value="${val}"${it.reason === val ? ' selected' : ''}>${esc(l)}</option>`).join('')}
            </select>
            <input data-cnt-note="${esc(it.key)}" value="${esc(it.explanation || it.note || '')}" placeholder="Précisez si besoin…">
          </div>` : `<span class="kcnt-ok" data-cnt-ok="${esc(it.key)}"><i data-icon="check"></i>Conforme</span>`}
        </div>`).join('');
      return `<div class="kcnt">${head}${ask}
        ${countState.submitError ? `<div class="kcnt-note is-err">${esc(countState.submitError)}</div>` : ''}
        <div class="kcnt-list kcnt-rvlist" tabindex="0" role="region" aria-label="Récapitulatif">${rows}</div>
        <footer class="kcnt-ft">
          <button type="button" class="kcnt-btn" id="pos-cnt-back-btn">Revenir au comptage</button>
          <span class="kcnt-ft-sp"></span>
          <button type="button" class="kcnt-btn primary" id="pos-cnt-submit-btn">Transmettre au propriétaire</button>
        </footer>
      </div>`;
    }
    const seg = [['all', 'Tous', v.totalCount], ['uncounted', 'À compter', v.totalCount - v.countedCount], ['counted', 'Comptés', v.countedCount]]
      .map(([f, l, n]) => `<button type="button" class="kcnt-seg-it${countState.filter === f ? ' on' : ''}" data-cnt-filter="${f}" aria-pressed="${countState.filter === f}">${l}<small>${n}</small></button>`).join('');
    const dims = [['category', 'Catégorie'], ['brand', 'Marque'], ['collection', 'Collection'], ['supplier', 'Fournisseur'], ['locationId', 'Emplacement']]
      .map(([field, label]) => {
        const values = uniqueValues(v.items, field);
        if (values.length < 2 && !countState.dimensions[field]) return '';   // un seul choix ne filtre rien
        return `<label class="kcnt-dim${countState.dimensions[field] ? ' on' : ''}"><span>${label}</span>
          <select data-cnt-dimension="${field}" data-kiwi-native-select><option value="">Tous</option>${values.map((val) => `<option value="${esc(val)}"${countState.dimensions[field] === val ? ' selected' : ''}>${esc(val)}</option>`).join('')}</select></label>`;
      }).join('');
    const cards = v.filtered.length ? v.filtered.map((it) => `<div class="kcnt-card${it.counted ? ' is-counted' : ''}">
        <button type="button" class="kcnt-ph" data-cnt-step="${esc(it.key)}" data-step="1" aria-label="Compter un ${esc(it.productName)} de plus">${kitThumb(it)}<span class="kcnt-tick">${it.counted ? '<i data-icon="check"></i>' : ''}</span></button>
        <div class="kcnt-info"><b title="${esc(it.productName)}">${esc(it.productName)}</b><span>${kitMeta(it)}</span></div>
        <div class="kcnt-step">
          <button type="button" data-cnt-step="${esc(it.key)}" data-step="-1" aria-label="Retirer un"><i data-icon="remove"></i></button>
          <label><input type="number" min="0" step="any" inputmode="decimal" data-cnt-input="${esc(it.key)}" value="${it.counted ? it.countedQty : ''}" placeholder="–" aria-label="Quantité comptée · ${esc(it.productName)}"><small>${esc(it.unit)}</small></label>
          <button type="button" data-cnt-step="${esc(it.key)}" data-step="1" aria-label="Ajouter un"><i data-icon="add"></i></button>
        </div>
      </div>`).join('') : `<div class="kcnt-empty"><i data-icon="search"></i><b>Aucun article</b><span>${countState.search ? 'Rien ne correspond à cette recherche.' : countState.filter === 'counted' ? 'Rien n’est encore compté.' : 'Tout est compté.'}</span></div>`;
    const saved = countState.draftSavedAt
      ? `Brouillon sauvé à ${new Date(countState.draftSavedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
      : 'Le brouillon reste sur cette caisse, même hors ligne';
    return `<div class="kcnt">${head}${ask}
      <div class="kcnt-tools">
        <div class="kcnt-search"><i data-icon="search"></i><input id="pos-cnt-search-input" placeholder="Scanner un code-barres ou chercher un article" value="${esc(countState.search)}" autocomplete="off" autofocus></div>
        <div class="kcnt-seg" role="group" aria-label="Filtrer">${seg}</div>
      </div>
      ${dims ? `<div class="kcnt-dims">${dims}</div>` : ''}
      <div class="kcnt-list" tabindex="0" role="region" aria-label="Articles à compter"><div class="kcnt-grid">${cards}</div></div>
      <footer class="kcnt-ft">
        <div class="kcnt-prog">
          <div class="kcnt-prog-l"><b>${v.countedCount} / ${v.totalCount} comptés</b><span>${v.pct} %</span></div>
          <div class="kcnt-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v.pct}"><i style="width:${v.pct}%"></i></div>
          <small>${saved}</small>
        </div>
        <button type="button" class="kcnt-btn" id="pos-cnt-save-btn">Enregistrer le brouillon</button>
        <button type="button" class="kcnt-btn primary" id="pos-cnt-review-btn" ${v.countedCount === 0 ? 'disabled' : ''}>Vérifier et transmettre</button>
      </footer>
    </div>`;
  }
  function kitCss() {
    if (document.getElementById('kcnt-css')) return;
    const style = document.createElement('style');
    style.id = 'kcnt-css';
    const S = 'html[data-skin-2027="till"] #sk-modal-box';
    const CHEV = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 -960 960 960'%3E%3Cpath fill='%235A625E' d='M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z'/%3E%3C/svg%3E")`;
    style.textContent = `
${S}.kcnt-box{width:min(1040px,calc(100vw - 32px));height:min(92vh,980px);max-height:none;padding:0;overflow:hidden;display:flex;flex-direction:column;border-radius:var(--k-r-4);background-color:var(--k-bg);color:var(--k-ink-1);box-shadow:var(--k-shadow-2);font-family:var(--k-font)}
${S} .kcnt{display:flex;flex-direction:column;min-height:0;flex:1;font-variant-numeric:tabular-nums}
${S} .kcnt :is(button,input,select){font-family:inherit}
${S} .kcnt-hd{display:flex;align-items:center;gap:16px;padding:20px 20px 0 24px}
${S} .kcnt-ttl{flex:1;min-width:0}
${S} .kcnt-ttl h3{margin:0;font-size:var(--k-fs-title);font-weight:var(--k-fw-title);letter-spacing:var(--k-track-title);line-height:var(--k-lh-title)}
${S} .kcnt-ttl p{margin:4px 0 0;font-size:var(--k-fs-callout);line-height:var(--k-lh-callout);color:var(--k-ink-3)}
${S} .kcnt-ttl p b{color:var(--k-ink-1);font-weight:var(--k-fw-callout-strong)}
${S} .kcnt-ttl p b.kcnt-warn-ink{color:var(--k-warning)}
${S} .kcnt-x{flex:none;width:44px;height:44px;display:grid;place-items:center;border:0;border-radius:50%;background-color:var(--k-surface-2);color:var(--k-ink-1);cursor:pointer;touch-action:manipulation}
${S} .kcnt-x svg{width:20px;height:20px}
${S} .kcnt-note{margin:12px 24px 0;padding:12px 16px;border-radius:var(--k-r-2);background-color:var(--k-warning-tint);color:var(--k-ink-1);font-size:var(--k-fs-callout)}
${S} .kcnt-note.is-err{background-color:var(--k-danger-tint);color:var(--k-danger)}
${S} .kcnt-tools{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:16px 24px 0}
${S} .kcnt-search{flex:1 1 320px;display:flex;align-items:center;gap:12px;min-height:52px;padding:0 16px;border-radius:var(--k-r-3);background-color:var(--k-surface-1);box-shadow:var(--k-shadow-1);transition:box-shadow var(--k-dur-2) var(--k-glide)}
${S} .kcnt-search:focus-within{box-shadow:0 0 0 var(--k-focus-w) var(--k-focus),var(--k-shadow-1)}
${S} .kcnt-search svg{flex:none;width:22px;height:22px;color:var(--k-ink-2)}
${S} .kcnt-search input{flex:1;min-width:0;height:48px;border:0;outline:0;background:none;color:var(--k-ink-1);font-size:var(--k-fs-body)}
${S} .kcnt-search input::placeholder{color:var(--k-ink-3)}
${S} .kcnt-seg{display:flex;flex:none;gap:2px;padding:4px;border-radius:var(--k-r-3);background-color:var(--k-surface-2)}
${S} .kcnt-seg-it{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border:0;border-radius:calc(var(--k-r-3) - 4px);background:none;color:var(--k-ink-2);font-size:var(--k-fs-callout);font-weight:var(--k-fw-callout-strong);cursor:pointer;white-space:nowrap}
${S} .kcnt-seg-it small{min-width:22px;padding:1px 6px;border-radius:999px;background-color:var(--k-surface-1);font-size:var(--k-fs-footnote);color:var(--k-ink-3);text-align:center}
${S} .kcnt-seg-it.on{background-color:var(--k-surface-1);color:var(--k-ink-1);box-shadow:var(--k-shadow-1)}
${S} .kcnt-seg-it.on small{background-color:var(--k-accent-tint);color:var(--k-accent-ink)}
${S} .kcnt-dims{display:flex;flex-wrap:wrap;gap:8px;padding:12px 24px 0}
${S} .kcnt-dim{display:inline-flex;align-items:center;gap:4px;min-height:40px;padding:0 4px 0 14px;border-radius:999px;background-color:var(--k-surface-1);box-shadow:inset 0 0 0 1px var(--k-line);font-size:var(--k-fs-footnote);color:var(--k-ink-3);cursor:pointer}
${S} .kcnt-dim.on{background-color:var(--k-accent-tint);box-shadow:none;color:var(--k-accent-ink)}
${S} .kcnt-dim select{-webkit-appearance:none;appearance:none;height:40px;padding:0 30px 0 2px;border:0;outline:0;background:${CHEV} no-repeat right 6px center/20px 20px;color:var(--k-ink-1);font-size:var(--k-fs-footnote);font-weight:var(--k-fw-footnote-strong);cursor:pointer;max-width:200px}
${S} .kcnt-list{flex:1;min-height:0;margin-top:16px;padding:0 24px 20px;overflow-y:auto;overscroll-behavior:contain}
${S}.kcnt-box{scrollbar-width:none}
${S} .kcnt-list{scrollbar-width:thin;scrollbar-color:var(--k-line-strong) transparent}
${S} .kcnt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(196px,1fr));gap:12px}
${S} .kcnt-card{position:relative;display:flex;flex-direction:column;gap:10px;padding:10px 10px 10px;border-radius:var(--k-r-3);background-color:var(--k-surface-1);box-shadow:var(--k-shadow-1),inset 0 0 0 2px transparent;transition:box-shadow var(--k-dur-3) var(--k-glide)}
${S} .kcnt-card.is-counted{box-shadow:var(--k-shadow-1),inset 0 0 0 2px var(--k-accent)}
${S} .kcnt-ph{position:relative;display:grid;place-items:center;height:116px;padding:0;border:0;border-radius:var(--k-r-2);background-color:var(--k-surface-2);cursor:pointer;touch-action:manipulation;overflow:hidden;transition:transform var(--k-dur-4) var(--k-spring)}
${S} .kcnt-ph:active{transform:scale(.97);transition-duration:var(--k-dur-1)}
${S} .kcnt-ph img{width:88px;height:88px;object-fit:contain;pointer-events:none}
${S} .kcnt-ph img:not(.kcnt-auto){width:100%;height:100%;object-fit:cover}
${S} .kcnt-mono{font-size:var(--k-fs-display);font-weight:var(--k-fw-title);color:var(--k-ink-3)}
${S} .kcnt-tick{position:absolute;top:8px;inset-inline-end:8px;width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background-color:var(--k-surface-1);box-shadow:inset 0 0 0 1.5px var(--k-line-strong)}
${S} .kcnt-card.is-counted .kcnt-tick{background-color:var(--k-accent);color:var(--k-on-accent);box-shadow:none}
${S} .kcnt-tick svg{width:18px;height:18px}
${S} .kcnt-info{min-width:0;padding:0 4px}
${S} .kcnt-info b{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;min-height:2.5em;font-size:var(--k-fs-callout);font-weight:var(--k-fw-callout-strong);line-height:1.25;color:var(--k-ink-1)}
${S} .kcnt-info > span{display:flex;align-items:center;gap:6px;margin-top:6px;min-width:0;font-size:var(--k-fs-footnote);color:var(--k-ink-3);white-space:nowrap;overflow:hidden}
${S} .kcnt-chip{flex:none;padding:2px 8px;border-radius:999px;background-color:var(--k-surface-2);color:var(--k-ink-2);font-weight:var(--k-fw-footnote-strong)}
${S} .kcnt-code{min-width:0;overflow:hidden;text-overflow:ellipsis;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:0;color:var(--k-ink-3)}
${S} .kcnt-step{display:grid;grid-template-columns:48px minmax(0,1fr) 48px;align-items:center;gap:4px;margin-top:auto;padding:4px;border-radius:var(--k-r-2);background-color:var(--k-surface-2)}
${S} .kcnt-step button{height:44px;display:grid;place-items:center;border:0;border-radius:calc(var(--k-r-2) - 4px);background-color:var(--k-surface-1);color:var(--k-ink-1);cursor:pointer;touch-action:manipulation;transition:transform var(--k-dur-4) var(--k-spring)}
${S} .kcnt-step button:active{transform:scale(.94);transition-duration:var(--k-dur-1)}
${S} .kcnt-step button svg{width:22px;height:22px}
${S} .kcnt-step label{display:flex;align-items:baseline;justify-content:center;gap:4px;min-width:0;height:44px;border-radius:calc(var(--k-r-2) - 4px);cursor:text}
${S} .kcnt-step label:focus-within{box-shadow:0 0 0 var(--k-focus-w) var(--k-focus);background-color:var(--k-surface-1)}
${S} .kcnt-step input{width:100%;min-width:0;height:44px;border:0;outline:0;background:none;text-align:center;color:var(--k-ink-1);font-size:var(--k-fs-heading);font-weight:var(--k-fw-heading);-moz-appearance:textfield}
${S} .kcnt-step input::-webkit-outer-spin-button,${S} .kcnt-step input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
${S} .kcnt-step input::placeholder{color:var(--k-ink-3);font-weight:var(--k-fw-body)}
${S} .kcnt-step small{display:none}
${S} .kcnt-card.is-counted .kcnt-step input{color:var(--k-accent-ink)}
${S} .kcnt-empty{grid-column:1/-1;display:flex;flex-direction:column;align-items:center;gap:6px;padding:56px 16px;text-align:center;color:var(--k-ink-3);font-size:var(--k-fs-callout)}
${S} .kcnt-empty svg{width:32px;height:32px;margin-bottom:6px}
${S} .kcnt-empty b{font-size:var(--k-fs-body);color:var(--k-ink-1)}
${S} .kcnt-ft{display:flex;align-items:center;gap:12px;padding:14px 24px calc(16px + env(safe-area-inset-bottom,0px));background-color:var(--k-surface-1);box-shadow:inset 0 1px 0 var(--k-line)}
${S} .kcnt-ft-sp{flex:1}
${S} .kcnt-prog{flex:1;min-width:0}
${S} .kcnt-prog-l{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:6px;max-width:360px;font-size:var(--k-fs-callout)}
${S} .kcnt-prog-l b{font-weight:var(--k-fw-callout-strong)}
${S} .kcnt-prog-l span{font-size:var(--k-fs-footnote);color:var(--k-ink-3)}
${S} .kcnt-bar{max-width:360px;height:6px;border-radius:999px;background-color:var(--k-surface-2);overflow:hidden}
${S} .kcnt-bar i{display:block;height:100%;border-radius:inherit;background-color:var(--k-accent);transition:width var(--k-dur-4) var(--k-glide)}
${S} .kcnt-prog small{display:block;margin-top:6px;font-size:var(--k-fs-footnote);color:var(--k-ink-3)}
${S} .kcnt-btn{flex:none;min-height:52px;padding:0 22px;border:0;border-radius:var(--k-r-2);background-color:var(--k-surface-2);color:var(--k-ink-1);font-size:var(--k-fs-callout);font-weight:var(--k-fw-callout-strong);cursor:pointer;touch-action:manipulation}
${S} .kcnt-btn.primary{min-width:220px;background-color:var(--k-accent);color:var(--k-on-accent);box-shadow:var(--k-shadow-1)}
${S} .kcnt-btn.primary:hover{background-color:var(--k-accent-pressed)}
${S} .kcnt-btn:disabled{background-color:var(--k-surface-2);color:var(--k-ink-3);box-shadow:none;cursor:default}
${S} .kcnt-rvlist{display:flex;flex-direction:column;gap:8px}
${S} .kcnt-rv{display:grid;grid-template-columns:64px minmax(0,1fr) auto;align-items:center;column-gap:14px;row-gap:10px;padding:10px 16px 10px 10px;border-radius:var(--k-r-3);background-color:var(--k-surface-1);box-shadow:var(--k-shadow-1)}
${S} .kcnt-rv-ph{width:64px;height:64px;display:grid;place-items:center;border-radius:var(--k-r-2);background-color:var(--k-surface-2);overflow:hidden}
${S} .kcnt-rv-ph img{width:52px;height:52px;object-fit:contain}
${S} .kcnt-rv-ph img:not(.kcnt-auto){width:100%;height:100%;object-fit:cover}
${S} .kcnt-rv-ph .kcnt-mono{font-size:var(--k-fs-title)}
${S} .kcnt-rv .kcnt-info b{min-height:0;-webkit-line-clamp:1;font-size:var(--k-fs-body)}
${S} .kcnt-qty{font-size:var(--k-fs-title);font-weight:var(--k-fw-title);color:var(--k-accent-ink);text-align:end}
${S} .kcnt-qty small{margin-inline-start:4px;font-size:var(--k-fs-footnote);font-weight:var(--k-fw-footnote);color:var(--k-ink-3)}
${S} .kcnt-ok{grid-column:2/-1;display:inline-flex;align-items:center;gap:4px;font-size:var(--k-fs-footnote);color:var(--k-ink-3)}
${S} .kcnt-ok svg{width:16px;height:16px;color:var(--k-accent)}
${S} .kcnt-gap{grid-column:2/-1;display:grid;grid-template-columns:auto minmax(0,1fr) minmax(0,1fr);align-items:center;gap:8px}
${S} .kcnt-gap-tag{padding:4px 10px;border-radius:999px;background-color:var(--k-warning-tint);color:var(--k-warning);font-size:var(--k-fs-footnote);font-weight:var(--k-fw-footnote-strong);white-space:nowrap}
${S} .kcnt-gap :is(select,input){min-height:44px;padding:0 12px;border:0;border-radius:calc(var(--k-r-2) - 2px);background-color:var(--k-surface-2);color:var(--k-ink-1);font-size:var(--k-fs-callout)}
${S} .kcnt-gap select{-webkit-appearance:none;appearance:none;padding-inline-end:40px;background:var(--k-surface-2) ${CHEV} no-repeat right 10px center/22px 22px}
${S} .kcnt-gap :is(select,input):focus{outline:0;box-shadow:0 0 0 var(--k-focus-w) var(--k-focus)}
${S} .kcnt-done{position:relative;align-items:center;justify-content:center;text-align:center;padding:48px 32px 32px}
${S} .kcnt-done > .kcnt-x{position:absolute;top:16px;inset-inline-end:16px}
${S} .kcnt-done-ic{width:72px;height:72px;display:grid;place-items:center;margin-bottom:16px;border-radius:50%;background-color:var(--k-accent-tint);color:var(--k-accent-ink)}
${S} .kcnt-done-ic svg{width:36px;height:36px}
${S} .kcnt-done h3{margin:0 0 8px;font-size:var(--k-fs-title);font-weight:var(--k-fw-title);letter-spacing:var(--k-track-title)}
${S} .kcnt-done p{max-width:460px;margin:0 0 20px;font-size:var(--k-fs-callout);color:var(--k-ink-2)}
${S} .kcnt-done-card{max-width:460px;margin:0 0 24px;padding:16px;border-radius:var(--k-r-3);background-color:var(--k-surface-1);box-shadow:var(--k-shadow-1);text-align:start}
${S} .kcnt-done-card b{display:block;margin-bottom:4px;font-size:var(--k-fs-callout)}
${S} .kcnt-done-card span{font-size:var(--k-fs-footnote);color:var(--k-ink-3)}
@media (max-width:720px){${S} .kcnt-hd{padding:16px 12px 0 16px}${S} :is(.kcnt-tools,.kcnt-dims){padding-inline:16px}${S} .kcnt-list{padding-inline:16px}${S} .kcnt-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}${S} .kcnt-seg{flex:1 1 100%}${S} .kcnt-seg-it{flex:1;justify-content:center;padding:0 8px}${S} .kcnt-ft{flex-wrap:wrap;padding-inline:16px}${S} .kcnt-prog{flex:1 1 100%}${S} .kcnt-btn{flex:1;min-width:0}${S} .kcnt-gap{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){${S} :is(.kcnt-bar i,.kcnt-step button,.kcnt-ph,.kcnt-card){transition:none}}
`;
    document.head.appendChild(style);
  }

  function renderModal() {
    const cashier = getCashier();
    const engine = countState.engine;
    const items = countState.items;
    
    const filtered = items.filter(it => {
      if (countState.filter === 'counted' && !it.counted) return false;
      if (countState.filter === 'uncounted' && it.counted) return false;
      for (const field of ['category', 'brand', 'collection', 'supplier', 'locationId']) {
        if (countState.dimensions[field] && String(it[field] || '') !== countState.dimensions[field]) return false;
      }
      if (countState.search) {
        const q = countState.search.toLowerCase();
        const full = `${it.productName} ${it.color} ${it.size} ${it.sku} ${it.barcode} ${it.category} ${it.brand} ${it.collection} ${it.supplier}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });

    const countedCount = items.filter(i => i.counted).length;
    const gaps = items.filter(hasGap).length;
    /* Le propriétaire a renvoyé un inventaire avec une question : elle reste
       sous les yeux de l'employé pendant tout le recomptage. */
    const askBox = countState.correctionNote && countState.step !== 'submitted'
      ? `<div style="margin-bottom:12px;padding:10px 12px;border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:10px;font-size:13px;"><b>Le propriétaire demande des précisions :</b> ${esc(countState.correctionNote)}</div>`
      : '';
    const totalCount = items.length;
    const pct = totalCount ? Math.round((countedCount / totalCount) * 100) : 0;

    let bodyHtml = '';

    if (countState.step === 'submitted') {
      bodyHtml = `
        <div style="text-align:center;padding:40px 20px;">
          <div style="width:64px;height:64px;border-radius:50%;background:#ecfdf5;color:#059669;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:32px;">✓</div>
          <h2 style="font-size:22px;font-weight:700;margin-bottom:8px;">Inventaire physique transmis</h2>
          <p style="font-size:14px;color:var(--n-600);max-width:480px;margin:0 auto 20px;">
            Votre comptage (${countedCount} article${countedCount > 1 ? 's' : ''}) a été enregistré sous la référence <b>${esc(countState.submittedCountId)}</b>.
          </p>
          <div style="background:var(--paper-soft);border:1px solid var(--n-200);border-radius:12px;padding:16px;max-width:440px;margin:0 auto 24px;text-align:left;font-size:13px;">
            <div style="font-weight:600;margin-bottom:4px;color:var(--n-800);">La revue est le seul chemin d'écriture</div>
            <div style="color:var(--n-600);">Le stock ne sera pas ajusté en caisse tant que le propriétaire n'aura pas validé cet inventaire depuis son tableau de bord.</div>
          </div>
          <button class="ma-btn primary" id="pos-cnt-finish-btn" style="padding:12px 28px;font-size:15px;border-radius:12px;">Retour à la caisse</button>
        </div>
      `;
    } else if (countState.step === 'review') {
      bodyHtml = `
        <div style="padding:4px 0;">
          ${countState.submitError ? `<div style="margin-bottom:12px;padding:10px 12px;border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:10px;font-size:13px;">${esc(countState.submitError)}</div>` : ''}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <div>
              <h3 style="margin:0 0 4px;font-size:18px;">Récapitulatif avant transmission</h3>
              <p style="margin:0;font-size:13px;color:var(--n-600);">Vérifiez les quantités saisies par <b>${esc(cashier.name)}</b> avant l'envoi.${gaps ? ` <b style="color:#92400e;">${gaps} écart${gaps > 1 ? 's' : ''}</b> : dites pourquoi si vous le savez.` : ''}</p>
            </div>
            <span class="sk-badge" style="background:#e0f2fe;color:#0369a1;font-size:13px;padding:4px 10px;">${countedCount} / ${totalCount} saisis</span>
          </div>

          <div tabindex="0" role="region" aria-label="${esc(window.KiwiCaisseLang?.tr('Récapitulatif avant transmission') || 'Récapitulatif avant transmission')}" style="max-height:360px;overflow-y:auto;border:1px solid var(--n-200);border-radius:12px;margin-bottom:16px;">
            <table class="sk-tbl" style="margin:0;">
              <thead>
                <tr>
                  <th>Article &amp; Déclinaison</th>
                  <th style="text-align:center;">Quantité comptée</th>
                  <th>Écart · motif</th>
                </tr>
              </thead>
              <tbody>
                ${items.filter(i => i.counted).map(it => {
                  const label = `${it.productName}${it.color ? ' · ' + it.color : ''}${it.size ? ' · ' + it.size : ''}`;
                  return `
                    <tr>
                      <td>
                        <b>${esc(label)}</b>
                        ${it.sku ? `<div style="font-size:11px;color:var(--n-500);">Réf: ${esc(it.sku)}</div>` : ''}
                      </td>
                      <td style="text-align:center;font-weight:700;font-size:16px;color:var(--atlas);">
                        ${it.countedQty} ${esc(it.unit)}
                      </td>
                      <td>
                        ${hasGap(it) ? `
                        <div style="display:flex;flex-direction:column;gap:6px;">
                          <span style="align-self:flex-start;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#92400e;background:#fef3c7;border-radius:999px;padding:2px 8px;">Écart avec le système</span>
                          <select class="sk-input" data-cnt-reason="${esc(it.key)}" aria-label="Motif de l’écart" style="font-size:13px;width:100%;padding:6px 8px;">
                            <option value="">Motif (facultatif)…</option>
                            ${REASONS.map(([v, l]) => `<option value="${v}"${it.reason === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}
                          </select>
                          <input class="sk-input" data-cnt-note="${esc(it.key)}" value="${esc(it.explanation || it.note || '')}" placeholder="Précisez si besoin…" style="font-size:12px;width:100%;padding:4px 8px;">
                        </div>` : `<span data-cnt-ok="${esc(it.key)}" style="font-size:12px;color:var(--n-600);">Conforme</span>`}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button class="ma-btn secondary" id="pos-cnt-back-btn" style="padding:10px 18px;">← Revenir au comptage</button>
            <button class="ma-btn primary" id="pos-cnt-submit-btn" style="padding:10px 24px;background:var(--atlas,#0B6E4F);border-color:var(--riad,#053B2C);">Transmettre au propriétaire</button>
          </div>
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="pos-cnt-container">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:13px;color:var(--n-600);">Employé : <b>${esc(cashier.name)}</b></span>
              <span class="sk-badge" style="background:rgba(0,0,0,0.06);color:var(--n-700);">${countedCount} / ${totalCount} articles (${pct}%)</span>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="sk-pill ${countState.filter==='all'?'on':''}" data-cnt-filter="all">Tous (${totalCount})</button>
              <button class="sk-pill ${countState.filter==='counted'?'on':''}" data-cnt-filter="counted">Comptés (${countedCount})</button>
              <button class="sk-pill ${countState.filter==='uncounted'?'on':''}" data-cnt-filter="uncounted">Restants (${totalCount - countedCount})</button>
            </div>
          </div>

          <div class="sk-toolbar" style="margin-bottom:12px;">
            <div class="sk-search-wrap" style="flex:1;">
              <i data-lucide="search"></i>
              <input class="sk-search" id="pos-cnt-search-input" placeholder="Scanner un code-barres ou chercher un article…" value="${esc(countState.search)}" autofocus>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:7px;margin:-4px 0 12px;">
            ${[
              ['category', 'Catégorie'], ['brand', 'Marque'], ['collection', 'Collection'],
              ['supplier', 'Fournisseur'], ['locationId', 'Emplacement']
            ].map(([field, label]) => {
              const values = uniqueValues(items, field);
              if (!values.length) return '';
              return `<label style="font-size:10px;color:var(--n-500);text-transform:uppercase;letter-spacing:.05em;">${label}
                <select class="sk-input" data-cnt-dimension="${field}" style="display:block;width:100%;margin-top:3px;padding:6px 8px;font-size:12px;">
                  <option value="">Tous</option>${values.map((value) => `<option value="${esc(value)}"${countState.dimensions[field] === value ? ' selected' : ''}>${esc(value)}</option>`).join('')}
                </select></label>`;
            }).join('')}
          </div>

          <div class="sk-tbl-wrap" tabindex="0" role="region" aria-label="${esc(window.KiwiCaisseLang?.tr('Inventaire') || 'Inventaire')}" style="max-height:380px;overflow-y:auto;border:1px solid var(--n-200);border-radius:12px;">
            <table class="sk-tbl">
              <thead>
                <tr>
                  <th>Article</th>
                  <th>Déclinaison / Réf</th>
                  <th style="text-align:center;width:180px;">Quantité physique</th>
                  <th style="text-align:right;">État</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length ? filtered.map(it => {
                  const label = `${it.productName}${it.color ? ' · ' + it.color : ''}${it.size ? ' · ' + it.size : ''}`;
                  return `
                    <tr style="${it.counted ? 'background:rgba(16,185,129,0.04);' : ''}">
                      <td><b>${esc(it.productName)}</b></td>
                      <td>
                        ${it.color || it.size ? `<span class="sk-badge" style="font-size:11px;background:var(--n-100);">${esc([it.color, it.size].filter(Boolean).join(' · '))}</span>` : ''}
                        ${it.sku ? `<span style="font-size:11px;color:var(--n-500);margin-left:4px;">${esc(it.sku)}</span>` : ''}
                      </td>
                      <td style="text-align:center;">
                        <div style="display:inline-flex;align-items:center;gap:6px;">
                          <button class="sk-icon-btn" data-cnt-step="${esc(it.key)}" data-step="-1" style="width:28px;height:28px;">−</button>
                          <input class="sk-input" type="number" min="0" step="any" data-cnt-input="${esc(it.key)}" value="${it.counted ? it.countedQty : ''}" placeholder="0" style="width:64px;text-align:center;font-weight:700;padding:4px;">
                          <button class="sk-icon-btn" data-cnt-step="${esc(it.key)}" data-step="1" style="width:28px;height:28px;">+</button>
                          <span style="font-size:12px;color:var(--n-600);width:30px;text-align:left;">${esc(it.unit)}</span>
                        </div>
                      </td>
                      <td style="text-align:right;">
                        ${it.counted ? `<span class="sk-badge ok" style="font-size:11px;">Saisi</span>` : `<span class="sk-badge" style="font-size:11px;background:var(--n-100);color:var(--n-500);">À compter</span>`}
                      </td>
                    </tr>
                  `;
                }).join('') : `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--n-500);">Aucun article correspondant.</td></tr>`}
              </tbody>
            </table>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <button class="ma-btn secondary" id="pos-cnt-save-btn" style="padding:10px 18px;">Enregistrer le brouillon</button>
              <span style="font-size:11px;color:var(--n-500);">${countState.draftSavedAt ? `Sauvé à ${new Date(countState.draftSavedAt).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}` : 'Sauvegarde locale hors ligne'}</span>
            </div>
            <button class="ma-btn primary" id="pos-cnt-review-btn" style="padding:10px 24px;background:var(--atlas,#0B6E4F);border-color:var(--riad,#053B2C);" ${countedCount === 0 ? 'disabled' : ''}>
              Vérifier et transmettre (${countedCount})
            </button>
          </div>
        </div>
      `;
    }

    const modalHtml = `
      <button type="button" data-cnt-close aria-label="Fermer le comptage" title="Fermer le comptage"
        style="position:absolute;top:12px;inset-inline-end:12px;width:36px;height:36px;display:grid;place-items:center;border:0;border-radius:50%;background:var(--n-100,#efece3);color:var(--ink,#0A0F0D);cursor:pointer;touch-action:manipulation;">
        <i data-icon="close"></i>
      </button>
      <div class="split-badge" style="background:#e0f2fe;color:#0369a1;"><i data-lucide="clipboard-check"></i> Inventaire physique</div>
      <h3 class="modal-title" style="margin-bottom:4px;">Comptage de stock en caisse</h3>
      <p class="modal-subtle" style="margin:0 0 14px;">Saisie à l'aveugle des quantités réelles. La transmission sera soumise à la validation du propriétaire.</p>
      ${askBox}
      ${bodyHtml}
    `;

    /* Peau 2027 : la même logique, la mise en page du kit (pos-inventory-count-kit). */
    const kit = kitOn();
    const html = kit ? kitModalHtml({ cashier, items, filtered, countedCount, totalCount, pct, gaps }) : modalHtml;
    const prevList = document.querySelector('#sk-modal-box .kcnt-list, #sk-modal-box .sk-tbl-wrap');
    const keepScroll = prevList ? prevList.scrollTop : 0;
    // Render inside caisse modal
    if (typeof window.openSkModal === 'function') {
      window.openSkModal(html);
    } else {
      const modal = document.getElementById('sk-modal');
      const inner = document.getElementById('sk-modal-box');
      if (modal && inner) {
        inner.innerHTML = html;
        modal.classList.add('is-open');
      }
    }
    const box = document.getElementById('sk-modal-box');
    if (box) box.classList.toggle('kcnt-box', kit);
    if (box && getComputedStyle(box).position === 'static') box.style.position = 'relative';
    /* Un + ou un − redessine la fiche : la liste reste là où on comptait. */
    const nextList = document.querySelector('#sk-modal-box .kcnt-list, #sk-modal-box .sk-tbl-wrap');
    if (nextList && keepScroll) nextList.scrollTop = keepScroll;
    if (window.lucide) lucide.createIcons();
    wireEvents();
  }

  /* La seule sortie du comptage. `window.closeSkModal` n'a JAMAIS existé :
     closeSkModal est une fonction locale de assets/caisse/inventory.js, donc
     le `typeof window.closeSkModal === 'function'` d'ici était toujours faux
     et même « Terminer » ne refermait rien. Et le gestionnaire que wireEvents
     pose en `modal.onclick` ÉCRASE celui de la caisse, qui portait le clic sur
     le voile — plus de croix, plus de voile, plus d'Échap : la caissière
     restait enfermée dans le comptage (propriétaire, 2026-10-28, les deux
     peaux). On ferme donc ici, sans dépendre de personne, et on enregistre le
     brouillon avant : fermer ne doit jamais coûter une saisie. */
  function closeCount() {
    try { saveDraft(); } catch (_) {}
    if (escHandler) { document.removeEventListener('keydown', escHandler, true); escHandler = null; }
    const kbox = document.getElementById('sk-modal-box');
    if (kbox) kbox.classList.remove('kcnt-box');
    const modal = document.getElementById('sk-modal');
    if (!modal) return;
    if (typeof window.closeSkModal === 'function') window.closeSkModal();
    else modal.classList.remove('is-open');
    modal.onclick = null; modal.oninput = null;
  }
  let escHandler = null;

  function wireEvents() {
    const searchInput = document.getElementById('pos-cnt-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        countState.search = e.target.value;
        renderModal();
        const nextInput = document.getElementById('pos-cnt-search-input');
        if (nextInput) { nextInput.focus(); nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length); }
      });
      // Barcode Enter detection
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const barcode = searchInput.value.trim().toLowerCase();
          if (barcode) {
            const match = countState.items.find(i => (i.barcode && i.barcode.toLowerCase() === barcode) || (i.sku && i.sku.toLowerCase() === barcode));
            if (match) {
              match.countedQty = (match.counted ? match.countedQty : 0) + 1;
              match.counted = true;
              countState.search = '';
              renderModal();
              if (window.toast) toast(`+1 ${match.productName}`);
            }
          }
        }
      });
    }

    const modal = document.getElementById('sk-modal');
    if (!modal) return;

    if (!escHandler) {
      escHandler = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); closeCount(); } };
      document.addEventListener('keydown', escHandler, true);
    }

    modal.onclick = (e) => {
      /* Le voile lui-même, puis la croix : les deux sorties que tout le reste
         de la caisse offre déjà (`e.target === #sk-modal`, `[data-sk-cancel]`). */
      if (e.target === modal || e.target.closest('[data-cnt-close]') || e.target.closest('[data-sk-cancel]')) {
        closeCount();
        return;
      }
      const filterBtn = e.target.closest('[data-cnt-filter]');
      if (filterBtn) {
        countState.filter = filterBtn.dataset.cntFilter;
        renderModal();
        return;
      }

      if (e.target.closest('#pos-cnt-save-btn')) {
        if (saveDraft() && window.toast) toast('Brouillon d’inventaire enregistré');
        renderModal();
        return;
      }

      const stepBtn = e.target.closest('[data-cnt-step]');
      if (stepBtn) {
        const key = stepBtn.dataset.cntStep;
        const step = parseFloat(stepBtn.dataset.step) || 0;
        const item = countState.items.find(i => i.key === key);
        if (item) {
          item.countedQty = Math.max(0, (item.counted ? item.countedQty : 0) + step);
          item.counted = true;
          saveDraft();
          renderModal();
        }
        return;
      }

      if (e.target.closest('#pos-cnt-review-btn')) {
        countState.step = 'review';
        renderModal();
        return;
      }

      if (e.target.closest('#pos-cnt-back-btn')) {
        countState.step = 'counting';
        renderModal();
        return;
      }

      if (e.target.closest('#pos-cnt-finish-btn')) {
        closeCount();
        return;
      }

      if (e.target.closest('#pos-cnt-submit-btn')) {
        submitCount();
        return;
      }
    };

    modal.oninput = (e) => {
      const reason = e.target.closest('[data-cnt-reason]');
      if (reason) {
        const item = countState.items.find(i => i.key === reason.dataset.cntReason);
        if (item) { item.reason = reason.value; saveDraft(); }
        return;
      }
      const dimension = e.target.closest('[data-cnt-dimension]');
      if (dimension) {
        countState.dimensions[dimension.dataset.cntDimension] = dimension.value;
        renderModal();
        return;
      }
      const cntInput = e.target.closest('[data-cnt-input]');
      if (cntInput) {
        const key = cntInput.dataset.cntInput;
        const item = countState.items.find(i => i.key === key);
        if (item) {
          const val = parseFloat(cntInput.value);
          if (!isNaN(val)) {
            item.countedQty = Math.max(0, val);
            item.counted = true;
          } else {
            item.counted = false;
          }
          /* Peau 2027 : la rangée passe au vert dès la frappe, sans redessiner (le curseur reste). */
          const card = cntInput.closest('.kcnt-card');
          if (card) { card.classList.toggle('is-counted', item.counted); const mark = card.querySelector('.kcnt-tick'); if (mark) mark.innerHTML = item.counted ? '<i data-icon="check"></i>' : ''; }
          saveDraft();
        }
        return;
      }

      const noteInput = e.target.closest('[data-cnt-note]');
      if (noteInput) {
        const key = noteInput.dataset.cntNote;
        const item = countState.items.find(i => i.key === key);
        if (item) item.explanation = noteInput.value;
        saveDraft();
        return;
      }
    };
  }

  async function submitCount() {
    const cashier = getCashier();
    const engine = countState.engine;
    const items = countState.items.filter(i => i.counted);

    const merchant = countMerchant();
    const payload = {
      id: countState.intentId,
      engine: engine,
      merchant: merchant,
      supersedes: countState.supersedes || undefined,
      terminalId: (window.KiwiInventory && window.KiwiInventory.terminalId)
        ? window.KiwiInventory.terminalId()
        : '',
      storeId: (window.KiwiInventory && window.KiwiInventory.unitId && window.KiwiInventory.unitId())
        || (window.KiwiEnv && window.KiwiEnv.storeId) || '',
      storeName: (window.KiwiEnv && window.KiwiEnv.storeName) || 'Caisse Principale',
      employeeId: cashier.id,
      employeeName: cashier.name,
      employeeRole: cashier.role,
      lines: items.map(i => ({
        key: i.key,
        itemId: i.itemId,
        variantId: i.variantId,
        locationId: i.locationId,
        productName: i.productName,
        color: i.color,
        size: i.size,
        sku: i.sku,
        barcode: i.barcode,
        unit: i.unit,
        unitCost: i.unitCost,
        systemQty: i.systemQty,
        countedQty: i.countedQty,
        explanation: [reasonLabel(i.reason), i.explanation || ''].filter(Boolean).join(' · ').slice(0, 200),
        note: i.note || ''
      }))
    };

    try {
      const resp = await fetch('/api/inventory/counts' + (merchant ? '?merchant=' + encodeURIComponent(merchant) : ''), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (data && data.success) {
        clearDraft(engine);
        countState.submitError = '';
        countState.submittedCountId = data.count.id;
        countState.step = 'submitted';
        renderModal();
        if (window.toast) toast('Inventaire transmis pour validation');
        return;
      }
    } catch (_) {}

    // Keep the frozen review and intent for a retry; no durable submission was made.
    countState.submitError = 'Envoi impossible · le comptage reste en revue et n’est pas enregistré. Réessaie quand la connexion est rétablie.';
    renderModal();
    if (window.toast) toast('Inventaire non transmis · réessaie');
  }

  function open(opts) {
    const engine = (opts && opts.engine) || detectEngine();
    const items = loadCountableItems(engine);
    const draft = restoreDraft(engine, items);
    countState = {
      isOpen: true,
      engine: engine,
      items,
      filter: 'all',
      search: '',
      dimensions: { category: '', brand: '', collection: '', supplier: '', locationId: '' },
      blindMode: true,
      step: 'counting',
      submittedCountId: null,
      submitError: '',
      intentId: (draft && draft.intentId) || newCountIntentId(),
      /* Un recomptage demandé par le propriétaire REMPLACE l'ancien document
         (le serveur le passe « superseded ») au lieu de s'y ajouter. */
      supersedes: String((opts && opts.supersedes) || (draft && draft.supersedes) || '').slice(0, 80),
      correctionNote: String((opts && opts.correctionNote) || '').slice(0, 500),
      draftSavedAt: draft && Number(draft.savedAt) || 0
    };
    renderModal();
  }

  /* `_loadItems` est exposé pour tools/pos-inventory-count-test.mjs : le
     défaut qu'il garde est une LISTE VIDE, et une liste vide ne se voit pas
     depuis l'extérieur du module. */
  window.KiwiPosInventoryCount = { open, _loadItems: loadCountableItems, _saveDraft: saveDraft, _restoreDraft: restoreDraft };
})();
