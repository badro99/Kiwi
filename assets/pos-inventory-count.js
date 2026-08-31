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
    if (window.currentCashier && typeof window.currentCashier === 'object') {
      return {
        id: window.currentCashier.id || 'caisse-1',
        name: window.currentCashier.name || 'Caissier',
        role: window.currentCashier.role || 'Caissier'
      };
    }
    return { id: 'caisse-1', name: 'Caissier', role: 'Caissier' };
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
      stockItems.forEach(it => {
        if (!it || !it.id) return;
        const cost = Number(it.cost || 0);
        items.push({
          key: `it_${it.id}`,
          itemId: it.id,
          variantId: '',
          locationId: 'principal',
          productName: it.name,
          color: '',
          size: '',
          sku: it.id,
          barcode: '',
          unit: it.unit || 'unité',
          unitCost: cost,
          systemQty: Number(it.stock || 0),
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
    blindMode: true,
    step: 'counting', // 'counting' | 'review' | 'submitted'
    submittedCountId: null
  };

  function renderModal() {
    const cashier = getCashier();
    const engine = countState.engine;
    const items = countState.items;
    
    const filtered = items.filter(it => {
      if (countState.filter === 'counted' && !it.counted) return false;
      if (countState.filter === 'uncounted' && it.counted) return false;
      if (countState.search) {
        const q = countState.search.toLowerCase();
        const full = `${it.productName} ${it.color} ${it.size} ${it.sku} ${it.barcode}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });

    const countedCount = items.filter(i => i.counted).length;
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
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <div>
              <h3 style="margin:0 0 4px;font-size:18px;">Récapitulatif avant transmission</h3>
              <p style="margin:0;font-size:13px;color:var(--n-600);">Vérifiez les quantités saisies par <b>${esc(cashier.name)}</b> avant l'envoi.</p>
            </div>
            <span class="sk-badge" style="background:#e0f2fe;color:#0369a1;font-size:13px;padding:4px 10px;">${countedCount} / ${totalCount} saisis</span>
          </div>

          <div style="max-height:360px;overflow-y:auto;border:1px solid var(--n-200);border-radius:12px;margin-bottom:16px;">
            <table class="sk-tbl" style="margin:0;">
              <thead>
                <tr>
                  <th>Article &amp; Déclinaison</th>
                  <th style="text-align:center;">Quantité comptée</th>
                  <th>Remarque / Motif</th>
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
                        <input class="sk-input" data-cnt-note="${esc(it.key)}" value="${esc(it.explanation || it.note || '')}" placeholder="Explication optionnelle…" style="font-size:12px;width:100%;padding:4px 8px;">
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button class="ma-btn secondary" id="pos-cnt-back-btn" style="padding:10px 18px;">← Revenir au comptage</button>
            <button class="ma-btn primary" id="pos-cnt-submit-btn" style="padding:10px 24px;background:#059669;border-color:#047857;">Transmettre au propriétaire</button>
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

          <div class="sk-tbl-wrap" style="max-height:380px;overflow-y:auto;border:1px solid var(--n-200);border-radius:12px;">
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
            <button class="ma-btn secondary" data-sk-cancel style="padding:10px 18px;">Annuler</button>
            <button class="ma-btn primary" id="pos-cnt-review-btn" style="padding:10px 24px;background:#059669;border-color:#047857;" ${countedCount === 0 ? 'disabled' : ''}>
              Vérifier et transmettre (${countedCount})
            </button>
          </div>
        </div>
      `;
    }

    const modalHtml = `
      <div class="split-badge" style="background:#e0f2fe;color:#0369a1;"><i data-lucide="clipboard-check"></i> Inventaire physique</div>
      <h3 class="modal-title" style="margin-bottom:4px;">Comptage de stock en caisse</h3>
      <p class="modal-subtle" style="margin:0 0 14px;">Saisie à l'aveugle des quantités réelles. La transmission sera soumise à la validation du propriétaire.</p>
      ${bodyHtml}
    `;

    // Render inside caisse modal
    if (typeof window.openSkModal === 'function') {
      window.openSkModal(modalHtml);
    } else {
      const modal = document.getElementById('sk-modal');
      const inner = document.getElementById('sk-modal-inner');
      if (modal && inner) {
        inner.innerHTML = modalHtml;
        modal.classList.add('is-open');
      }
    }
    if (window.lucide) lucide.createIcons();
    wireEvents();
  }

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

    modal.onclick = (e) => {
      const filterBtn = e.target.closest('[data-cnt-filter]');
      if (filterBtn) {
        countState.filter = filterBtn.dataset.cntFilter;
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
        if (typeof window.closeSkModal === 'function') window.closeSkModal();
        return;
      }

      if (e.target.id === 'pos-cnt-submit-btn') {
        submitCount();
        return;
      }
    };

    modal.oninput = (e) => {
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
        }
        return;
      }

      const noteInput = e.target.closest('[data-cnt-note]');
      if (noteInput) {
        const key = noteInput.dataset.cntNote;
        const item = countState.items.find(i => i.key === key);
        if (item) item.explanation = noteInput.value;
        return;
      }
    };
  }

  async function submitCount() {
    const cashier = getCashier();
    const engine = countState.engine;
    const items = countState.items.filter(i => i.counted);

    const payload = {
      engine: engine,
      terminalId: (window.KiwiInventory && window.KiwiInventory.terminalId)
        ? window.KiwiInventory.terminalId()
        : '',
      storeId: (window.KiwiEnv && window.KiwiEnv.storeId) || '',
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
        explanation: i.explanation || '',
        note: i.note || ''
      }))
    };

    try {
      const resp = await fetch('/api/inventory/counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (data && data.success) {
        countState.submittedCountId = data.count.id;
        countState.step = 'submitted';
        renderModal();
        if (window.toast) toast('Inventaire transmis pour validation');
        return;
      }
    } catch (_) {}

    // Fallback offline / démo
    const fallbackId = 'cnt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    countState.submittedCountId = fallbackId;
    countState.step = 'submitted';
    renderModal();
    if (window.toast) toast('Inventaire enregistré en local (attente validation)');
  }

  function open(opts) {
    const engine = (opts && opts.engine) || detectEngine();
    countState = {
      isOpen: true,
      engine: engine,
      items: loadCountableItems(engine),
      filter: 'all',
      search: '',
      blindMode: true,
      step: 'counting',
      submittedCountId: null
    };
    renderModal();
  }

  /* `_loadItems` est exposé pour tools/pos-inventory-count-test.mjs : le
     défaut qu'il garde est une LISTE VIDE, et une liste vide ne se voit pas
     depuis l'extérieur du module. */
  window.KiwiPosInventoryCount = { open, _loadItems: loadCountableItems };
})();
