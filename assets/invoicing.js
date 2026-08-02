/* Kiwi Facturation · local-first invoice register and composer
 * IDs are deliberately simple numeric values (1–99999). The module never
 * pretends an email, WhatsApp message or payment was completed by a server:
 * it prepares those hand-offs and leaves the final confirmation to the owner. */
(() => {
  'use strict';

  const ICON = {
    invoice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 11h6M9 15h6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
    export: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v7H6z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l4 4L19 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>',
  };

  const COPY = {
    fr: {
      label: 'Facturation', title: 'Facturation', sub: 'Créez, envoyez et suivez vos factures',
      overview: 'Vue d’ensemble', overviewSub: 'Suivi clair de ce qui est facturé, encaissé et à relancer.',
      create: 'Nouvelle facture', export: 'Exporter', outstanding: 'À encaisser', overdue: 'En retard',
      paidMonth: 'Payé ce mois', invoices: 'Factures', awaiting: 'factures en attente', needsFollowup: 'à relancer',
      collected: 'encaissé', totalDocs: 'documents', all: 'Toutes', collect: 'À encaisser', paid: 'Payées',
      search: 'Rechercher client ou numéro…', no: 'Facture', customer: 'Client', issued: 'Émise le', due: 'Échéance',
      status: 'Statut', amount: 'Montant', draft: 'Brouillon', sent: 'Envoyée', paidStatus: 'Payée', overdueStatus: 'En retard',
      empty: 'Aucune facture ici', emptySub: 'Créez une facture professionnelle avec lignes, TVA, échéance et PDF A4.',
      newTitle: 'Nouvelle facture', step: 'Brouillon automatique', clientInfo: 'Client et échéance',
      clientName: 'Nom du client', contact: 'E-mail ou téléphone', issueDate: 'Date d’émission', terms: 'Conditions de paiement',
      now: 'À réception', days7: 'Sous 7 jours', days15: 'Sous 15 jours', days30: 'Sous 30 jours',
      lines: 'Articles et services', description: 'Description', qty: 'Qté', unit: 'Prix HT', lineTotal: 'Total',
      addLine: '+ Ajouter une ligne', details: 'TVA et note', tax: 'Taux de TVA', note: 'Note au client',
      notePh: 'Merci pour votre confiance. Paiement à l’échéance indiquée.', saveDraft: 'Enregistrer le brouillon',
      saveOpen: 'Créer et ouvrir', subtotal: 'Sous-total HT', vat: 'TVA', total: 'Total TTC',
      assurance1: 'Numéro simple et automatique', assurance2: 'Mise en page A4 prête pour PDF', assurance3: 'Suivi des échéances et relances',
      back: 'Retour', detail: 'Détail de la facture', print: 'Imprimer / PDF', whatsapp: 'Préparer WhatsApp', email: 'Préparer l’e-mail',
      markSent: 'Marquer envoyée', markPaid: 'Marquer payée', delete: 'Supprimer le brouillon',
      invoiceTo: 'Facturé à', from: 'Émis par', item: 'Désignation', message: 'Message au client', timeline: 'Historique',
      createdOn: 'Créée', sentOn: 'Marquée envoyée', paidOn: 'Marquée payée', localNote: 'Les données sont enregistrées sur cet appareil. L’envoi et le paiement restent sous votre contrôle.',
      created: 'Facture créée', saved: 'Brouillon enregistré', updated: 'Statut mis à jour', exported: 'Export CSV téléchargé',
      validation: 'Ajoutez un client et au moins une ligne valide.', confirmPaid: 'Confirmer que cette facture a bien été payée ?', confirmDelete: 'Supprimer définitivement ce brouillon ?',
      printBlocked: 'Autorisez les fenêtres contextuelles pour imprimer.', noContact: 'Ajoutez un e-mail ou un téléphone au client.',
    },
    en: {
      label: 'Invoicing', title: 'Invoicing', sub: 'Create, send and track your invoices', overview: 'Overview', overviewSub: 'A clear view of billed, collected and overdue revenue.',
      create: 'New invoice', export: 'Export', outstanding: 'Outstanding', overdue: 'Overdue', paidMonth: 'Paid this month', invoices: 'Invoices', awaiting: 'invoices awaiting payment', needsFollowup: 'to follow up', collected: 'collected', totalDocs: 'documents',
      all: 'All', collect: 'Outstanding', paid: 'Paid', search: 'Search customer or number…', no: 'Invoice', customer: 'Customer', issued: 'Issued', due: 'Due', status: 'Status', amount: 'Amount', draft: 'Draft', sent: 'Sent', paidStatus: 'Paid', overdueStatus: 'Overdue',
      empty: 'No invoices here', emptySub: 'Create a professional invoice with line items, tax, payment terms and A4 PDF output.', newTitle: 'New invoice', step: 'Autosaved draft', clientInfo: 'Customer and due date', clientName: 'Customer name', contact: 'Email or phone', issueDate: 'Issue date', terms: 'Payment terms', now: 'Due on receipt', days7: 'Net 7', days15: 'Net 15', days30: 'Net 30', lines: 'Items and services', description: 'Description', qty: 'Qty', unit: 'Unit price', lineTotal: 'Total', addLine: '+ Add a line', details: 'Tax and note', tax: 'Tax rate', note: 'Customer note', notePh: 'Thank you for your business. Payment is due by the date shown.', saveDraft: 'Save draft', saveOpen: 'Create and open', subtotal: 'Subtotal', vat: 'Tax', total: 'Total', assurance1: 'Simple automatic number', assurance2: 'A4 layout ready for PDF', assurance3: 'Due-date and follow-up tracking', back: 'Back', detail: 'Invoice details', print: 'Print / PDF', whatsapp: 'Prepare WhatsApp', email: 'Prepare email', markSent: 'Mark as sent', markPaid: 'Mark as paid', delete: 'Delete draft', invoiceTo: 'Bill to', from: 'From', item: 'Item', message: 'Customer message', timeline: 'Timeline', createdOn: 'Created', sentOn: 'Marked sent', paidOn: 'Marked paid', localNote: 'Data is saved on this device. Sending and payment stay under your control.', created: 'Invoice created', saved: 'Draft saved', updated: 'Status updated', exported: 'CSV export downloaded', validation: 'Add a customer and at least one valid line.', confirmPaid: 'Confirm this invoice was paid?', confirmDelete: 'Permanently delete this draft?', printBlocked: 'Allow pop-ups to print.', noContact: 'Add an email or phone for this customer.',
    },
    ar: {
      label: 'الفوترة', title: 'الفوترة', sub: 'أنشئ فواتيرك وأرسلها وتابعها', overview: 'نظرة عامة', overviewSub: 'متابعة واضحة للمبالغ المفوترة والمحصلة والمتأخرة.', create: 'فاتورة جديدة', export: 'تصدير', outstanding: 'قيد التحصيل', overdue: 'متأخرة', paidMonth: 'مدفوع هذا الشهر', invoices: 'الفواتير', awaiting: 'فواتير في الانتظار', needsFollowup: 'للمتابعة', collected: 'تم تحصيله', totalDocs: 'مستندات', all: 'الكل', collect: 'قيد التحصيل', paid: 'مدفوعة', search: 'ابحث عن عميل أو رقم…', no: 'الفاتورة', customer: 'العميل', issued: 'تاريخ الإصدار', due: 'الاستحقاق', status: 'الحالة', amount: 'المبلغ', draft: 'مسودة', sent: 'مرسلة', paidStatus: 'مدفوعة', overdueStatus: 'متأخرة', empty: 'لا توجد فواتير هنا', emptySub: 'أنشئ فاتورة احترافية تشمل البنود والضريبة والأجل ونسخة PDF.', newTitle: 'فاتورة جديدة', step: 'مسودة تلقائية', clientInfo: 'العميل والاستحقاق', clientName: 'اسم العميل', contact: 'البريد أو الهاتف', issueDate: 'تاريخ الإصدار', terms: 'أجل الدفع', now: 'عند الاستلام', days7: 'خلال 7 أيام', days15: 'خلال 15 يوماً', days30: 'خلال 30 يوماً', lines: 'المنتجات والخدمات', description: 'الوصف', qty: 'الكمية', unit: 'السعر', lineTotal: 'المجموع', addLine: '+ إضافة بند', details: 'الضريبة والملاحظة', tax: 'نسبة الضريبة', note: 'ملاحظة للعميل', notePh: 'شكراً لثقتكم. يرجى الدفع قبل تاريخ الاستحقاق.', saveDraft: 'حفظ المسودة', saveOpen: 'إنشاء وفتح', subtotal: 'المجموع قبل الضريبة', vat: 'الضريبة', total: 'الإجمالي', assurance1: 'رقم بسيط وتلقائي', assurance2: 'تصميم A4 جاهز لـ PDF', assurance3: 'متابعة الاستحقاق والتذكير', back: 'رجوع', detail: 'تفاصيل الفاتورة', print: 'طباعة / PDF', whatsapp: 'تحضير واتساب', email: 'تحضير البريد', markSent: 'تحديد كمرسلة', markPaid: 'تحديد كمدفوعة', delete: 'حذف المسودة', invoiceTo: 'فاتورة إلى', from: 'صادرة عن', item: 'البند', message: 'رسالة للعميل', timeline: 'السجل', createdOn: 'أنشئت', sentOn: 'حددت كمرسلة', paidOn: 'حددت كمدفوعة', localNote: 'تُحفظ البيانات على هذا الجهاز. الإرسال والدفع تحت تحكمك.', created: 'تم إنشاء الفاتورة', saved: 'تم حفظ المسودة', updated: 'تم تحديث الحالة', exported: 'تم تنزيل ملف CSV', validation: 'أضف عميلاً وبنداً صالحاً واحداً على الأقل.', confirmPaid: 'هل تؤكد أن الفاتورة مدفوعة؟', confirmDelete: 'حذف هذه المسودة نهائياً؟', printBlocked: 'اسمح بالنوافذ المنبثقة للطباعة.', noContact: 'أضف بريداً أو هاتفاً للعميل.',
    }
  };

  const lang = () => window.KiwiI18n?.getLang?.() || document.documentElement.lang || 'fr';
  const T = () => COPY[lang()] || COPY.fr;
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const num = (v) => Math.max(0, Number(String(v ?? '').replace(',', '.')) || 0);
  const iso = (d) => {
    const value = new Date(d);
    return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
  };
  const shift = (days) => { const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate() + days); return iso(d); };
  const fmtDate = (value) => value ? new Intl.DateTimeFormat(lang() === 'ar' ? 'ar-MA' : lang() + '-MA', {day:'2-digit', month:'short', year:'numeric'}).format(new Date(value + 'T12:00:00')) : '—';
  const money = (value) => new Intl.NumberFormat(lang() === 'ar' ? 'ar-MA' : lang() + '-MA', {maximumFractionDigits: 2, minimumFractionDigits: 2}).format(num(value));
  const today = () => iso(new Date());

  function venueId() {
    try { return String(window.KiwiVenue?.getVenue?.() || 'demo').replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || 'demo'; } catch (_) { return 'demo'; }
  }
  function ownData() {
    try { return !!window.KiwiEnv?.isReal?.() || !!window.KiwiVenue?.isCustom?.(); } catch (_) { return false; }
  }
  function storageKey() { return 'kiwi:invoices:v1:' + venueId(); }
  function businessName() {
    try { return window.KiwiMe?.business || window.KiwiVenue?.getCurrentVenueData?.()?.name || localStorage.getItem('kiwiBizName') || 'Kiwi Commerce'; } catch (_) { return 'Kiwi Commerce'; }
  }

  function invoiceTotal(inv) {
    const subtotal = (inv.items || []).reduce((sum, item) => sum + num(item.qty) * num(item.price), 0);
    return { subtotal, tax: subtotal * num(inv.taxRate) / 100, total: subtotal * (1 + num(inv.taxRate) / 100) };
  }
  function effectiveStatus(inv) {
    if (inv.status === 'paid' || inv.status === 'draft') return inv.status;
    return inv.dueDate && inv.dueDate < today() ? 'overdue' : 'sent';
  }
  function seed() {
    if (ownData()) return [];
    return [
      {id:1042, customer:'Riad Zayna', contact:'+212 661 44 08 22', issueDate:shift(-2), dueDate:shift(5), terms:7, taxRate:20, status:'sent', items:[{description:'Service traiteur · 35 couverts',qty:1,price:8750}], note:'Merci pour votre confiance.', createdAt:new Date().toISOString(), sentAt:new Date().toISOString()},
      {id:1041, customer:'Atelier Nomade', contact:'finance@atelier-nomade.ma', issueDate:shift(-18), dueDate:shift(-3), terms:15, taxRate:20, status:'sent', items:[{description:'Privatisation de salle',qty:1,price:5400},{description:'Pause café',qty:24,price:65}], note:'', createdAt:new Date().toISOString(), sentAt:new Date().toISOString()},
      {id:1040, customer:'Maison Jasmin', contact:'contact@maisonjasmin.ma', issueDate:shift(-8), dueDate:shift(-1), terms:7, taxRate:20, status:'paid', items:[{description:'Commande entreprise',qty:1,price:3950}], note:'', createdAt:new Date().toISOString(), paidAt:new Date().toISOString()},
      {id:1039, customer:'Studio Terracotta', contact:'', issueDate:shift(-1), dueDate:shift(29), terms:30, taxRate:20, status:'draft', items:[{description:'Événement privé',qty:1,price:6250}], note:'', createdAt:new Date().toISOString()},
    ];
  }
  function load() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (raw) { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; }
      const initial = seed(); save(initial); return initial;
    } catch (_) { return seed(); }
  }
  function save(list) { try { localStorage.setItem(storageKey(), JSON.stringify(list)); } catch (_) {} }
  function nextId(list) {
    const used = new Set(list.map(x => Number(x.id)).filter(x => x > 0 && x <= 99999));
    let candidate = Math.max(1000, ...used) + 1;
    if (candidate > 99999) candidate = 1000;
    while (used.has(candidate) && candidate <= 99999) candidate += 1;
    return candidate > 99999 ? 1 : candidate;
  }

  let overlay = null;
  let invoices = [];
  let filter = 'all';
  let query = '';
  let currentId = null;
  let priorFocus = null;

  function toast(message) {
    document.querySelector('.inv-toast')?.remove();
    const node = document.createElement('div');
    node.className = 'inv-toast'; node.setAttribute('role', 'status'); node.textContent = message;
    document.body.appendChild(node); setTimeout(() => node.remove(), 2300);
  }

  function shell() {
    const t = T();
    overlay = document.createElement('div');
    overlay.className = 'inv-overlay';
    overlay.innerHTML = `<section class="inv-shell" role="dialog" aria-modal="true" aria-labelledby="inv-title">
      <header class="inv-topbar">
        <div class="inv-brand"><span class="inv-mark">${ICON.invoice}</span><div><h2 class="inv-title" id="inv-title">${esc(t.title)}</h2><div class="inv-subtitle">${esc(t.sub)}</div></div></div>
        <div class="inv-top-actions"><button class="inv-close" type="button" data-inv-close aria-label="Fermer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      </header><div class="inv-body"><div class="inv-view" data-inv-list></div><div class="inv-view" data-inv-compose hidden></div><div class="inv-view" data-inv-detail hidden></div></div>
    </section>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    overlay.addEventListener('click', onClick);
    overlay.addEventListener('input', onInput);
    overlay.addEventListener('change', onInput);
    overlay.addEventListener('keydown', onKeydown);
    requestAnimationFrame(() => overlay.querySelector('[data-inv-close]')?.focus());
  }

  function close() {
    if (!overlay) return;
    overlay.remove(); overlay = null; document.body.style.overflow = '';
    priorFocus?.focus?.(); priorFocus = null;
  }
  function show(name) {
    overlay.querySelectorAll('.inv-view').forEach(v => { v.hidden = !v.hasAttribute('data-inv-' + name); });
    overlay.querySelector('.inv-body').scrollTop = 0;
  }

  function stats() {
    let outstanding = 0, late = 0, paidMonth = 0, waiting = 0, lateCount = 0;
    const month = today().slice(0,7);
    invoices.forEach(inv => {
      const total = invoiceTotal(inv).total, status = effectiveStatus(inv);
      if (status === 'sent' || status === 'overdue') { outstanding += total; waiting += 1; }
      if (status === 'overdue') { late += total; lateCount += 1; }
      if (status === 'paid' && String(inv.paidAt || inv.issueDate).slice(0,7) === month) paidMonth += total;
    });
    return {outstanding, late, paidMonth, waiting, lateCount};
  }

  function statusHtml(status) {
    const t = T();
    return `<span class="inv-status ${status}">${esc({draft:t.draft,sent:t.sent,paid:t.paidStatus,overdue:t.overdueStatus}[status])}</span>`;
  }

  function renderList() {
    const t = T(), s = stats();
    const rows = invoices.slice().sort((a,b) => Number(b.id)-Number(a.id)).filter(inv => {
      const status = effectiveStatus(inv);
      const statusMatch = filter === 'all' || filter === 'paid' && status === 'paid' || filter === 'overdue' && status === 'overdue' || filter === 'collect' && (status === 'sent' || status === 'overdue');
      const q = query.trim().toLowerCase();
      return statusMatch && (!q || String(inv.id).includes(q) || String(inv.customer).toLowerCase().includes(q));
    });
    const table = rows.length ? `<div class="inv-table-wrap"><table class="inv-table"><thead><tr><th>${esc(t.no)}</th><th>${esc(t.customer)}</th><th>${esc(t.issued)}</th><th>${esc(t.due)}</th><th>${esc(t.status)}</th><th>${esc(t.amount)}</th></tr></thead><tbody>${rows.map(inv => {
      const status = effectiveStatus(inv);
      return `<tr data-inv-open="${inv.id}" tabindex="0"><td><span class="inv-no">#${inv.id}</span></td><td><span class="inv-customer">${esc(inv.customer)}</span><span class="inv-customer-sub">${esc(inv.contact || '—')}</span></td><td>${esc(fmtDate(inv.issueDate))}</td><td>${esc(fmtDate(inv.dueDate))}</td><td>${statusHtml(status)}</td><td class="inv-money">${money(invoiceTotal(inv).total)} MAD</td></tr>`;
    }).join('')}</tbody></table></div>` : `<div class="inv-empty"><div class="inv-empty-mark">${ICON.invoice}</div><h4>${esc(t.empty)}</h4><p>${esc(t.emptySub)}</p><button class="inv-btn primary" type="button" data-inv-new>${ICON.plus}${esc(t.create)}</button></div>`;
    overlay.querySelector('[data-inv-list]').innerHTML = `<div class="inv-toolbar"><div class="inv-toolbar-copy"><h3>${esc(t.overview)}</h3><p>${esc(t.overviewSub)}</p></div><div class="inv-toolbar-actions"><button class="inv-btn" type="button" data-inv-export>${ICON.export}${esc(t.export)}</button><button class="inv-btn primary" type="button" data-inv-new>${ICON.plus}${esc(t.create)}</button></div></div>
      <div class="inv-stats">
        <article class="inv-stat"><div class="inv-stat-label">${esc(t.outstanding)}</div><div class="inv-stat-value">${money(s.outstanding)} <small>MAD</small></div><div class="inv-stat-note">${s.waiting} ${esc(t.awaiting)}</div></article>
        <article class="inv-stat alert"><div class="inv-stat-label">${esc(t.overdue)}</div><div class="inv-stat-value">${money(s.late)} <small>MAD</small></div><div class="inv-stat-note">${s.lateCount} ${esc(t.needsFollowup)}</div></article>
        <article class="inv-stat"><div class="inv-stat-label">${esc(t.paidMonth)}</div><div class="inv-stat-value">${money(s.paidMonth)} <small>MAD</small></div><div class="inv-stat-note">${esc(t.collected)}</div></article>
        <article class="inv-stat"><div class="inv-stat-label">${esc(t.invoices)}</div><div class="inv-stat-value">${invoices.length}</div><div class="inv-stat-note">${esc(t.totalDocs)}</div></article>
      </div>
      <section class="inv-register"><div class="inv-register-head"><div class="inv-filters">${[['all',t.all],['collect',t.collect],['overdue',t.overdue],['paid',t.paid]].map(([key,label]) => `<button class="inv-filter${filter===key?' on':''}" type="button" data-inv-filter="${key}">${esc(label)}</button>`).join('')}</div><input class="inv-search" type="search" value="${esc(query)}" data-inv-search placeholder="${esc(t.search)}" aria-label="${esc(t.search)}"></div>${table}</section>`;
    show('list');
  }

  function lineRow(item = {description:'',qty:1,price:''}) {
    return `<div class="inv-line-row"><input data-line-desc value="${esc(item.description)}" placeholder="Service ou produit"><input data-line-qty inputmode="decimal" value="${esc(item.qty)}" aria-label="Quantité"><input data-line-price inputmode="decimal" value="${esc(item.price)}" aria-label="Prix unitaire"><span class="inv-line-total">0,00</span><button class="inv-line-remove" type="button" data-line-remove aria-label="Supprimer">×</button></div>`;
  }

  function renderComposer() {
    const t = T(), id = nextId(invoices);
    overlay.querySelector('[data-inv-compose]').innerHTML = `<div class="inv-composer-head"><div><button class="inv-btn small" type="button" data-inv-back>${ICON.back}${esc(t.back)}</button></div><div class="inv-step">#${id} · ${esc(t.step)}</div></div>
      <div class="inv-form-grid"><div>
        <section class="inv-form-card"><h4 class="inv-section-title">${esc(t.clientInfo)}</h4><div class="inv-fields"><div class="inv-field"><label>${esc(t.clientName)}</label><input data-inv-customer autocomplete="organization" placeholder="Ex. Maison Noor"></div><div class="inv-field"><label>${esc(t.contact)}</label><input data-inv-contact placeholder="+212… / client@exemple.ma"></div><div class="inv-field"><label>${esc(t.issueDate)}</label><input type="date" data-inv-issue value="${today()}"></div><div class="inv-field"><label>${esc(t.terms)}</label><select data-inv-terms><option value="0">${esc(t.now)}</option><option value="7">${esc(t.days7)}</option><option value="15">${esc(t.days15)}</option><option value="30" selected>${esc(t.days30)}</option></select></div></div></section>
        <section class="inv-form-card"><h4 class="inv-section-title">${esc(t.lines)}</h4><div class="inv-line-head"><span>${esc(t.description)}</span><span>${esc(t.qty)}</span><span>${esc(t.unit)}</span><span>${esc(t.lineTotal)}</span><span></span></div><div data-inv-lines>${lineRow()}</div><button class="inv-add-line" type="button" data-line-add>${esc(t.addLine)}</button></section>
        <section class="inv-form-card"><h4 class="inv-section-title">${esc(t.details)}</h4><div class="inv-fields"><div class="inv-field"><label>${esc(t.tax)}</label><select data-inv-tax><option value="0">0 %</option><option value="10">10 %</option><option value="20" selected>20 %</option></select></div><div class="inv-field wide"><label>${esc(t.note)}</label><textarea data-inv-note placeholder="${esc(t.notePh)}"></textarea></div></div></section>
      </div><aside class="inv-summary-card"><div class="inv-summary-brand"><div class="inv-summary-logo">kiwi<span>.</span></div><span class="inv-summary-no">#${id}</span></div><div style="padding:16px 0 8px"><div class="inv-summary-row"><span>${esc(t.subtotal)}</span><strong data-inv-subtotal>0,00 MAD</strong></div><div class="inv-summary-row"><span>${esc(t.vat)}</span><strong data-inv-vat>0,00 MAD</strong></div><div class="inv-summary-row total"><span>${esc(t.total)}</span><strong data-inv-total>0,00 MAD</strong></div></div><div class="inv-assurance"><span>${ICON.check}${esc(t.assurance1)}</span><span>${ICON.check}${esc(t.assurance2)}</span><span>${ICON.check}${esc(t.assurance3)}</span></div></aside></div>
      <div class="inv-form-actions"><button class="inv-btn" type="button" data-inv-save="draft">${esc(t.saveDraft)}</button><button class="inv-btn primary" type="button" data-inv-save="open">${ICON.check}${esc(t.saveOpen)}</button></div>`;
    show('compose'); updateComposer();
    requestAnimationFrame(() => overlay.querySelector('[data-inv-customer]')?.focus());
  }

  function composerData() {
    const issueDate = overlay.querySelector('[data-inv-issue]')?.value || today();
    const terms = Number(overlay.querySelector('[data-inv-terms]')?.value || 0);
    const due = new Date(issueDate + 'T12:00:00'); due.setDate(due.getDate() + terms);
    const items = [...overlay.querySelectorAll('.inv-line-row')].map(row => ({description:row.querySelector('[data-line-desc]').value.trim(),qty:num(row.querySelector('[data-line-qty]').value),price:num(row.querySelector('[data-line-price]').value)})).filter(x => x.description || x.price);
    return {id:nextId(invoices), customer:overlay.querySelector('[data-inv-customer]')?.value.trim() || '', contact:overlay.querySelector('[data-inv-contact]')?.value.trim() || '', issueDate, dueDate:iso(due), terms, taxRate:Number(overlay.querySelector('[data-inv-tax]')?.value || 0), note:overlay.querySelector('[data-inv-note]')?.value.trim() || '', items, status:'draft', createdAt:new Date().toISOString()};
  }
  function updateComposer() {
    if (!overlay?.querySelector('[data-inv-compose]:not([hidden])')) return;
    const data = composerData(), sums = invoiceTotal(data);
    overlay.querySelectorAll('.inv-line-row').forEach(row => { row.querySelector('.inv-line-total').textContent = money(num(row.querySelector('[data-line-qty]').value) * num(row.querySelector('[data-line-price]').value)); });
    overlay.querySelector('[data-inv-subtotal]').textContent = money(sums.subtotal) + ' MAD';
    overlay.querySelector('[data-inv-vat]').textContent = money(sums.tax) + ' MAD';
    overlay.querySelector('[data-inv-total]').textContent = money(sums.total) + ' MAD';
  }
  function saveComposer(mode) {
    const t = T(), data = composerData();
    if (!data.customer || !data.items.some(x => x.description && x.qty > 0 && x.price >= 0)) { toast(t.validation); return; }
    invoices.push(data); save(invoices); currentId = data.id;
    toast(mode === 'draft' ? t.saved : t.created);
    if (mode === 'draft') renderList(); else renderDetail(data.id);
  }

  function renderDetail(id) {
    const t = T(), inv = invoices.find(x => Number(x.id) === Number(id));
    if (!inv) return renderList();
    currentId = inv.id;
    const sums = invoiceTotal(inv), status = effectiveStatus(inv), biz = businessName();
    const items = inv.items.map(item => `<tr><td>${esc(item.description)}</td><td>${money(item.qty)}</td><td>${money(item.price)} MAD</td><td>${money(num(item.qty)*num(item.price))} MAD</td></tr>`).join('');
    const actions = `<button class="inv-btn primary" type="button" data-inv-print>${ICON.print}${esc(t.print)}</button>${status !== 'paid' ? `<button class="inv-btn" type="button" data-inv-whatsapp>${esc(t.whatsapp)}</button><button class="inv-btn" type="button" data-inv-email>${esc(t.email)}</button>` : ''}${status === 'draft' ? `<button class="inv-btn" type="button" data-inv-status="sent">${esc(t.markSent)}</button>` : ''}${status !== 'paid' ? `<button class="inv-btn" type="button" data-inv-status="paid">${ICON.check}${esc(t.markPaid)}</button>` : ''}${status === 'draft' ? `<button class="inv-btn danger" type="button" data-inv-delete>${esc(t.delete)}</button>` : ''}`;
    const timeline = `<div class="inv-time"><strong>${esc(t.createdOn)}</strong>${esc(fmtDate(inv.issueDate))}</div>${inv.sentAt ? `<div class="inv-time"><strong>${esc(t.sentOn)}</strong>${esc(fmtDate(String(inv.sentAt).slice(0,10)))}</div>`:''}${inv.paidAt ? `<div class="inv-time"><strong>${esc(t.paidOn)}</strong>${esc(fmtDate(String(inv.paidAt).slice(0,10)))}</div>`:''}`;
    overlay.querySelector('[data-inv-detail]').innerHTML = `<div class="inv-composer-head"><button class="inv-btn small" type="button" data-inv-back>${ICON.back}${esc(t.back)}</button><div>${statusHtml(status)}</div></div><div class="inv-detail-grid"><article class="inv-preview"><div class="inv-preview-top"><div><div class="inv-summary-logo">kiwi<span>.</span></div><div class="inv-preview-meta">${esc(biz)}<br>Maroc</div></div><div style="text-align:right"><h3 class="inv-preview-title">${esc(t.no)} #${inv.id}</h3><div class="inv-preview-meta">${esc(t.issued)} · ${esc(fmtDate(inv.issueDate))}<br>${esc(t.due)} · ${esc(fmtDate(inv.dueDate))}</div></div></div><div class="inv-preview-parties"><div><div class="inv-preview-label">${esc(t.from)}</div><div class="inv-preview-party"><strong>${esc(biz)}</strong>Document commercial Kiwi</div></div><div><div class="inv-preview-label">${esc(t.invoiceTo)}</div><div class="inv-preview-party"><strong>${esc(inv.customer)}</strong>${esc(inv.contact || '')}</div></div></div><table class="inv-preview-table"><thead><tr><th>${esc(t.item)}</th><th>${esc(t.qty)}</th><th>${esc(t.unit)}</th><th>${esc(t.lineTotal)}</th></tr></thead><tbody>${items}</tbody></table><div class="inv-preview-totals"><div class="inv-summary-row"><span>${esc(t.subtotal)}</span><strong>${money(sums.subtotal)} MAD</strong></div><div class="inv-summary-row"><span>${esc(t.vat)} (${num(inv.taxRate)} %)</span><strong>${money(sums.tax)} MAD</strong></div><div class="inv-summary-row total"><span>${esc(t.total)}</span><strong>${money(sums.total)} MAD</strong></div></div>${inv.note ? `<div class="inv-preview-note"><strong>${esc(t.message)}</strong><br>${esc(inv.note)}</div>`:''}</article><aside class="inv-detail-side"><section class="inv-detail-card"><h4 class="inv-section-title">${esc(t.detail)}</h4><div class="inv-detail-actions">${actions}</div></section><section class="inv-detail-card"><h4 class="inv-section-title">${esc(t.timeline)}</h4><div class="inv-timeline">${timeline}</div></section><div class="inv-note">${esc(t.localNote)}</div></aside></div>`;
    show('detail');
  }

  function setStatus(status) {
    const t = T(), inv = invoices.find(x => Number(x.id) === Number(currentId)); if (!inv) return;
    if (status === 'paid' && !window.confirm(t.confirmPaid)) return;
    inv.status = status;
    if (status === 'sent' && !inv.sentAt) inv.sentAt = new Date().toISOString();
    if (status === 'paid') inv.paidAt = new Date().toISOString();
    save(invoices); toast(t.updated); renderDetail(inv.id);
  }
  function deleteDraft() {
    const t = T(); if (!window.confirm(t.confirmDelete)) return;
    invoices = invoices.filter(x => Number(x.id) !== Number(currentId)); save(invoices); renderList();
  }

  function contact(kind) {
    const t = T(), inv = invoices.find(x => Number(x.id) === Number(currentId)); if (!inv) return;
    const amount = money(invoiceTotal(inv).total) + ' MAD';
    const message = `${t.no} #${inv.id} · ${amount}. ${t.due}: ${fmtDate(inv.dueDate)}. ${businessName()}`;
    if (kind === 'whatsapp') {
      const phone = String(inv.contact || '').replace(/\D/g,'');
      if (!phone) { toast(t.noContact); return; }
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
    } else {
      const email = String(inv.contact || '').includes('@') ? inv.contact : '';
      if (!email) { toast(t.noContact); return; }
      window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(t.no + ' #' + inv.id)}&body=${encodeURIComponent(message)}`;
    }
  }

  function printable(inv) {
    const t = T(), sums = invoiceTotal(inv), biz = businessName();
    return `<!doctype html><html lang="${esc(lang())}"><head><meta charset="utf-8"><title>${esc(t.no)} #${inv.id}</title><style>@page{size:A4;margin:18mm}*{box-sizing:border-box}body{font:13px Arial,sans-serif;color:#102019;margin:0}.top{display:flex;justify-content:space-between;border-bottom:3px solid #087653;padding-bottom:24px}.logo{font-size:28px;font-weight:800}.logo b{color:#087653}.meta{color:#69746e;line-height:1.6;margin-top:7px}.parties{display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:28px 0}.label{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#777;margin-bottom:8px}.party strong{display:block;font-size:15px;margin-bottom:4px}table{width:100%;border-collapse:collapse}th{background:#f1f6f3;text-align:left;color:#65716b;padding:11px}td{padding:12px 11px;border-bottom:1px solid #e2e8e4}th:not(:first-child),td:not(:first-child){text-align:right}.totals{width:280px;margin:20px 0 0 auto}.row{display:flex;justify-content:space-between;padding:7px 0}.total{border-top:2px solid #087653;margin-top:8px;padding-top:12px;font-size:18px;font-weight:bold;color:#087653}.note{margin-top:38px;background:#f3f7f5;border-left:3px solid #087653;padding:14px;color:#58645e;line-height:1.5}.foot{position:fixed;bottom:0;color:#849089;font-size:10px}</style></head><body><div class="top"><div><div class="logo">kiwi<b>.</b></div><div class="meta">${esc(biz)}<br>Maroc</div></div><div style="text-align:right"><h1>${esc(t.no)} #${inv.id}</h1><div class="meta">${esc(t.issued)} · ${esc(fmtDate(inv.issueDate))}<br>${esc(t.due)} · ${esc(fmtDate(inv.dueDate))}</div></div></div><div class="parties"><div><div class="label">${esc(t.from)}</div><div class="party"><strong>${esc(biz)}</strong>Document commercial Kiwi</div></div><div><div class="label">${esc(t.invoiceTo)}</div><div class="party"><strong>${esc(inv.customer)}</strong>${esc(inv.contact)}</div></div></div><table><thead><tr><th>${esc(t.item)}</th><th>${esc(t.qty)}</th><th>${esc(t.unit)}</th><th>${esc(t.lineTotal)}</th></tr></thead><tbody>${inv.items.map(x=>`<tr><td>${esc(x.description)}</td><td>${money(x.qty)}</td><td>${money(x.price)} MAD</td><td>${money(num(x.qty)*num(x.price))} MAD</td></tr>`).join('')}</tbody></table><div class="totals"><div class="row"><span>${esc(t.subtotal)}</span><b>${money(sums.subtotal)} MAD</b></div><div class="row"><span>${esc(t.vat)} (${num(inv.taxRate)} %)</span><b>${money(sums.tax)} MAD</b></div><div class="row total"><span>${esc(t.total)}</span><span>${money(sums.total)} MAD</span></div></div>${inv.note?`<div class="note">${esc(inv.note)}</div>`:''}<div class="foot">${esc(biz)} · ${esc(t.no)} #${inv.id}</div><script>addEventListener('load',()=>setTimeout(()=>print(),150))<\/script></body></html>`;
  }
  function printInvoice() {
    const inv = invoices.find(x => Number(x.id) === Number(currentId)); if (!inv) return;
    const win = window.open('', '_blank'); if (!win) { toast(T().printBlocked); return; }
    win.document.open(); win.document.write(printable(inv)); win.document.close();
  }

  function exportCsv() {
    const t = T();
    const cells = [[t.no,t.customer,t.issued,t.due,t.status,t.amount], ...invoices.map(inv => ['#'+inv.id,inv.customer,inv.issueDate,inv.dueDate,effectiveStatus(inv),invoiceTotal(inv).total.toFixed(2)])];
    const csv = '\ufeff' + cells.map(row => row.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
    const a = document.createElement('a'); a.href=url; a.download='kiwi-factures-' + today() + '.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast(t.exported);
  }

  function onClick(e) {
    if (e.target === overlay) return close();
    const target = e.target.closest('button,[data-inv-open]'); if (!target) return;
    if (target.matches('[data-inv-close]')) return close();
    if (target.matches('[data-inv-new]')) return renderComposer();
    if (target.matches('[data-inv-back]')) return renderList();
    if (target.matches('[data-inv-export]')) return exportCsv();
    if (target.matches('[data-inv-filter]')) { filter=target.dataset.invFilter; return renderList(); }
    if (target.matches('[data-inv-open]')) return renderDetail(target.dataset.invOpen);
    if (target.matches('[data-line-add]')) { overlay.querySelector('[data-inv-lines]').insertAdjacentHTML('beforeend',lineRow()); return updateComposer(); }
    if (target.matches('[data-line-remove]')) { const rows=overlay.querySelectorAll('.inv-line-row'); if(rows.length>1) target.closest('.inv-line-row').remove(); else target.closest('.inv-line-row').querySelectorAll('input').forEach((x,i)=>x.value=i===1?'1':''); return updateComposer(); }
    if (target.matches('[data-inv-save]')) return saveComposer(target.dataset.invSave);
    if (target.matches('[data-inv-status]')) return setStatus(target.dataset.invStatus);
    if (target.matches('[data-inv-delete]')) return deleteDraft();
    if (target.matches('[data-inv-print]')) return printInvoice();
    if (target.matches('[data-inv-whatsapp]')) return contact('whatsapp');
    if (target.matches('[data-inv-email]')) return contact('email');
  }
  function onInput(e) {
    if (e.target.matches('[data-inv-search]')) { query=e.target.value; return renderList(); }
    if (e.target.closest('[data-inv-compose]')) updateComposer();
  }
  function onKeydown(e) {
    if (e.key === 'Escape') return close();
    if (e.key === 'Enter' && e.target.matches('[data-inv-open]')) return renderDetail(e.target.dataset.invOpen);
    if (e.key !== 'Tab') return;
    const focusable = [...overlay.querySelectorAll('button:not([disabled]),input,select,textarea,[tabindex="0"]')].filter(x => !x.closest('[hidden]'));
    if (!focusable.length) return;
    const first=focusable[0], last=focusable[focusable.length-1];
    if (e.shiftKey && document.activeElement===first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement===last) { e.preventDefault(); first.focus(); }
  }

  function open() {
    if (overlay) return;
    priorFocus = document.activeElement;
    invoices = load(); filter='all'; query=''; currentId=null;
    shell(); renderList();
  }
  function updatePill() { document.querySelectorAll('[data-invoicing-label]').forEach(el => { el.textContent = T().label; }); }
  function install() {
    window.Kiwi = window.Kiwi || {};
    window.Kiwi.handlers = window.Kiwi.handlers || {};
    window.Kiwi.handlers.invoicing = open;
    window.KiwiInvoicing = {open, list:() => load().map(x => ({...x})), version:'1.0.0'};
    updatePill();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.addEventListener('kiwi:langchange', updatePill);
})();
