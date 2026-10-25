/* Owner: caisse inventory, receiving and waste drawers.
 * Exposes the classic global function declarations below.
 * Requires caisse-app.js shared lexical state and the accounting/floor/kitchen
 * declarations. No startup effects; load before caisse-app.js initializers.
 */
function renderStock(){
      $$('#sk-tabs .sk-tab').forEach(t => t.classList.toggle('on', t.dataset.skTab === stockTab));
      const body = $('#sk-body');
      if      (stockTab === 'apercu')     body.innerHTML = renderSkApercu();
      else if (stockTab === 'articles')   body.innerHTML = renderSkArticles();
      else if (stockTab === 'appro')      body.innerHTML = renderSkAppro();
      else if (stockTab === 'inventaire') body.innerHTML = renderSkInventaire();
      updateStockBadge();
      if (window.lucide) lucide.createIcons();
    }

    function renderSkApercu(){
      const alerts = stockItems.filter(i => skStatusOf(i) !== 'ok')
        .sort((a,b) => (skStatusOf(a)==='out'?0:1) - (skStatusOf(b)==='out'?0:1));
      const out = stockItems.filter(i => skStatusOf(i)==='out').length;
      const next = supplyOrders.find(o => o.status !== 'recue');
      const kpis = `<div class="sk-kpis">
        <div class="sk-kpi"><div class="sk-kpi-l">Valeur du stock<span class="sk-kpi-ico"><i data-lucide="wallet"></i></span></div><div class="sk-kpi-v">${fmtMAD(skTotalValue())}</div><div class="sk-kpi-sub">${stockItems.length} articles suivis</div></div>
        <div class="sk-kpi"><div class="sk-kpi-l">En alerte<span class="sk-kpi-ico ${alerts.length?'warn':'ok'}"><i data-lucide="alert-triangle"></i></span></div><div class="sk-kpi-v ${alerts.length?'warn':''}">${alerts.length}</div><div class="sk-kpi-sub">${out} en rupture</div></div>
        <div class="sk-kpi"><div class="sk-kpi-l">Prochaine livraison<span class="sk-kpi-ico"><i data-lucide="truck"></i></span></div><div class="sk-kpi-v" style="font-size:19px">${next ? next.when : '·'}</div><div class="sk-kpi-sub">${next ? kdsEsc(next.supplier) : 'Aucune commande active'}</div></div>
        <div class="sk-kpi"><div class="sk-kpi-l">Fournisseurs<span class="sk-kpi-ico"><i data-lucide="contact"></i></span></div><div class="sk-kpi-v">${suppliers.length}</div><div class="sk-kpi-sub">actifs</div></div>
      </div>`;
      const quickActs = `<div class="sk-quick-acts" style="display:flex;gap:10px;margin-bottom:18px;">
        <button class="ma-btn primary" data-sk-newwaste style="background:#dc2626;border-color:#b91c1c;padding:12px 18px;font-size:14px;border-radius:12px;font-weight:600;"><i data-lucide="trash-2"></i>Déclarer une perte</button>
        <button class="ma-btn secondary" id="sk-apercu-recept-btn" data-sk-recept-act style="padding:12px 18px;font-size:14px;border-radius:12px;font-weight:600;"><i data-lucide="scan-line"></i>Réceptionner du stock</button>
      </div>`;
      const list = alerts.length
        ? `<div class="sk-section"><div class="sk-section-head"><h3>Alertes stock</h3><span class="sk-badge warn">${alerts.length}</span></div><div class="sk-alerts">${alerts.map(it=>{
            const st = skStatusOf(it);
            return `<div class="sk-alert ${st}"><div class="sk-alert-ico"><i data-lucide="${st==='out'?'x-octagon':'alert-triangle'}"></i></div>
              <div class="sk-alert-body"><div class="sk-alert-top"><span class="sk-alert-name">${kdsEsc(it.name)}</span><span class="sk-alert-cat">${SK_CATS[it.cat]||it.cat}</span><span class="sk-alert-status ${st}">${st==='out'?'Rupture':'Bas'}</span></div>
              <div class="sk-alert-meta">${it.stock} ${it.unit} en stock · niveau par ${it.par} ${it.unit} · ${kdsEsc(it.supplier)}</div></div>
              <div style="display:flex;gap:6px;">
                <button class="ma-btn secondary sk-mini" data-sk-waste="${it.id}" style="color:#b91c1c;"><i data-lucide="trash-2"></i>Perte</button>
                <button class="ma-btn primary sk-mini" data-sk-order="${it.id}"><i data-lucide="truck"></i>Commander</button>
              </div></div>`;
          }).join('')}</div></div>`
        : `<div class="sk-section"><div class="sk-empty"><i data-lucide="check-circle-2"></i>Tout est au niveau, aucune alerte.</div></div>`;

      // Dernières pertes (20 plus récentes, journée commerciale d'abord)
      const recentWaste = (function(){
        const I = window.KiwiInventory;
        if (!I || !I.history) return [];
        const rows = (I.history() || []).filter(r => r && (r.refType === 'waste' || ['loss','expiry','gift','staff-meal'].includes(r.reason)));
        const curDay = (window.KiwiDayReport && window.KiwiDayReport.businessDay) ? window.KiwiDayReport.businessDay(Date.now()) : '';
        return rows.slice(0, 20).map(r => {
          const it = stockItems.find(i => i.id === r.itemId) || { name: r.itemId, unit: 'unité', cost: r.unitCost || 0 };
          const rDay = (window.KiwiDayReport && window.KiwiDayReport.businessDay) ? window.KiwiDayReport.businessDay(r.occurredTs) : '';
          const isToday = curDay && rDay === curDay;
          const cost = r.unitCost != null ? r.unitCost : (it.cost || 0);
          const valMAD = Math.abs(r.qty) * cost;
          const reasonLabel = (function(why){
            if (why === 'perime' || r.reason === 'expiry') return 'Périmé';
            if (why === 'casse') return 'Casse';
            if (why === 'avarie') return 'Avarié / Abîmé';
            if (why === 'offert' || r.reason === 'gift') return 'Offert';
            if (why === 'repas-equipe' || r.reason === 'staff-meal') return 'Repas équipe';
            return 'Autre perte';
          })(r.meta && r.meta.wasteReason);
          return {
            id: r.id,
            itemId: r.itemId,
            name: it.name,
            qty: Math.abs(r.qty),
            unit: it.unit,
            valMAD: valMAD,
            actor: r.actor || (r.meta && r.meta.actor) || 'Caissier',
            reason: reasonLabel,
            note: r.note || '',
            ts: r.occurredTs,
            isToday: isToday
          };
        });
      })();

      const wasteSection = recentWaste.length ? `
        <div class="sk-section" style="margin-top:20px;">
          <div class="sk-section-head">
            <h3>Dernières pertes</h3>
            <span class="sk-badge" style="background:rgba(220,38,38,0.1);color:#991b1b;">${recentWaste.length}</span>
          </div>
          <div class="sk-tbl-wrap" tabindex="0" role="region" aria-label="${escTeam(window.KiwiCaisseLang?.tr('Dernières pertes') || 'Dernières pertes')}">
            <table class="sk-tbl">
              <thead><tr><th>Date &amp; heure</th><th>Article</th><th>Quantité</th><th>Motif</th><th>Valeur</th><th>Employé</th></tr></thead>
              <tbody>
                ${recentWaste.map(w => {
                  const d = new Date(w.ts);
                  const timeStr = (w.isToday ? "Aujourd'hui " : (d.toLocaleDateString('fr-FR') + ' ')) + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                  return `<tr>
                    <td class="sk-mono" style="font-size:12px;color:var(--n-600);">${timeStr}</td>
                    <td><div class="sk-cell-name">${kdsEsc(w.name)}</div>${w.note ? `<div class="sk-cell-sub">${kdsEsc(w.note)}</div>` : ''}</td>
                    <td class="sk-mono" style="color:#b91c1c;font-weight:600;">−${w.qty} ${kdsEsc(w.unit)}</td>
                    <td><span class="sk-badge warn" style="font-size:11px;">${kdsEsc(w.reason)}</span></td>
                    <td class="sk-mono">${fmtMAD(w.valMAD)}</td>
                    <td style="font-size:12px;color:var(--n-600);">${kdsEsc(w.actor)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>` : '';

      // Lots proches de la DLC (7 jours) · un geste pour déclarer la perte, motif pré-rempli « Périmé »
      const dlcSection = (function(){
        if (!storeIsReal()) return '';
        let lots = [];
        try { lots = (window.KiwiInventoryConsumption?.expiring && window.KiwiInventoryConsumption.expiring({ horizonDays: 7 })) || []; } catch (_) { lots = []; }
        if (!lots.length) return '';
        const expired = lots.filter(l => l.status === 'expired').length;
        return `<div class="sk-section" style="margin-top:20px;">
          <div class="sk-section-head"><h3>Dates limites</h3><span class="sk-badge warn">${lots.length}</span></div>
          <div class="sk-alerts">${lots.slice(0, 12).map(l => {
            const d = new Date(l.expiresAt).toLocaleDateString('fr-FR');
            const tag = l.status === 'expired' ? 'Périmé' : (l.status === 'critical' ? `J-${Math.max(0, l.daysLeft)}` : `J-${l.daysLeft}`);
            return `<div class="sk-alert ${l.status === 'expired' ? 'out' : 'low'}"><div class="sk-alert-ico"><i data-lucide="${l.status === 'expired' ? 'x-octagon' : 'clock'}"></i></div>
              <div class="sk-alert-body"><div class="sk-alert-top"><span class="sk-alert-name">${kdsEsc(l.name)}</span><span class="sk-alert-status ${l.status === 'expired' ? 'out' : 'low'}">${tag}</span></div>
              <div class="sk-alert-meta">${l.remainingQty} ${kdsEsc(l.unit)} · DLC ${d}${l.supplierName ? ' · ' + kdsEsc(l.supplierName) : ''}</div></div>
              <button class="ma-btn secondary sk-mini" data-sk-dlc-waste="${kdsEsc(l.itemId)}" data-sk-dlc-lot="${kdsEsc(l.lotId || '')}" data-sk-dlc-qty="${l.remainingQty}" style="color:#b91c1c;"><i data-lucide="trash-2"></i>Déclarer en perte</button>
            </div>`;
          }).join('')}</div>
          ${expired ? `<div class="sk-kpi-sub" style="margin-top:6px;">${expired} lot${expired > 1 ? 's' : ''} déjà périmé${expired > 1 ? 's' : ''} · à sortir du stock.</div>` : ''}
        </div>`;
      })();
      return kpis + quickActs + list + dlcSection + wasteSection;
    }

    function skFilteredItems(){
      const q = skSearch.trim().toLowerCase();
      return stockItems.filter(i=>{
        if (skCat !== 'all' && i.cat !== skCat) return false;
        if (skStatus !== 'all' && skStatusOf(i) !== skStatus) return false;
        if (q && !(`${i.name} ${i.supplier} ${SK_CATS[i.cat]||''}`.toLowerCase().includes(q))) return false;
        return true;
      });
    }
    function skRowsHTML(){
      const items = skFilteredItems();
      if (!items.length) return `<tr class="sk-empty-row"><td colspan="8">Aucun article.</td></tr>`;
      return items.map(it=>{
        const st = skStatusOf(it);
        const pct = Math.min(100, Math.round(it.stock / Math.max(1, it.par) * 100));
        const bar = st==='out'?'bad':(st==='low'?'warn':'ok');
        return `<tr>
          <td><div class="sk-cell-name">${kdsEsc(it.name)}</div><div class="sk-cell-sub">${it.unit} · ${fmtMAD(it.cost)}/${it.unit}</div></td>
          <td>${SK_CATS[it.cat]||it.cat}</td>
          <td><div class="sk-cell-stock">${it.stock} ${it.unit}</div><div class="sk-bar"><div class="sk-bar-fill ${bar}" style="width:${pct}%"></div></div></td>
          <td class="sk-mono">${it.par}</td>
          <td class="sk-mono">${fmtMAD(it.stock * it.cost)}</td>
          <td class="sk-cell-sup">${kdsEsc(it.supplier)}</td>
          <td><span class="sk-status ${st}"><span class="sd"></span>${st==='out'?'Rupture':(st==='low'?'Bas':'OK')}</span></td>
          <td class="r"><div class="sk-actions"><button class="sk-icon-btn" data-sk-waste="${it.id}" title="Déclarer une perte" style="color:#b91c1c;"><i data-lucide="trash-2"></i></button><button class="sk-icon-btn" data-sk-order="${it.id}" title="Commander"><i data-lucide="truck"></i></button></div></td>
        </tr>`;
      }).join('');
    }
    function renderSkRows(){ const tb = $('#sk-tbl-body'); if (tb){ tb.innerHTML = skRowsHTML(); if (window.lucide) lucide.createIcons(); } }

    function renderSkArticles(){
      const cats = ['all', ...Object.keys(SK_CATS).filter(c => stockItems.some(i => i.cat === c))];
      const catPills = cats.map(c => `<button class="sk-pill ${skCat===c?'on':''}" data-sk-cat="${c}">${c==='all'?'Tout':SK_CATS[c]}</button>`).join('');
      const statusPills = [['all','Tous'],['ok','En stock'],['low','Bas'],['out','Rupture']].map(([v,l])=>`<button class="sk-pill ${skStatus===v?'on':''}" data-sk-status="${v}">${l}</button>`).join('');
      return `<div class="sk-toolbar">
          <div class="sk-search-wrap"><i data-lucide="search"></i><input class="sk-search" id="sk-search-input" placeholder="Chercher un article, fournisseur…" value="${kdsEsc(skSearch)}"></div>
          <span class="sk-dashboard-only">Articles et prix se gèrent dans le tableau de bord</span>
        </div>
        <div class="sk-filters">${catPills}</div>
        <div class="sk-filters">${statusPills}</div>
        <div class="sk-tbl-wrap" tabindex="0" role="region" aria-label="${escTeam(window.KiwiCaisseLang?.tr('Stock') || 'Stock')}"><table class="sk-tbl"><thead><tr><th>Article</th><th>Catégorie</th><th>Stock</th><th>Par</th><th>Valeur</th><th>Fournisseur</th><th>Statut</th><th class="r">Actions</th></tr></thead><tbody id="sk-tbl-body">${skRowsHTML()}</tbody></table></div>`;
    }

    function renderSkAppro(){
      const active = supplyOrders.filter(o => o.status !== 'recue');
      const past = supplyOrders.filter(o => o.status === 'recue');
      const card = o => { const [lbl,cls] = SK_ORD_STATUS[o.status] || ['',''];
        return `<div class="sk-ord ${o.status==='en-attente'?'urgent':''}">
          <div class="sk-ord-top"><span class="sk-ord-id">#${o.id}</span><span class="sk-ord-status ${cls}">${lbl}</span></div>
          <div class="sk-ord-sup">${kdsEsc(o.supplier)}</div>
          <div class="sk-ord-when"><i data-lucide="clock"></i>${kdsEsc(o.when)}</div>
          <div class="sk-ord-items">${o.items.map(i=>`${i.qty} ${i.unit} ${kdsEsc(i.name)}`).join(' · ')}</div>
          <div class="sk-ord-foot"><span class="sk-ord-total">${fmtMAD(o.total)}</span><div class="sk-ord-acts">
            ${o.status==='en-attente'?`<button class="ma-btn secondary sk-mini" data-sk-confirm="${o.id}">Confirmer</button>`:''}
            <button class="ma-btn primary sk-mini" data-sk-receive="${o.id}"><i data-lucide="check"></i>Reçue</button>
          </div></div></div>`; };
      return `<div class="sk-toolbar">
          <div class="sk-section-head" style="margin:0"><h3>Commandes en cours</h3><span class="sk-badge">${active.length}</span></div>
          <button class="ma-btn primary sk-add" data-sk-neworder><i data-lucide="plus"></i>Nouvelle commande</button>
        </div>
        <div class="sk-ord-grid">${active.length ? active.map(card).join('') : `<div class="sk-empty"><i data-lucide="truck"></i>Aucune commande en cours.</div>`}</div>
        ${past.length ? `<div class="sk-section"><div class="sk-section-head"><h3>Historique</h3></div><div class="sk-tbl-wrap" tabindex="0" role="region" aria-label="${escTeam(window.KiwiCaisseLang?.tr('Historique') || 'Historique')}"><table class="sk-tbl"><thead><tr><th>#</th><th>Fournisseur</th><th>Articles</th><th>Total</th><th>Statut</th></tr></thead><tbody>${past.map(o=>`<tr><td class="sk-mono">#${o.id}</td><td>${kdsEsc(o.supplier)}</td><td>${o.items.length} article${o.items.length>1?'s':''}</td><td class="sk-mono">${fmtMAD(o.total)}</td><td><span class="sk-status ok"><span class="sd"></span>Reçue</span></td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
    }

    function renderSkInventaire(){
      return `
        <div class="sk-section" style="padding:28px 16px;text-align:center;">
          <div style="width:56px;height:56px;border-radius:16px;background:rgba(5,150,105,0.1);color:#059669;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:28px;">
            <i data-lucide="clipboard-check"></i>
          </div>
          <h3 style="font-size:18px;margin-bottom:6px;">Inventaire physique à l'aveugle</h3>
          <p style="font-size:13.5px;color:var(--n-600);max-width:500px;margin:0 auto 18px;">
            Comptez les quantités réelles en rayon ou en réserve sans biais visuel. Votre saisie sera transmise au propriétaire pour revue et validation.
          </p>
          <div style="display:flex;gap:10px;justify-content:center;">
            <button class="ma-btn primary" id="sk-start-blind-count" data-sk-blind-count style="background:#059669;border-color:#047857;padding:12px 24px;font-size:15px;border-radius:12px;font-weight:600;">
              <i data-lucide="scan-barcode"></i>Démarrer le comptage aveugle
            </button>
          </div>
        </div>
      `;
    }

    /* ---- stock modal (edit · add · new order) ---- */
    function openSkModal(html){ $('#sk-modal-box').innerHTML = html; $('#sk-modal').classList.add('is-open'); if (window.lucide) lucide.createIcons(); }
    function closeSkModal(){ $('#sk-modal').classList.remove('is-open'); }
    function skSupplierOptions(sel){ return suppliers.map(s=>`<option value="${kdsEsc(s.name)}" ${s.name===sel?'selected':''}>${kdsEsc(s.name)}</option>`).join(''); }
    function skCatOptions(sel){ return Object.entries(SK_CATS).map(([v,l])=>`<option value="${v}" ${v===sel?'selected':''}>${l}</option>`).join(''); }

    function openEditItem(id){
      toast('Les articles et prix se gèrent dans le tableau de bord.');
      return;
      const it = stockItems.find(i=>i.id===id); if (!it) return;
      openSkModal(`<div class="split-badge">Article</div><h3 class="modal-title" style="margin-bottom:12px;">${kdsEsc(it.name)}</h3>
        <div class="sk-field-row">
          <div class="sk-field"><label>Stock actuel (${it.unit})</label><input class="sk-input" id="sk-f-stock" type="number" min="0" value="${it.stock}"></div>
          <div class="sk-field"><label>Niveau par (${it.unit})</label><input class="sk-input" id="sk-f-par" type="number" min="0" value="${it.par}"></div>
        </div>
        <div class="sk-field-row">
          <div class="sk-field"><label>Seuil d'alerte</label><input class="sk-input" id="sk-f-reorder" type="number" min="0" value="${it.reorder}"></div>
          <div class="sk-field"><label>Coût/${it.unit} (MAD)</label><input class="sk-input" id="sk-f-cost" type="number" min="0" value="${it.cost}"></div>
        </div>
        <div class="nt-actions"><button class="ma-btn secondary" data-sk-cancel style="flex:1;">Annuler</button><button class="ma-btn primary" data-sk-save-item="${it.id}" style="flex:2;"><i data-lucide="check"></i>Enregistrer</button></div>`);
    }
    function saveEditItem(id){
      toast('Les articles et prix se gèrent dans le tableau de bord.');
      return;
      const it = stockItems.find(i=>i.id===id); if (!it) return;
      const patch = {
        stock: Math.max(0, parseFloat($('#sk-f-stock').value) || 0),
        par: Math.max(0, parseFloat($('#sk-f-par').value) || 0),
        reorder: Math.max(0, parseFloat($('#sk-f-reorder').value) || 0),
        cost: Math.max(0, parseFloat($('#sk-f-cost').value) || 0),
      };
      if (storeIsReal() && window.KiwiCaisseStock) window.KiwiCaisseStock.updateItem(id, patch);
      else Object.assign(it, patch);
      syncSharedStock(false);
      closeSkModal(); renderStock(); toast(`${it.name} mis à jour`);
    }
    function openAddItem(){
      toast('Ajoutez les articles et prix depuis le tableau de bord.');
      return;
      openSkModal(`<div class="split-badge">Nouvel article</div><h3 class="modal-title" style="margin-bottom:12px;">Ajouter un article</h3>
        <div class="sk-field"><label>Nom</label><input class="sk-input" id="sk-f-name" placeholder="ex. Citrons confits" autocomplete="off"></div>
        <div class="sk-field-row">
          <div class="sk-field"><label>Catégorie</label><select class="sk-select" id="sk-f-cat">${skCatOptions('legumes')}</select></div>
          <div class="sk-field"><label>Unité</label><input class="sk-input" id="sk-f-unit" value="kg"></div>
        </div>
        <div class="sk-field"><label>Fournisseur</label><select class="sk-select" id="sk-f-supplier">${skSupplierOptions((suppliers[0] || {}).name || '')}</select></div>
        <div class="sk-field-row">
          <div class="sk-field"><label>Stock</label><input class="sk-input" id="sk-f-stock" type="number" min="0" value="0"></div>
          <div class="sk-field"><label>Par</label><input class="sk-input" id="sk-f-par" type="number" min="0" value="10"></div>
          <div class="sk-field"><label>Coût (MAD)</label><input class="sk-input" id="sk-f-cost" type="number" min="0" value="0"></div>
        </div>
        <div class="nt-actions"><button class="ma-btn secondary" data-sk-cancel style="flex:1;">Annuler</button><button class="ma-btn primary" data-sk-add-save style="flex:2;"><i data-lucide="plus"></i>Ajouter</button></div>`);
    }
    function saveNewItem(){
      toast('Ajoutez les articles et prix depuis le tableau de bord.');
      return;
      const name = ($('#sk-f-name').value || '').trim();
      if (!name){ $('#sk-f-name').focus(); toast("Donne un nom à l'article"); return; }
      const par = Math.max(0, parseInt($('#sk-f-par').value) || 0);
      const item = { id:'usr-'+Date.now().toString(36), name, cat:$('#sk-f-cat').value, unit:($('#sk-f-unit').value||'unité').trim(),
        supplier:$('#sk-f-supplier').value, stock:Math.max(0, parseInt($('#sk-f-stock').value)||0),
        par, reorder:Math.max(1, Math.round(par * 0.4)), cost:Math.max(0, parseFloat($('#sk-f-cost').value)||0) };
      if (storeIsReal() && window.KiwiCaisseStock) window.KiwiCaisseStock.addItem(item);
      else stockItems.push(item);
      syncSharedStock(false);
      closeSkModal(); stockTab = 'articles'; renderStock(); toast(`${name} ajouté au stock`);
    }

    function skOrderLinesHTML(supplierName, prefillId){
      const items = stockItems.filter(i => i.supplier === supplierName);
      if (!items.length) return `<div class="sk-empty" style="padding:14px 0">Aucun article pour ce fournisseur.</div>`;
      return items.map(it=>{
        const sugg = (prefillId === it.id) ? Math.max(1, it.par - it.stock) : 0;
        return `<div class="sk-ord-line"><span class="sk-ord-line-name">${kdsEsc(it.name)} <small>${it.stock}/${it.par} ${it.unit}</small></span><input class="sk-count-input" type="number" min="0" data-sk-oline="${it.id}" value="${sugg}"><span class="sk-unit">${it.unit}</span></div>`;
      }).join('');
    }
    function openNewOrder(prefillSupplier, prefillId){
      const sup = prefillSupplier || (suppliers[0] || {}).name || '';
      openSkModal(`<div class="split-badge">Approvisionnement</div><h3 class="modal-title" style="margin-bottom:12px;">Nouvelle commande</h3>
        <div class="sk-field"><label>Fournisseur</label><select class="sk-select" id="sk-order-supplier">${skSupplierOptions(sup)}</select></div>
        <div class="sk-field"><label>Articles &amp; quantités</label><div id="sk-order-lines">${skOrderLinesHTML(sup, prefillId)}</div></div>
        <div class="nt-actions"><button class="ma-btn secondary" data-sk-cancel style="flex:1;">Annuler</button><button class="ma-btn primary" data-sk-create-order style="flex:2;"><i data-lucide="check"></i>Créer la commande</button></div>`);
    }
    function createOrder(){
      const supplier = $('#sk-order-supplier').value;
      const lines = []; let total = 0;
      $$('#sk-order-lines [data-sk-oline]').forEach(inp=>{
        const qty = parseInt(inp.value) || 0;
        if (qty > 0){ const it = stockItems.find(i => i.id === inp.dataset.skOline); if (it){ lines.push({ name:it.name, qty, unit:it.unit }); total += qty * it.cost; } }
      });
      if (!lines.length){ toast('Ajoute au moins une quantité'); return; }
      supplyOrders.unshift({ id:String(++skOrderSeq), supplier, items:lines, total:Math.round(total), status:'en-attente', when:'À planifier' });
      closeSkModal(); stockTab = 'appro'; renderStock(); toast(`Commande #${skOrderSeq} créée · ${supplier}`);
    }
    function confirmOrder(id){ const o = supplyOrders.find(x=>x.id===id); if (!o) return; o.status = 'confirmee'; renderStock(); toast(`Commande #${id} confirmée`); }
    function receiveOrder(id){
      const o = supplyOrders.find(x=>x.id===id); if (!o) return;
      let added = 0, failed = false;
      const receiptRef = 'purchase-' + id;
      o.items.forEach((li, lineIndex)=>{ const it = stockItems.find(i => i.name === li.name); if (it){
        if (storeIsReal() && window.KiwiCaisseStock) {
          const card = window.KiwiCaisseStock.resolveSupplierCard ? window.KiwiCaisseStock.resolveSupplierCard(it.id, o.supplier) : null;
          const supRank = card && card.rank != null ? card.rank : 999;
          const supId = card && card.id ? card.id : (o.supplier ? 'sup-' + Date.now().toString(36) : '');
          const factor = card && card.factor > 0 ? card.factor : 1;
          const stockQty = Math.round(li.qty * factor * 1000) / 1000;
          const unitCost = card && card.defaultPrice != null ? card.defaultPrice : (it.cost || null);
          const meta = {
            supplierId: supId,
            supplierName: o.supplier || '',
            rank: supRank,
            receiptRef: receiptRef,
            operationId: 'order:' + id + ':line:' + lineIndex,
            receivedAt: Date.now(),
            purchaseQty: li.qty,
            purchaseUnit: card?.purchaseUnit || it.unit || 'unité',
            factor: factor,
          };
          const movement = window.KiwiCaisseStock.move(it.id, stockQty, 'receipt', 'order:' + id + ':line:' + lineIndex, unitCost, meta);
          if (!movement) { failed = true; return; }
        }
        else it.stock += li.qty;
        added++;
      } });
      if (failed) { toast(added ? 'Réception partielle · relance la même réception pour reprendre les lignes acceptées' : 'Réception refusée · vérifie la référence et la quantité'); return; }
      o.status = 'recue'; o.when = 'Reçue';
      syncSharedStock(false);
      renderStock(); toast(`Commande #${id} reçue · ${added} article${added>1?'s':''} réapprovisionné${added>1?'s':''}`);
    }
    function validateInventory(){
      if (window.KiwiPosInventoryCount) {
        window.KiwiPosInventoryCount.open({ engine: 'ledger' });
      } else if (storeIsReal() && window.KiwiCaisseStock && window.KiwiCaisseStock.count) {
        // Fallback si module non chargé
      }
    }

    
    function stockIntentId(prefix){
      try { if (window.crypto && window.crypto.randomUUID) return prefix + ':' + window.crypto.randomUUID(); } catch (_) {}
      return prefix + ':' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2, 14);
    }
    function openRecept(){ skReceptMode = 'photo'; skReceptState = 'idle'; skReceptLines = []; skReceptPhoto = null; skReceptSupplier = ''; skReceptRef = ''; skReceptIntentId = stockIntentId('receipt'); openSkModal(renderReceptModal()); }
    function renderReceptModal(){
      const sups = storeIsReal() && window.KiwiCaisseStock?.suppliers ? window.KiwiCaisseStock.suppliers() : [];
      const supOptions = (Array.isArray(sups) ? sups : []).map(s => `<option value="${kdsEsc(s.name || s)}">`).join('');
      return `<div class="split-badge">Réception</div><h3 class="modal-title" style="margin-bottom:4px;">Entrer du stock</h3>
        <p class="modal-subtle" style="margin:0 0 14px;">Sélectionne le fournisseur, renseigne les quantités reçues et vérifie le prix unitaire facturé.</p>
        <div class="sk-field" style="margin-bottom:10px;">
          <label style="font-size:12px;font-weight:600;color:var(--n-600);display:block;margin-bottom:4px;">Fournisseur &amp; Réf. bon</label>
          <div style="display:flex;gap:8px;">
            <input class="sk-input" id="sk-recept-sup" placeholder="Fournisseur…" list="sk-sup-list" value="${kdsEsc(skReceptSupplier || '')}" style="flex:2;" autocomplete="off">
            <datalist id="sk-sup-list">${supOptions}</datalist>
            <input class="sk-input" id="sk-recept-ref" placeholder="Réf. bon / facture" value="${kdsEsc(skReceptRef || '')}" style="flex:1;">
          </div>
        </div>
        <div class="sk-recept-modes">
          <button class="sk-rmode ${skReceptMode==='photo'?'on':''}" data-sk-rmode="photo"><i data-lucide="scan-line"></i>Photo du bon</button>
          <button class="sk-rmode ${skReceptMode==='manual'?'on':''}" data-sk-rmode="manual"><i data-lucide="keyboard"></i>Saisie manuelle</button>
        </div>
        <div id="sk-recept-body">${skReceptBodyHTML()}</div>`;
    }
    function skReceptBodyHTML(){
      if (skReceptMode === 'photo'){
        if (skReceptState === 'idle')
          return `<div class="sk-dropzone"><i data-lucide="receipt-text"></i><div class="sk-dz-t">Photo du bon de livraison</div><div class="sk-dz-s">Prends une photo ou importe le reçu ; elle restera la référence de cette réception.</div><button class="ma-btn primary sk-mini" data-sk-scan style="margin-top:6px"><i data-lucide="camera"></i>Prendre / importer</button></div>`;
        if (skReceptState === 'scanning')
          return `<div class="sk-scanning"><div class="sk-spinner"></div>Analyse du bon…</div>`;
        return `<div class="sk-recept-note"><i data-lucide="check-circle-2"></i>Bon joint comme référence. Saisis les articles et vérifie les quantités.</div>${skReceptPhoto ? `<img src="${skReceptPhoto.dataUrl}" alt="Bon de livraison" style="display:block;width:100%;max-height:150px;object-fit:contain;border:1px solid var(--line);border-radius:12px;margin:10px 0;">` : ''}${skReceptLinesHTML()}${skReceptFootHTML()}`;
      }
      return skReceptLinesHTML() + `<div class="sk-rline-add" data-sk-rline-add><i data-lucide="plus"></i>Ajouter une ligne</div>` + skReceptFootHTML();
    }
    function skReceptLinesHTML(){
      if (!skReceptLines.length) skReceptLines = [{ name:'', qty:'', cost:'' }];
      return skReceptLines.map((l,idx)=>{
        const it = stockItems.find(i => i.name.toLowerCase() === (l.name || '').toLowerCase());
        const unit = it ? it.unit : 'unité';
        const costVal = l.cost !== '' && l.cost != null ? l.cost : (it && it.cost != null ? it.cost : '');
        return `<div class="sk-rline" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
          <input class="sk-rl-name" data-sk-rl-name="${idx}" placeholder="Article" value="${kdsEsc(l.name)}" list="sk-items-list" autocomplete="off" style="flex:2;">
          <div style="display:flex;align-items:center;gap:4px;flex:1.2;">
            <input class="sk-rl-qty" data-sk-rl-qty="${idx}" type="number" min="0" step="any" placeholder="Qté" value="${l.qty}" style="width:100%;">
            <span style="font-size:11px;color:var(--n-500);white-space:nowrap;">${kdsEsc(unit)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:4px;flex:1.4;">
            <input class="sk-rl-cost" data-sk-rl-cost="${idx}" type="number" min="0" step="any" placeholder="Prix unit." value="${costVal}" style="width:100%;">
            <span style="font-size:11px;color:var(--n-500);white-space:nowrap;">MAD</span>
          </div>
          <input class="sk-rl-dlc" data-sk-rl-dlc="${idx}" type="date" title="DLC / DDM (optionnel)" value="${kdsEsc(l.dlc || '')}" style="flex:1.3;min-width:0;">
          <button class="sk-rl-del" data-sk-rl-del="${idx}" aria-label="Retirer"><i data-lucide="x"></i></button>
        </div>`;
      }).join('') + `<datalist id="sk-items-list">${stockItems.map(i=>`<option value="${kdsEsc(i.name)}">`).join('')}</datalist>`;
    }
    function skReceptFootHTML(){
      return `<div class="nt-actions" style="margin-top:14px"><button class="ma-btn secondary" data-sk-cancel style="flex:1;">Annuler</button><button class="ma-btn primary" data-sk-commit-recept style="flex:2;"><i data-lucide="plus-circle"></i>Ajouter au stock</button></div>`;
    }
    function refreshReceptModal(){ $('#sk-modal-box').innerHTML = renderReceptModal(); if (window.lucide) lucide.createIcons(); }
    function rerenderReceptBody(){ const b = $('#sk-recept-body'); if (b){ b.innerHTML = skReceptBodyHTML(); if (window.lucide) lucide.createIcons(); } }
    async function skScan(){
      if (!window.KiwiImageProof){ toast('Appareil photo indisponible'); return; }
      try {
        const photo = await KiwiImageProof.pick({ maxDimension: 960, quality: 0.72 });
        if (!photo) return;
        skReceptPhoto = photo;
        skReceptLines = [{ name:'', qty:'', cost:'' }];
        skReceptState = 'done'; rerenderReceptBody();
      } catch (_){ toast('Photo non jointe · vérifie l’accès à l’appareil'); }
    }
    function commitRecept(){
      const supInput = $('#sk-recept-sup');
      const refInput = $('#sk-recept-ref');
      const supplier = (supInput ? supInput.value : skReceptSupplier || '').trim();
      const externalRef = (refInput ? refInput.value : skReceptRef || '').trim();

      if (!supplier) {
        toast('Indique le fournisseur pour enregistrer la réception');
        if (supInput) supInput.focus();
        return;
      }

      $$('#sk-recept-body .sk-rline').forEach((row,idx)=>{
        const n = row.querySelector('[data-sk-rl-name]');
        const q = row.querySelector('[data-sk-rl-qty]');
        const c = row.querySelector('[data-sk-rl-cost]');
        const dl = row.querySelector('[data-sk-rl-dlc]');
        if (skReceptLines[idx]){
          skReceptLines[idx].name = (n ? n.value : '').trim();
          skReceptLines[idx].qty = q ? q.value : '';
          skReceptLines[idx].cost = c && c.value !== '' ? parseFloat(c.value) : null;
          skReceptLines[idx].dlc = dl ? dl.value : '';
        }
      });
      let added = 0, unknown = 0, failed = false;
      const receiptIntentId = skReceptIntentId || (skReceptIntentId = stockIntentId('receipt'));
      skReceptLines.forEach((l, lineIndex)=>{
        const qty = parseFloat(l.qty) || 0; const name = (l.name || '').trim();
        if (!name || qty <= 0) return;
        const it = stockItems.find(i => i.name.toLowerCase() === name.toLowerCase());
        if (it){
          if (storeIsReal() && window.KiwiCaisseStock) {
            const card = window.KiwiCaisseStock.resolveSupplierCard ? window.KiwiCaisseStock.resolveSupplierCard(it.id, supplier) : null;
            const supRank = card && card.rank != null ? card.rank : 999;
            const supId = card && card.id ? card.id : (supplier ? 'sup-' + Date.now().toString(36) : '');
            const factor = card && card.factor > 0 ? card.factor : 1;
            const stockQty = Math.round(qty * factor * 1000) / 1000;
            const unitCost = l.cost != null && !isNaN(l.cost) && l.cost >= 0
              ? Math.round((l.cost / factor) * 10000) / 10000
              : (card && card.defaultPrice != null ? card.defaultPrice : (it.cost || null));

            const meta = {
              supplierId: supId,
              supplierName: supplier,
              rank: supRank,
              externalRef: externalRef,
              receiptRef: externalRef || receiptIntentId,
              operationId: receiptIntentId + ':line:' + lineIndex,
              receivedAt: Date.now(),
              purchaseQty: qty,
              purchaseUnit: card?.purchaseUnit || it.unit || 'unité',
              factor: factor,
              // DLC / DDM du lot reçu · lue par KiwiInventoryConsumption.expiring()
              expiresAt: l.dlc ? new Date(l.dlc + 'T23:59:59').getTime() : null,
            };
            const movement = window.KiwiCaisseStock.move(it.id, stockQty, 'receipt', receiptIntentId + ':line:' + lineIndex, unitCost, meta);
            if (!movement) { failed = true; return; }
            if (unitCost != null && unitCost > 0 && window.KiwiCaisseStock.updateSupplierPrice) {
              window.KiwiCaisseStock.updateSupplierPrice(it.id, supplier, unitCost);
            }
          } else {
            it.stock += qty;
            if (l.cost != null && l.cost > 0) it.cost = l.cost;
          }
          added++;
        }
        else unknown++;
      });
      if (failed){
        toast(added ? 'Réception partielle · relance la même réception pour reprendre les lignes acceptées' : 'Réception refusée · vérifie la référence et la quantité');
        return;
      }
      if (!added){
        toast(unknown ? 'Article inconnu · créez-le dans le tableau de bord avant la réception.' : 'Aucune ligne valide');
        return;
      }
      syncSharedStock(false); closeSkModal(); stockTab = 'articles'; renderStock();
      toast(`Stock mis à jour · ${added} article${added>1?'s':''}`);
    }

    /* ---- Pertes de stock (Waste Management) ---- */
    function openWasteModal(prefillItemId, prefillLotId, prefillQty, prefillReason){
      skWasteIntentId = stockIntentId('waste');
      const items = stockItems.slice();
      const selItem = prefillItemId ? items.find(i => i.id === prefillItemId) : items[0];
      const selId = selItem ? selItem.id : (items[0] ? items[0].id : '');
      const unit = selItem ? selItem.unit : 'unité';
      const initialQty = prefillQty != null ? prefillQty : '';
      const initialReason = prefillReason || 'casse';
      const initialLot = prefillLotId || '';
      
      const itemOptions = items.map(it => `<option value="${it.id}" ${it.id === selId ? 'selected' : ''}>${kdsEsc(it.name)} (${it.stock} ${it.unit} en stock)</option>`).join('');
      
      const cashierName = (currentCashier && currentCashier.name) || 'Caissier';
      const now = new Date();
      const nowISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

      const html = `
        <div class="split-badge" style="background:rgba(220,38,38,0.12);color:#991b1b;"><i data-lucide="trash-2"></i> Perte de stock</div>
        <h3 class="modal-title" style="margin-bottom:6px;">Déclarer une perte</h3>
        <p class="modal-subtle" style="margin:0 0 16px;">Enregistre les produits sortis pour casse, péremption, avarie ou repas équipe. Le stock sera déduit immédiatement.</p>
        
        <div class="sk-field" style="margin-bottom:12px;">
          <label style="font-size:12px;font-weight:600;color:var(--n-600);display:block;margin-bottom:4px;">Article / Ingrédient</label>
          <select class="sk-select" id="sk-w-item" style="width:100%;">${itemOptions}</select>
        </div>

        <div class="sk-field-row" style="display:flex;gap:10px;margin-bottom:12px;">
          <div class="sk-field" style="flex:1;">
            <label style="font-size:12px;font-weight:600;color:var(--n-600);display:block;margin-bottom:4px;">Quantité perdue</label>
            <div style="display:flex;align-items:center;gap:6px;">
              <input class="sk-input" id="sk-w-qty" type="number" min="0.001" step="any" placeholder="0" value="${initialQty}" style="flex:1;">
              <span id="sk-w-unit" style="font-size:13px;font-weight:600;color:var(--n-700);">${kdsEsc(unit)}</span>
            </div>
          </div>
          <div class="sk-field" style="flex:1.2;">
            <label style="font-size:12px;font-weight:600;color:var(--n-600);display:block;margin-bottom:4px;">Motif</label>
            <select class="sk-select" id="sk-w-reason" style="width:100%;">
              <option value="perime" ${initialReason==='perime'?'selected':''}>Périmé (DLC dépassée)</option>
              <option value="casse" ${initialReason==='casse'?'selected':''}>Casse</option>
              <option value="avarie" ${initialReason==='avarie'?'selected':''}>Avarié / Abîmé</option>
              <option value="offert" ${initialReason==='offert'?'selected':''}>Offert / Geste commercial</option>
              <option value="repas-equipe" ${initialReason==='repas-equipe'?'selected':''}>Repas équipe</option>
              <option value="autre" ${initialReason==='autre'?'selected':''}>Autre perte</option>
            </select>
          </div>
        </div>

        <div class="sk-field-row" style="display:flex;gap:10px;margin-bottom:12px;">
          <div class="sk-field" style="flex:1;">
            <label style="font-size:12px;font-weight:600;color:var(--n-600);display:block;margin-bottom:4px;">Lot / Réf. (optionnel)</label>
            <input class="sk-input" id="sk-w-lot" placeholder="Ex: LOT-2026-08" value="${kdsEsc(initialLot)}" style="width:100%;">
          </div>
          <div class="sk-field" style="flex:1;">
            <label style="font-size:12px;font-weight:600;color:var(--n-600);display:block;margin-bottom:4px;">Date &amp; Heure</label>
            <input class="sk-input" id="sk-w-time" type="datetime-local" value="${nowISO}" style="width:100%;">
          </div>
        </div>

        <div class="sk-field" style="margin-bottom:12px;">
          <label style="font-size:12px;font-weight:600;color:var(--n-600);display:block;margin-bottom:4px;">Employé</label>
          <input class="sk-input" value="${kdsEsc(cashierName)}" readonly style="width:100%;background:var(--n-100);cursor:not-allowed;">
        </div>

        <div class="sk-field" style="margin-bottom:16px;">
          <label style="font-size:12px;font-weight:600;color:var(--n-600);display:block;margin-bottom:4px;">Note ou commentaire (optionnel)</label>
          <input class="sk-input" id="sk-w-note" placeholder="Détails sur la perte…" maxlength="500" style="width:100%;">
        </div>

        <div class="nt-actions" style="display:flex;gap:8px;">
          <button class="ma-btn secondary" data-sk-cancel style="flex:1;">Annuler</button>
          <button class="ma-btn primary" id="sk-commit-waste-btn" data-sk-commit-waste style="flex:2;background:#dc2626;border-color:#b91c1c;"><i data-lucide="trash-2"></i>Confirmer la perte</button>
        </div>
      `;
      openSkModal(html);
      
      const itemSel = $('#sk-w-item');
      if (itemSel) {
        itemSel.addEventListener('change', () => {
          const chosen = stockItems.find(i => i.id === itemSel.value);
          const uEl = $('#sk-w-unit');
          if (chosen && uEl) uEl.textContent = chosen.unit;
        });
      }
    }

    function commitWaste(){
      const itemSel = $('#sk-w-item');
      const itId = itemSel ? itemSel.value : '';
      const it = stockItems.find(i => i.id === itId);
      if (!it) { toast('Sélectionne un article'); return; }
      const qty = parseFloat($('#sk-w-qty').value) || 0;
      if (qty <= 0) { toast('Indique une quantité valide'); return; }
      if (qty > it.stock) {
        if (!confirm(`La quantité saisie (${qty} ${it.unit}) est supérieure au stock disponible (${it.stock} ${it.unit}). Confirmer quand même ?`)) {
          return;
        }
      }
      const fineReason = $('#sk-w-reason').value || 'casse';
      const ledgerReasonMap = {
        'perime': 'expiry',
        'casse': 'loss',
        'avarie': 'loss',
        'offert': 'gift',
        'repas-equipe': 'staff-meal',
        'autre': 'loss'
      };
      const ledgerReason = ledgerReasonMap[fineReason] || 'loss';
      const lotId = ($('#sk-w-lot').value || '').trim();
      const note = ($('#sk-w-note').value || '').trim();
      const timeVal = $('#sk-w-time').value;
      let occurredTs = Date.now();
      if (timeVal) {
        const parsed = new Date(timeVal).getTime();
        if (!isNaN(parsed) && parsed > 0) occurredTs = parsed;
      }
      
      let unitCost = it.cost || null;
      if (window.KiwiInventoryConsumption && window.KiwiInventoryConsumption.allocateCost) {
        const alloc = window.KiwiInventoryConsumption.allocateCost(it.id, qty, it.cost);
        if (alloc != null) unitCost = alloc;
      } else if (window.KiwiInventoryConsumption && window.KiwiInventoryConsumption.deriveLots) {
        const lots = window.KiwiInventoryConsumption.deriveLots(it.id) || [];
        if (lots.length && lots[0].unitCost != null) unitCost = lots[0].unitCost;
      }

      const wasteRef = skWasteIntentId || (skWasteIntentId = stockIntentId('waste'));
      const meta = {
        operationId: wasteRef,
        wasteReason: fineReason,
        lotId: lotId || undefined,
        actorId: (currentCashier && currentCashier.id) || '',
        note: note || undefined,
      };
      
      if (storeIsReal() && window.KiwiCaisseStock) {
        const movement = window.KiwiCaisseStock.move(it.id, -qty, ledgerReason, wasteRef, unitCost, meta, currentCashier);
        if (!movement) { toast('Perte refusée · la quantité ou le lot a changé'); return; }
      } else if (window.KiwiInventory && window.KiwiInventory.add) {
        window.KiwiInventory.add({
          itemId: it.id,
          qty: -qty,
          reason: ledgerReason,
          refType: 'waste',
          refId: wasteRef,
          note: note || 'Déclaration de perte',
          unitCost: unitCost,
          actor: (currentCashier && currentCashier.name) || 'Caissier',
          occurredTs: occurredTs,
          meta: meta
        });
        it.stock = Math.max(0, it.stock - qty);
      } else {
        it.stock = Math.max(0, it.stock - qty);
      }
      
      syncSharedStock(false);
      closeSkModal();
      renderStock();
      toast(`Perte de ${qty} ${it.unit} enregistrée`);
    }

    /* ---- open / close + delegation ---- */
    function openStock(){
      bindSharedStock(); syncSharedStock(false); renderStock();
      $('#stock-screen').classList.add('is-open');
      if (window.lucide) lucide.createIcons();
      /* Opening Stock is also a manual freshness boundary. The local ledger
       * renders immediately; the shared cloud document then reconciles any
       * dashboard edits made on another tab or device. */
      if (storeIsReal() && window.KiwiCaisseStock?.pull) {
        window.KiwiCaisseStock.pull().then(()=>{ syncSharedStock(false); renderStock(); }).catch(()=>{});
      }
    }
    function closeStock(){ $('#stock-screen').classList.remove('is-open'); }
    
