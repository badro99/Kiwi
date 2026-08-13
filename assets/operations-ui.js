/* Kiwi Operations UI — small real workflows on existing dashboard controls.
 * Loaded last, after the legacy demo handlers, so real merchants never see a
 * decorative success. Demo fixtures remain available only in demo mode. */
(function () {
  'use strict';
  function boot() {
    if (!window.Kiwi || !window.Kiwi.handlers || !window.KiwiOperations) return setTimeout(boot, 80);
    var Kiwi = window.Kiwi, H = Kiwi.handlers, O = window.KiwiOperations, K = window.KiwiPlatform;
    function lang() { var value = window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang(); return value === 'en' || value === 'ar' ? value : 'fr'; }
    function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
    function real() { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal() || window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()); } catch (_) { return true; } }
    function text() {
      return ({
        fr: {
          blocked:'Action conservée, connexion requise', blockedD:'Le fournisseur nécessaire n’est pas configuré. Rien n’a été annoncé comme envoyé.',
          queued:'Action protégée hors ligne', queuedD:'Kiwi la synchronisera avec le même identifiant dès le retour du réseau.',
          draft:'Brouillon enregistré', draftD:'Le document est durable et reste modifiable avant validation.',
          prepared:'Fichier préparé', preparedD:'Le document est prêt. Aucun destinataire n’a été contacté.',
          payment:'Créer un lien de paiement', amount:'Montant · MAD', desc:'Motif', customer:'Client (facultatif)', create:'Créer le lien',
          unavailable:'Fournisseur de paiement non configuré', unavailableD:'Kiwi a gardé la demande, mais aucun lien n’a été inventé.',
          supplier:'Nouveau bon de commande', supplierPick:'Fournisseur', item:'Article / matière', qty:'Quantité', cost:'Coût unitaire · MAD', due:'Livraison souhaitée', note:'Note', save:'Enregistrer le brouillon',
          needSupplier:'Ajoutez d’abord un fournisseur dans Approvisionnement.', invalid:'Complétez les champs obligatoires.',
          history:'Activité opérationnelle', empty:'Aucune action enregistrée pour le moment.', openOps:'Voir l’activité',
        },
        en: {
          blocked:'Action retained; connection required', blockedD:'The required provider is not configured. Nothing was reported as sent.',
          queued:'Action protected offline', queuedD:'Kiwi will sync it under the same ID when the network returns.',
          draft:'Draft saved', draftD:'The document is durable and editable before approval.',
          prepared:'File prepared', preparedD:'The document is ready. No recipient was contacted.',
          payment:'Create a payment link', amount:'Amount · MAD', desc:'Description', customer:'Customer (optional)', create:'Create link',
          unavailable:'Payment provider not configured', unavailableD:'Kiwi kept the request but did not invent a link.',
          supplier:'New purchase order', supplierPick:'Supplier', item:'Item / material', qty:'Quantity', cost:'Unit cost · MAD', due:'Expected delivery', note:'Note', save:'Save draft',
          needSupplier:'Add a supplier in Procurement first.', invalid:'Complete the required fields.',
          history:'Operational activity', empty:'No operational activity yet.', openOps:'View activity',
        },
        ar: {
          blocked:'تم حفظ العملية وتحتاج إلى ربط', blockedD:'المزوّد المطلوب غير مهيأ. لم يدّع Kiwi إرسال أي شيء.',
          queued:'تم حفظ العملية دون اتصال', queuedD:'سيزامنها Kiwi بنفس المعرّف عند عودة الشبكة.',
          draft:'تم حفظ المسودة', draftD:'الوثيقة محفوظة وقابلة للتعديل قبل الاعتماد.',
          prepared:'تم إعداد الملف', preparedD:'الوثيقة جاهزة ولم يتم الاتصال بأي مستلم.',
          payment:'إنشاء رابط دفع', amount:'المبلغ · درهم', desc:'السبب', customer:'العميل (اختياري)', create:'إنشاء الرابط',
          unavailable:'مزوّد الدفع غير مهيأ', unavailableD:'حفظ Kiwi الطلب ولم يخترع رابطًا.',
          supplier:'أمر شراء جديد', supplierPick:'المورد', item:'المادة', qty:'الكمية', cost:'ثمن الوحدة · درهم', due:'موعد التسليم', note:'ملاحظة', save:'حفظ المسودة',
          needSupplier:'أضف موردًا في التوريد أولًا.', invalid:'أكمل الحقول المطلوبة.',
          history:'سجل العمليات', empty:'لا توجد عمليات بعد.', openOps:'عرض السجل',
        },
      })[lang()];
    }
    function toastResult(result) {
      var c = text(), cmd = result && result.command || {};
      if (result && result.offline) return Kiwi.toast(c.queued, { type:'info', desc:c.queuedD });
      if (cmd.status === 'blocked' || cmd.status === 'failed') return Kiwi.toast(c.blocked, { type:'warning', desc:(cmd.lastError ? cmd.lastError + ' · ' : '') + c.blockedD });
      if (cmd.status === 'prepared') return Kiwi.toast(c.prepared, { type:'info', desc:c.preparedD });
      if (cmd.status === 'draft') return Kiwi.toast(c.draft, { type:'success', desc:c.draftD });
      if (cmd.status === 'active' && cmd.result && cmd.result.url) {
        Kiwi.modal({ tag:'KIWI PAY', title:c.payment, width:520, body:'<div class="p-card"><div style="font-size:12px;color:var(--n-500);margin-bottom:8px;">Lien vérifié par le fournisseur</div><a href="'+esc(cmd.result.url)+'" target="_blank" rel="noopener" style="font-size:14px;color:var(--atlas);overflow-wrap:anywhere;">'+esc(cmd.result.url)+'</a></div>' });
        return;
      }
      Kiwi.toast(c.draft, { type:'success', desc:c.draftD });
    }
    function fail(error) {
      var c = text(), code = error && (error.code || error.message) || 'operation-failed';
      Kiwi.toast(code === 'permission-denied' || code === 'owner-session-required' ? 'Accès refusé' : c.blocked, { type:'warning', desc:code });
    }

    var legacyPayment = H['payment-link'];
    H['payment-link'] = function () {
      if (!real() && legacyPayment) return legacyPayment.apply(this, arguments);
      var c = text();
      var modal = Kiwi.modal({ tag:'KIWI PAY', title:c.payment, desc:'Le lien n’apparaît qu’après confirmation du fournisseur.', width:520,
        body:'<div class="kf-grid">' +
          '<label><span class="l">'+c.amount+'</span><input type="number" min="1" max="10000000" step="0.01" data-op-amount></label>' +
          '<label><span class="l">'+c.customer+'</span><input maxlength="160" data-op-customer></label>' +
          '<label style="grid-column:1/-1"><span class="l">'+c.desc+'</span><input maxlength="240" data-op-desc></label>' +
          '</div><button class="kb atlas" style="width:100%;justify-content:center;margin-top:14px" type="button" data-op-payment>'+c.create+'</button>' });
      modal.el.querySelector('[data-op-payment]').addEventListener('click', async function () {
        var amount = Number(modal.el.querySelector('[data-op-amount]').value);
        if (!(amount > 0)) return Kiwi.toast(c.invalid, { type:'warning' });
        this.disabled = true;
        try {
          var result = await O.create('payment', 'create-link', { amount:amount, currency:'MAD', customer:modal.el.querySelector('[data-op-customer]').value, description:modal.el.querySelector('[data-op-desc]').value });
          modal.close(); toastResult(result);
        } catch (error) { this.disabled = false; fail(error); }
      });
    };

    H['supplier-new-po'] = function () {
      var c = text(), P = window.KiwiProcurement, doc = P && P.doc && P.doc();
      if (!P || !doc || !(doc.suppliers || []).length) return Kiwi.toast(c.needSupplier, { type:'warning' });
      var options = doc.suppliers.filter(function (s) { return s.active !== false; }).map(function (s) { return '<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>'; }).join('');
      var modal = Kiwi.modal({ tag:'APPROVISIONNEMENT', title:c.supplier, width:620, body:'<div class="kf-grid">' +
        '<label><span class="l">'+c.supplierPick+'</span><select data-po-supplier>'+options+'</select></label>' +
        '<label><span class="l">'+c.due+'</span><input type="date" data-po-date></label>' +
        '<label><span class="l">'+c.item+'</span><input maxlength="120" data-po-name></label>' +
        '<label><span class="l">ID / SKU</span><input maxlength="80" data-po-item></label>' +
        '<label><span class="l">'+c.qty+'</span><input type="number" min="0.001" step="0.001" data-po-qty></label>' +
        '<label><span class="l">'+c.cost+'</span><input type="number" min="0" step="0.01" data-po-cost></label>' +
        '<label style="grid-column:1/-1"><span class="l">'+c.note+'</span><input maxlength="500" data-po-note></label>' +
        '</div><button class="kb atlas" style="width:100%;justify-content:center;margin-top:14px" type="button" data-po-save>'+c.save+'</button>' });
      modal.el.querySelector('[data-po-save]').addEventListener('click', async function () {
        var name = modal.el.querySelector('[data-po-name]').value.trim(), item = modal.el.querySelector('[data-po-item]').value.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
        var qty = Number(modal.el.querySelector('[data-po-qty]').value), cost = Number(modal.el.querySelector('[data-po-cost]').value || 0);
        if (!name || !item || !(qty > 0)) return Kiwi.toast(c.invalid, { type:'warning' });
        var input = { supplierId:modal.el.querySelector('[data-po-supplier]').value, expectedDate:modal.el.querySelector('[data-po-date]').value, note:modal.el.querySelector('[data-po-note]').value, lines:[{ itemId:item, name:name, qty:qty, unit:'unité', unitCost:cost }] };
        var row = P.createOrder(input);
        if (!row || row.error) return fail(new Error(row && row.error || 'purchase-order-failed'));
        this.disabled = true;
        try { var result = await O.create('procurement', 'create-po', { purchaseOrderId:row.id, number:row.number, supplierId:row.supplierId, expectedDate:row.expectedDate, lineCount:row.lines.length }); modal.close(); toastResult(result); }
        catch (error) { this.disabled = false; fail(error); }
      });
    };
    H['supplier-po-detail'] = function (_el, id) {
      var P = window.KiwiProcurement, d = P && P.doc && P.doc(), row = d && (d.orders || []).find(function (x) { return x.id === id || x.number === id; });
      if (!row) return Kiwi.toast('Bon de commande introuvable', { type:'warning' });
      var supplier = (d.suppliers || []).find(function (x) { return x.id === row.supplierId; });
      Kiwi.drawer({ title:row.number, subtitle:(supplier && supplier.name || '') + ' · ' + row.status, width:620, body:'<div class="p-card">'+row.lines.map(function (line) { return '<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--n-200)"><span>'+esc(line.name || line.itemId)+'</span><b>'+esc(line.qty)+' '+esc(line.unit)+'</b></div>'; }).join('')+'</div>' });
    };

    /* Replace the two old payroll exports that only painted success. The real
       CSV export in team.js remains the downloadable artifact; this command is
       the durable accounting hand-off and says PREPARED, never emailed. */
    ['eq-export-payroll', 'pay-export'].forEach(function (key) {
      H[key] = async function () {
        try { toastResult(await O.create('payroll', 'export-payroll', { format:'csv', source:'planning', teamCount:window.KiwiTeam && window.KiwiTeam.roster ? window.KiwiTeam.roster().length : 0 })); }
        catch (error) { fail(error); }
      };
    });

    H['operations-history'] = async function () {
      var c = text();
      try {
        var data = await O.list({ limit:80 }), rows = data.commands || [];
        Kiwi.drawer({ title:c.history, subtitle:K.tenant(), width:720, body:rows.length ? rows.map(function (row) {
          return '<div class="p-card" style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:12px"><b>'+esc(row.domain+' · '+row.action)+'</b><span class="chip '+(row.status === 'blocked' || row.status === 'failed' ? 'pend' : row.status === 'completed' || row.status === 'sent' || row.status === 'active' ? 'ok' : 'info-soft')+'">'+esc(row.status)+'</span></div><div style="font-size:11px;color:var(--n-500);margin-top:5px">'+esc(new Date(row.updatedAt).toLocaleString())+(row.lastError ? ' · '+esc(row.lastError) : '')+'</div></div>';
        }).join('') : '<div style="padding:32px;text-align:center;color:var(--n-500)">'+c.empty+'</div>' });
      } catch (error) { fail(error); }
    };

    /* Keep the familiar integrations drawer and add an honest operational
       health card.  It reports configured providers from the server instead
       of presenting decorative connected badges. */
    var legacyIntegrations = H['add-integration'];
    if (legacyIntegrations) H['add-integration'] = function () {
      var result = legacyIntegrations.apply(this, arguments);
      setTimeout(async function () {
        try {
          var data = await O.list({ limit:1 }), providers = data.providers || {};
          var drawer = document.querySelector('.kiwi-drawer-body, .drawer-body');
          if (!drawer || drawer.querySelector('[data-operations-health]')) return;
          var c = text(), names = { email:'Email', whatsapp:'WhatsApp', sms:'SMS', payment:'Paiement' };
          var rows = Object.keys(names).map(function (key) {
            var on = providers[key] === true;
            return '<span class="chip '+(on ? 'ok' : 'info-soft')+'">'+esc(names[key])+' · '+esc(on ? (lang() === 'ar' ? 'جاهز' : lang() === 'en' ? 'ready' : 'prêt') : (lang() === 'ar' ? 'غير مربوط' : lang() === 'en' ? 'not connected' : 'non connecté'))+'</span>';
          }).join(' ');
          var card = document.createElement('section');
          card.setAttribute('data-operations-health', '');
          card.className = 'p-card';
          card.style.marginBottom = '12px';
          card.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px"><div><b>Kiwi Operations</b><div style="font-size:11px;color:var(--n-500);margin-top:3px">'+esc(c.history)+'</div></div><button class="kb ghost xs" type="button" data-action="operations-history">'+esc(c.openOps)+'</button></div><div style="display:flex;gap:6px;flex-wrap:wrap">'+rows+'</div>';
          drawer.prepend(card);
        } catch (_) {}
      }, 80);
      return result;
    };
    window.KiwiOperationsUI = { toastResult:toastResult, openHistory:H['operations-history'] };
  }
  boot();
})();
