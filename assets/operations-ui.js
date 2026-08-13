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
          acctTitle:'Comptabilité', acctSub:'Écritures durables · plan comptable marocain',
          tabInvoice:'Facture', tabCredit:'Avoir', tabPeriod:'Période', tabJournal:'Journal',
          acctDenied:'Réservé au propriétaire', acctDeniedD:'Seul le compte propriétaire — ou un opérateur Kiwi — peut écrire dans les livres. Votre session n’a pas ce droit, et Kiwi préfère le dire avant de vous faire remplir un formulaire.',
          fDate:'Date', fAmount:'Montant TTC · MAD', fRate:'TVA', fCustomer:'Client (facultatif)', fIssue:'Émettre la facture',
          cInvoice:'Facture à annuler', cAmount:'Montant de l’avoir · MAD', cIssue:'Émettre l’avoir',
          pPeriod:'Mois à verrouiller', pLock:'Verrouiller la période', pHint:'Une période verrouillée refuse toute écriture antérieure, facture comme avoir.',
          jFrom:'Du', jTo:'Au', jRun:'Exporter le journal', jCsv:'Télécharger le CSV', jEmpty:'Aucune écriture sur cette période.',
          jTrunc:'Export trop volumineux pour l’aperçu — seul le résumé est affiché. Réduisez la plage de dates puis relancez.',
          confirmLabel:'Je confirme cette écriture définitive.', confirmNeeded:'Cochez la confirmation avant d’écrire.',
          number:'Numéro', ht:'HT', tva:'TVA', ttc:'TTC', remaining:'Reste à annuler',
          balancedOk:'Équilibré', balancedNo:'Déséquilibré', lines:'écritures',
          account:'Compte', label:'Libellé', debit:'Débit', credit:'Crédit',
          lockedAt:'Verrouillée le', already:'Cette période était déjà verrouillée — rien n’a changé.',
          errs:{
            'date-required':'Date manquante ou invalide.', 'invalid-amount':'Montant invalide.',
            'invalid-tax-rate':'Taux de TVA invalide.', 'range-required':'Plage de dates invalide.',
            'period-required':'Période invalide (AAAA-MM).', 'invoice-not-found':'Facture introuvable.',
            'exceeds-invoice':'L’avoir dépasse le reste à annuler sur cette facture.',
            'numbering-conflict':'Conflit de numérotation — relancez la demande.',
            'unbalanced-entry':'Écriture déséquilibrée — rien n’a été écrit.',
            'confirmation-required':'Confirmation requise.', 'permission-denied':'Accès refusé.',
            'period-locked':'Période verrouillée',
          },
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
          acctTitle:'Accounting', acctSub:'Durable entries · Moroccan chart of accounts',
          tabInvoice:'Invoice', tabCredit:'Credit note', tabPeriod:'Period', tabJournal:'Journal',
          acctDenied:'Owner only', acctDeniedD:'Only the owner account — or a Kiwi operator — can write to the books. Your session does not hold that right, and Kiwi says so before you fill in a form.',
          fDate:'Date', fAmount:'Amount incl. tax · MAD', fRate:'VAT', fCustomer:'Customer (optional)', fIssue:'Issue the invoice',
          cInvoice:'Invoice to credit', cAmount:'Credit-note amount · MAD', cIssue:'Issue the credit note',
          pPeriod:'Month to lock', pLock:'Lock the period', pHint:'A locked period refuses every earlier entry, invoice and credit note alike.',
          jFrom:'From', jTo:'To', jRun:'Export the journal', jCsv:'Download CSV', jEmpty:'No entries in this range.',
          jTrunc:'Export too large to preview — only the summary is shown. Narrow the date range and run it again.',
          confirmLabel:'I confirm this final entry.', confirmNeeded:'Tick the confirmation before writing.',
          number:'Number', ht:'Net', tva:'VAT', ttc:'Total', remaining:'Left to credit',
          balancedOk:'Balanced', balancedNo:'Unbalanced', lines:'entries',
          account:'Account', label:'Label', debit:'Debit', credit:'Credit',
          lockedAt:'Locked on', already:'This period was already locked — nothing changed.',
          errs:{
            'date-required':'Missing or invalid date.', 'invalid-amount':'Invalid amount.',
            'invalid-tax-rate':'Invalid VAT rate.', 'range-required':'Invalid date range.',
            'period-required':'Invalid period (YYYY-MM).', 'invoice-not-found':'Invoice not found.',
            'exceeds-invoice':'The credit note exceeds what is left to credit on this invoice.',
            'numbering-conflict':'Numbering conflict — send the request again.',
            'unbalanced-entry':'Unbalanced entry — nothing was written.',
            'confirmation-required':'Confirmation required.', 'permission-denied':'Access denied.',
            'period-locked':'Period locked',
          },
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
          acctTitle:'المحاسبة', acctSub:'قيود دائمة · المخطط المحاسبي المغربي',
          tabInvoice:'فاتورة', tabCredit:'إشعار دائن', tabPeriod:'الفترة', tabJournal:'اليومية',
          acctDenied:'خاص بالمالك', acctDeniedD:'وحده حساب المالك — أو مشغّل Kiwi — يمكنه الكتابة في الدفاتر. جلستك لا تملك هذا الحق، ويقولها Kiwi قبل أن تملأ أي استمارة.',
          fDate:'التاريخ', fAmount:'المبلغ شامل الضريبة · درهم', fRate:'الضريبة على القيمة المضافة', fCustomer:'العميل (اختياري)', fIssue:'إصدار الفاتورة',
          cInvoice:'الفاتورة المراد إلغاؤها', cAmount:'مبلغ الإشعار · درهم', cIssue:'إصدار الإشعار',
          pPeriod:'الشهر المراد قفله', pLock:'قفل الفترة', pHint:'الفترة المقفلة ترفض أي قيد سابق، فاتورة كان أو إشعارًا دائنًا.',
          jFrom:'من', jTo:'إلى', jRun:'تصدير اليومية', jCsv:'تحميل CSV', jEmpty:'لا توجد قيود في هذه الفترة.',
          jTrunc:'التصدير أكبر من أن يُعرض — يظهر الملخّص فقط. قلّص المدة ثم أعد المحاولة.',
          confirmLabel:'أؤكد هذا القيد النهائي.', confirmNeeded:'أكّد قبل الكتابة.',
          number:'الرقم', ht:'خارج الضريبة', tva:'الضريبة', ttc:'الإجمالي', remaining:'المتبقي للإلغاء',
          balancedOk:'متوازن', balancedNo:'غير متوازن', lines:'قيود',
          account:'الحساب', label:'البيان', debit:'مدين', credit:'دائن',
          lockedAt:'قُفلت في', already:'كانت هذه الفترة مقفلة أصلًا — لم يتغيّر شيء.',
          errs:{
            'date-required':'تاريخ ناقص أو غير صالح.', 'invalid-amount':'مبلغ غير صالح.',
            'invalid-tax-rate':'نسبة ضريبة غير صالحة.', 'range-required':'مدة غير صالحة.',
            'period-required':'فترة غير صالحة (سنة-شهر).', 'invoice-not-found':'الفاتورة غير موجودة.',
            'exceeds-invoice':'الإشعار يتجاوز المتبقي على هذه الفاتورة.',
            'numbering-conflict':'تعارض في الترقيم — أعد الطلب.',
            'unbalanced-entry':'قيد غير متوازن — لم يُكتب شيء.',
            'confirmation-required':'التأكيد مطلوب.', 'permission-denied':'الوصول مرفوض.',
            'period-locked':'الفترة مقفلة',
          },
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

    var legacyPo = H['supplier-new-po'];
    H['supplier-new-po'] = function () {
      /* The demo store has no durable ledger behind it, and the permission check
         below would refuse the command anyway.  Leave the demo on its own
         handler rather than writing a local purchase order and then telling the
         merchant "accès refusé" for a document that now exists. */
      if (!real() && legacyPo) return legacyPo.apply(this, arguments);
      var c = text(), P = window.KiwiProcurement, doc = P && P.doc && P.doc();
      if (!P || !doc || !(doc.suppliers || []).length) return Kiwi.toast(c.needSupplier, { type:'warning' });
      /* Ask before writing.  createOrder() commits locally, so a refusal
         discovered after the fact leaves an orphan the merchant cannot explain. */
      if (O.allowed && !O.allowed('procurement', 'create-po')) return fail(new Error('permission-denied'));
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
    /* ─────────────── COMPTABILITÉ ───────────────
     * assets/accounting.js renders the Café Atlas demo book, and for a real
     * merchant it renders buildEmpty() — a panel that says "votre comptabilité
     * est prête" and can do nothing.  The four server actions (facture, avoir,
     * verrouillage, journal) had no way in.  This is that way in.
     *
     * Loaded after accounting.js registers its handlers, so these overrides
     * win; the demo keeps its own book. */
    var FSI = String.fromCharCode(0x2068), PDI = String.fromCharCode(0x2069);
    /* "4 785 MAD" reads back as "MAD 4 785" under dir=rtl unless the amount is
       isolated in the text itself — a class-level fix cannot reach inside. */
    function money(c) { return FSI + (Number(c || 0) / 100).toFixed(2) + ' MAD' + PDI; }
    function iso(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
    function acctError(code) {
      var c = text(), key = String(code || '');
      if (key.indexOf('period-locked:') === 0) return c.errs['period-locked'] + ' (' + key.slice(14) + ')';
      return c.errs[key] || key || 'operation-failed';
    }
    /* A server-side domain refusal comes back HTTP 200 with status:'failed' —
       only permissions and confirmation throw.  Both have to be read. */
    function outcome(result) {
      if (result && result.offline) return { queued:true };
      var cmd = result && result.command || {};
      if (cmd.status !== 'completed') return { error:cmd.lastError || cmd.status || 'operation-failed' };
      return { data:cmd.result || {} };
    }
    function acctCss() {
      if (document.getElementById('ops-acct-css')) return;
      var style = document.createElement('style');
      style.id = 'ops-acct-css';
      style.textContent = [
        '.ops-acct{padding:22px 26px 46px;max-width:1000px;margin:0 auto;}',
        '.ops-acct-tabs{display:inline-flex;gap:2px;padding:4px;border-radius:999px;background:var(--n-100);border:1px solid var(--n-200);margin-bottom:22px;}',
        '.ops-acct-tab{appearance:none;border:0;background:transparent;font:inherit;font-size:12.5px;font-weight:600;color:var(--n-500);padding:8px 18px;border-radius:999px;cursor:pointer;transition:color .2s;}',
        /* liquid-lens paints the pill; the button must not paint one under it. */
        '.ops-acct-tab.on{background:transparent;color:#fff;}',
        '.ops-acct-pane{display:none;}',
        '.ops-acct-pane.on{display:block;}',
        '.ops-acct-hint{font-size:12px;color:var(--n-500);margin:0 0 14px;max-width:62ch;line-height:1.55;}',
        '.ops-acct-confirm{display:flex;align-items:flex-start;gap:9px;font-size:12.5px;color:var(--n-500);margin-top:14px;cursor:pointer;}',
        '.ops-acct-confirm input{margin-top:2px;accent-color:var(--atlas);}',
        '.ops-acct-out{margin-top:18px;}',
        '.ops-acct-kpis{display:flex;flex-wrap:wrap;gap:22px;margin:12px 0 4px;}',
        '.ops-acct-kpi{min-width:104px;}',
        '.ops-acct-kpi .k{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--n-500);}',
        '.ops-acct-kpi .v{font-size:17px;font-weight:600;margin-top:3px;font-variant-numeric:tabular-nums;}',
        '.ops-acct-doc{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:18px;letter-spacing:.02em;}',
        '.ops-acct-scroll{overflow-x:auto;max-height:50vh;overflow-y:auto;margin-top:12px;}',
        '.ops-acct-table{width:100%;border-collapse:collapse;font-size:12.5px;}',
        '.ops-acct-table th{text-align:start;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--n-500);font-weight:600;padding:8px 10px;border-bottom:1px solid var(--n-200);position:sticky;top:0;background:var(--surface);}',
        '.ops-acct-table td{padding:8px 10px;border-bottom:1px solid var(--n-100);}',
        '.ops-acct-n{text-align:end;font-variant-numeric:tabular-nums;white-space:nowrap;}',
      ].join('\n');
      document.head.appendChild(style);
    }
    function acctPane(id, on, inner) {
      return '<section class="ops-acct-pane' + (on ? ' on' : '') + '" data-acct-pane="' + id + '">' + inner + '</section>';
    }
    function openLedger(tab) {
      var c = text(), today = iso(new Date()), month = today.slice(0, 7), first = month + '-01';
      acctCss();
      if (O.allowed && !O.allowed('accounting', 'create-invoice')) {
        Kiwi.drawer({ title:c.acctTitle, subtitle:K && K.tenant ? K.tenant() : '', fullpage:true,
          body:'<div class="ops-acct"><div class="p-card"><b>' + esc(c.acctDenied) + '</b><p class="ops-acct-hint" style="margin:8px 0 0">' + esc(c.acctDeniedD) + '</p></div></div>' });
        return;
      }
      var confirmBox = '<label class="ops-acct-confirm"><input type="checkbox" data-acct-confirm><span>' + esc(c.confirmLabel) + '</span></label>';
      var body = '<div class="ops-acct">' +
        '<div class="ops-acct-tabs" data-lens-demo>' +
          [['invoice', c.tabInvoice], ['credit', c.tabCredit], ['period', c.tabPeriod], ['journal', c.tabJournal]].map(function (t) {
            return '<button class="ops-acct-tab' + (t[0] === tab ? ' on' : '') + '" type="button" data-lens-item data-acct-tab="' + t[0] + '">' + esc(t[1]) + '</button>';
          }).join('') +
        '</div>' +
        acctPane('invoice', tab === 'invoice',
          '<div class="kf-grid">' +
          '<label><span class="l">' + c.fDate + '</span><input type="date" value="' + today + '" data-fa-date></label>' +
          '<label><span class="l">' + c.fAmount + '</span><input type="number" min="0.01" step="0.01" data-fa-amount></label>' +
          '<label><span class="l">' + c.fRate + '</span><select data-fa-rate><option value="20" selected>20 %</option><option value="14">14 %</option><option value="10">10 %</option><option value="7">7 %</option><option value="0">0 %</option></select></label>' +
          '<label><span class="l">' + c.fCustomer + '</span><input maxlength="160" data-fa-customer></label>' +
          '</div><button class="kb atlas" style="width:100%;justify-content:center;margin-top:14px" type="button" data-acct-run="invoice">' + esc(c.fIssue) + '</button>' +
          '<div class="ops-acct-out" data-acct-out="invoice"></div>') +
        acctPane('credit', tab === 'credit',
          '<div class="kf-grid">' +
          '<label><span class="l">' + c.cInvoice + '</span><input maxlength="40" placeholder="FA-2026-000001" data-av-invoice></label>' +
          '<label><span class="l">' + c.fDate + '</span><input type="date" value="' + today + '" data-av-date></label>' +
          '<label><span class="l">' + c.cAmount + '</span><input type="number" min="0.01" step="0.01" data-av-amount></label>' +
          '</div>' + confirmBox +
          '<button class="kb atlas" style="width:100%;justify-content:center;margin-top:14px" type="button" data-acct-run="credit">' + esc(c.cIssue) + '</button>' +
          '<div class="ops-acct-out" data-acct-out="credit"></div>') +
        acctPane('period', tab === 'period',
          '<p class="ops-acct-hint">' + esc(c.pHint) + '</p><div class="kf-grid">' +
          '<label><span class="l">' + c.pPeriod + '</span><input type="month" value="' + month + '" data-pe-period></label>' +
          '</div>' + confirmBox +
          '<button class="kb atlas" style="width:100%;justify-content:center;margin-top:14px" type="button" data-acct-run="period">' + esc(c.pLock) + '</button>' +
          '<div class="ops-acct-out" data-acct-out="period"></div>') +
        acctPane('journal', tab === 'journal',
          '<div class="kf-grid">' +
          '<label><span class="l">' + c.jFrom + '</span><input type="date" value="' + first + '" data-jo-from></label>' +
          '<label><span class="l">' + c.jTo + '</span><input type="date" value="' + today + '" data-jo-to></label>' +
          '</div><button class="kb atlas" style="width:100%;justify-content:center;margin-top:14px" type="button" data-acct-run="journal">' + esc(c.jRun) + '</button>' +
          '<div class="ops-acct-out" data-acct-out="journal"></div>') +
        '</div>';
      var res = Kiwi.drawer({ title:c.acctTitle, subtitle:c.acctSub, body:body, fullpage:true });
      var root = res.el;
      var lastJournal = null;

      root.addEventListener('click', function (event) {
        var pill = event.target.closest('[data-acct-tab]');
        if (pill) {
          /* Toggling .on is the whole contract — liquid-lens observes class
             changes on the subtree and slides the pill by itself. */
          root.querySelectorAll('[data-acct-tab]').forEach(function (el) { el.classList.toggle('on', el === pill); });
          root.querySelectorAll('[data-acct-pane]').forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-acct-pane') === pill.getAttribute('data-acct-tab')); });
          return;
        }
        var csv = event.target.closest('[data-acct-csv]');
        if (csv && lastJournal) return downloadJournal(lastJournal);
      });

      function downloadJournal(data) {
        var head = [c.number, 'date', c.account, c.label, c.debit, c.credit].join(';');
        /* Un libellé qui commence par = devient une formule dans Excel. */
        var cell = function (v) {
          var s = String(v == null ? '' : v);
          if (/^[\t\r ]*[=+\-@]/.test(s)) s = "'" + s;
          return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        var num = function (v) { return (Number(v || 0) / 100).toFixed(2).replace('.', ','); };
        var lines = (data.lines || []).map(function (l) { return [cell(l.number), cell(l.date), cell(l.account), cell(l.label), num(l.debitCents), num(l.creditCents)].join(';'); });
        var blob = new Blob(['﻿' + [head].concat(lines).join('\r\n')], { type:'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = 'journal-' + data.from + '-' + data.to + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      }

      function out(kind, html) { root.querySelector('[data-acct-out="' + kind + '"]').innerHTML = html; }
      function outError(kind, code) {
        out(kind, '<div class="p-card"><span class="chip pend">' + esc(acctError(code)) + '</span></div>');
      }
      function kpi(k, v) { return '<div class="ops-acct-kpi"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>'; }

      root.addEventListener('click', async function (event) {
        var button = event.target.closest('[data-acct-run]');
        if (!button) return;
        var kind = button.getAttribute('data-acct-run'), pane = button.closest('[data-acct-pane]');
        var need = kind === 'credit' || kind === 'period';
        if (need && !pane.querySelector('[data-acct-confirm]').checked) return Kiwi.toast(c.confirmNeeded, { type:'warning' });
        var payload, action;
        if (kind === 'invoice') {
          action = 'create-invoice';
          payload = { date:pane.querySelector('[data-fa-date]').value, amount:Number(pane.querySelector('[data-fa-amount]').value),
            taxRate:Number(pane.querySelector('[data-fa-rate]').value), currency:'MAD', customer:pane.querySelector('[data-fa-customer]').value };
          if (!(payload.amount > 0)) return Kiwi.toast(c.invalid, { type:'warning' });
        } else if (kind === 'credit') {
          action = 'credit-note';
          payload = { invoice:pane.querySelector('[data-av-invoice]').value.trim(), date:pane.querySelector('[data-av-date]').value, amount:Number(pane.querySelector('[data-av-amount]').value) };
          if (!payload.invoice || !(payload.amount > 0)) return Kiwi.toast(c.invalid, { type:'warning' });
        } else if (kind === 'period') {
          action = 'lock-period';
          payload = { period:pane.querySelector('[data-pe-period]').value };
          if (!payload.period) return Kiwi.toast(c.invalid, { type:'warning' });
        } else {
          action = 'export-journal';
          payload = { from:pane.querySelector('[data-jo-from]').value, to:pane.querySelector('[data-jo-to]').value };
          if (!payload.from || !payload.to) return Kiwi.toast(c.invalid, { type:'warning' });
        }
        button.disabled = true;
        try {
          var result = await O.create('accounting', action, payload, need ? { confirmed:true } : undefined);
          var got = outcome(result);
          if (got.queued) { out(kind, ''); toastResult(result); return; }
          if (got.error) return outError(kind, got.error);
          render(kind, got.data);
        } catch (error) { outError(kind, error && (error.code || error.message)); }
        finally { button.disabled = false; }
      });

      function render(kind, d) {
        if (kind === 'invoice' || kind === 'credit') {
          out(kind, '<div class="p-card"><div class="ops-acct-doc">' + esc(d.number) + '</div><div class="ops-acct-kpis">' +
            kpi(c.ttc, money(d.totalCents)) + kpi(c.tva, money(d.taxCents)) + kpi(c.ht, money(d.netCents)) +
            (kind === 'credit' ? kpi(c.remaining, money(d.remainingCents)) : '') +
            '</div><div style="margin-top:10px"><span class="chip ok">' + esc(c.balancedOk) + '</span> <span class="chip info-soft">' + esc(d.entries + ' ' + c.lines) + '</span> <span class="chip info-soft">' + esc(d.date) + '</span></div></div>');
          return;
        }
        if (kind === 'period') {
          out(kind, '<div class="p-card"><div class="ops-acct-doc">' + esc(d.period) + '</div><div style="margin-top:10px"><span class="chip ' + (d.alreadyLocked ? 'info-soft' : 'ok') + '">' + esc(c.lockedAt + ' ' + new Date(d.lockedAt).toLocaleString()) + '</span></div>' +
            (d.alreadyLocked ? '<p class="ops-acct-hint" style="margin:10px 0 0">' + esc(c.already) + '</p>' : '') + '</div>');
          return;
        }
        lastJournal = d.truncated ? null : d;
        var summary = '<div class="ops-acct-kpis">' + kpi(c.debit, money(d.debitCents)) + kpi(c.credit, money(d.creditCents)) + kpi(c.lines, String(d.count)) + '</div>' +
          '<div style="margin-top:8px"><span class="chip ' + (d.balanced ? 'ok' : 'pend') + '">' + esc(d.balanced ? c.balancedOk : c.balancedNo) + '</span></div>';
        if (d.truncated) return out('journal', '<div class="p-card">' + summary + '<p class="ops-acct-hint" style="margin:12px 0 0">' + esc(c.jTrunc) + '</p></div>');
        if (!d.count) return out('journal', '<div class="p-card">' + summary + '<p class="ops-acct-hint" style="margin:12px 0 0">' + esc(c.jEmpty) + '</p></div>');
        var rows = d.lines.map(function (l) {
          return '<tr><td>' + esc(l.number) + '</td><td>' + esc(l.date) + '</td><td>' + esc(l.account) + '</td><td>' + esc(l.label) + '</td>' +
            '<td class="ops-acct-n">' + (l.debitCents ? esc(money(l.debitCents)) : '') + '</td><td class="ops-acct-n">' + (l.creditCents ? esc(money(l.creditCents)) : '') + '</td></tr>';
        }).join('');
        out('journal', '<div class="p-card">' + summary +
          '<button class="kb ghost xs" type="button" data-acct-csv style="margin-top:12px">' + esc(c.jCsv) + '</button>' +
          '<div class="ops-acct-scroll"><table class="ops-acct-table"><thead><tr><th>' + esc(c.number) + '</th><th>Date</th><th>' + esc(c.account) + '</th><th>' + esc(c.label) + '</th><th class="ops-acct-n">' + esc(c.debit) + '</th><th class="ops-acct-n">' + esc(c.credit) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>');
      }
    }

    var legacyAcct = {};
    ['open-comptabilite', 'acct-livre', 'acct-etats', 'acct-tva'].forEach(function (key) {
      legacyAcct[key] = H[key];
      /* acct-paie stays on accounting.js: payroll is a different domain and
         has no accounting server action to route to. */
      var tab = key === 'open-comptabilite' ? 'invoice' : 'journal';
      H[key] = function () {
        if (!real() && legacyAcct[key]) return legacyAcct[key].apply(this, arguments);
        openLedger(tab);
      };
    });

    window.KiwiOperationsUI = { toastResult:toastResult, openHistory:H['operations-history'], openLedger:openLedger };
  }
  boot();
})();
