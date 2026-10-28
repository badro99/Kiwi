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

    // Render inside caisse modal
    if (typeof window.openSkModal === 'function') {
      window.openSkModal(modalHtml);
    } else {
      const modal = document.getElementById('sk-modal');
      const inner = document.getElementById('sk-modal-box');
      if (modal && inner) {
        inner.innerHTML = modalHtml;
        modal.classList.add('is-open');
      }
    }
    const box = document.getElementById('sk-modal-box');
    if (box && getComputedStyle(box).position === 'static') box.style.position = 'relative';
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

      if (e.target.id === 'pos-cnt-save-btn') {
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

      if (e.target.id === 'pos-cnt-review-btn') {
        countState.step = 'review';
        renderModal();
        return;
      }

      if (e.target.id === 'pos-cnt-back-btn') {
        countState.step = 'counting';
        renderModal();
        return;
      }

      if (e.target.id === 'pos-cnt-finish-btn') {
        closeCount();
        return;
      }

      if (e.target.id === 'pos-cnt-submit-btn') {
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
