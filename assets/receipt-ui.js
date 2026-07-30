/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · ÉDITEUR DE REÇU — window.KiwiReceiptUI
 * ---------------------------------------------------------------------------
 * L'unique écran où l'on règle le ticket de caisse d'un établissement. Il vit
 * dans Réglages → Mon compte → Mes établissements → Reçu, et nulle part
 * ailleurs. La caisse, les réimpressions, les remboursements, le reçu à
 * l'écran et le détail d'une transaction LISENT window.KiwiReceipt ; aucun
 * d'eux ne propose son propre réglage.
 *
 * ── L'APERÇU EST LE SUJET ──────────────────────────────────────────────────
 * Un éditeur de reçu sans aperçu vivant est une liste de cases à cocher dont
 * personne ne sait ce qu'elle produit. Ici l'aperçu se repeint à chaque frappe,
 * dans la vraie largeur du rouleau (80 ou 58 mm, en millimètres réels), avec le
 * VRAI moteur de rendu — celui qui imprimera. Ce n'est pas une maquette : ce
 * que montre l'aperçu est ce qui sortira, à l'encre près.
 *
 * ── LES MENTIONS LÉGALES NE S'ÉDITENT PAS ICI ──────────────────────────────
 * Elles s'affichent, avec un bouton qui ouvre la fiche établissement. Les
 * dupliquer dans cet écran donnerait deux ICE, dont un faux dès la première
 * correction. Ce qui manque est signalé ICI, en toutes lettres, parce que c'est
 * le moment où le propriétaire pense à son ticket — pas sur le ticket du
 * client, où un « ICE : — » imprimé ressemble à un ICE illisible.
 *
 * ── CE QUI NE SE DÉCOCHE PAS ───────────────────────────────────────────────
 * L'enseigne, le numéro, la date, les articles, les totaux et le paiement
 * n'ont pas d'interrupteur. Un propriétaire personnalise son reçu ; il ne peut
 * pas en retirer par inadvertance ce qui en fait une preuve d'achat.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var R = function () { return window.KiwiReceipt; };
  var Kw = function () { return window.Kiwi; };
  function lang() {
    try {
      var l = window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang();
      return (l === 'en' || l === 'ar') ? l : 'fr';
    } catch (_) { return 'fr'; }
  }
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  var T = {
    fr: {
      title: 'Reçu de caisse', sub: 'Le ticket remis à vos clients — imprimé, réimprimé, remboursé et affiché',
      gIdentity: 'Identité & mentions légales', gLook: 'Apparence du reçu',
      gSale: 'Informations affichées par vente', gMsg: 'Messages & politiques',
      gPrint: "Format d'impression",
      editBiz: 'Modifier la fiche', sourceNote: 'Ces informations viennent de la fiche de l’établissement. Elles ne se saisissent qu’une fois, ici elles s’affichent.',
      missingHead: 'À compléter pour un reçu conforme',
      missingBody: 'Ces mentions n’apparaîtront pas sur le ticket tant qu’elles sont vides — un reçu n’affiche jamais un tiret à la place d’une mention légale.',
      allSet: 'Toutes les mentions importantes sont renseignées.',
      lockedHead: 'Toujours imprimé', lockedBody: 'Enseigne · numéro de ticket · date et heure · articles · totaux · paiement. Ces éléments font du ticket une preuve d’achat : ils ne se retirent pas.',
      logo: 'Logo', logoAdd: 'Choisir une image', logoDel: 'Retirer', logoHint: 'PNG ou JPEG, ≤ 300 ko. Imprimé en noir et blanc.',
      header: 'En-tête', headerPh: 'Par défaut : le nom de l’établissement',
      tagline: 'Sous-titre', taglinePh: 'Ex. Prêt-à-porter femme',
      contact: 'Adresse & contact', cFull: 'Sur plusieurs lignes', cCompact: 'Sur une ligne', cOff: 'Ne pas afficher',
      density: 'Densité', dCompact: 'Serrée', dNormal: 'Normale', dAiry: 'Aérée',
      showCashier: 'Caissier', showTerminal: 'Terminal', showCustomer: 'Client',
      showLoyalty: 'Fidélité & points', showRef: 'Référence article', showBarcode: 'Code-barres article',
      legalShow: 'Mentions légales imprimées',
      vat: 'TVA', vatNone: 'Non applicable', vatRate: 'Appliquer un taux',
      vatRateL: 'Taux', vatIncl: 'Prix TTC (la TVA est comprise)', vatExcl: 'Prix HT (la TVA s’ajoute)',
      vatNote: 'Laissé sur « non applicable » tant que vous ne le réglez pas : une ligne de TVA affichée d’office sur une pièce comptable est un chiffre inventé.',
      welcome: 'Message d’accueil', welcomePh: 'Ex. Bienvenue chez nous',
      thanks: 'Message de fin', thanksPh: 'Ex. Merci et à bientôt',
      policy: 'Retours & échanges', policyPh: 'Ex. Échange sous 7 jours avec le ticket',
      social: 'Réseaux sociaux', socialPh: 'Ex. @amiraboutique',
      web: 'Site web', webPh: 'amiraboutique.ma', whatsapp: 'WhatsApp', whatsappPh: '+212 6 12 34 56 78',
      qr: 'QR code', qrNone: 'Aucun', qrWeb: 'Site web', qrWa: 'WhatsApp', qrCustom: 'Contenu libre',
      qrTextPh: 'Adresse ou texte du QR',
      paper: 'Largeur du rouleau', decimals: 'Centimes',
      dAuto: 'Seulement si nécessaire', dAlways: 'Toujours', dNever: 'Jamais',
      plang: 'Langue du reçu', pauto: 'Suivre l’interface', psecond: 'Seconde langue',
      pnone: 'Aucune', bilingualNote: 'La seconde langue reprend le total et le remerciement, pas le ticket entier.',
      preview: 'Aperçu', testPrint: 'Imprimer un ticket test',
      testNote: 'N’enregistre aucune vente et ne consomme aucun numéro.',
      save: 'Enregistrer', cancel: 'Annuler', saved: 'Reçu enregistré',
      notSynced: 'Gardé sur cet appareil seulement — logo trop lourd pour partir vers la caisse. Choisissez une image plus légère.',
      printing: 'Envoi du ticket test…', printed: 'Ticket test imprimé', printFail: 'Impression impossible',
      logoBig: 'Image trop lourde (max 300 ko).', logoBad: 'Format non reconnu — utilisez un PNG ou un JPEG.',
      noVenue: 'Sélectionnez un établissement pour régler son reçu.',
    },
    en: {
      title: 'Sales receipt', sub: 'The ticket you hand your customers — printed, reprinted, refunded and displayed',
      gIdentity: 'Identity & legal details', gLook: 'Receipt appearance',
      gSale: 'Shown for each sale', gMsg: 'Messages & policies', gPrint: 'Printer format',
      editBiz: 'Edit business', sourceNote: 'This comes from the business profile. Entered once there, only shown here.',
      missingHead: 'To complete for a compliant receipt',
      missingBody: 'These will not appear on the ticket while they are empty — a receipt never prints a dash in place of a legal detail.',
      allSet: 'All important details are filled in.',
      lockedHead: 'Always printed', lockedBody: 'Business name · receipt number · date and time · items · totals · payment. These make the ticket a proof of purchase: they cannot be removed.',
      logo: 'Logo', logoAdd: 'Choose an image', logoDel: 'Remove', logoHint: 'PNG or JPEG, ≤ 300 kB. Printed in black and white.',
      header: 'Header', headerPh: 'Default: the business name',
      tagline: 'Subtitle', taglinePh: 'e.g. Womenswear',
      contact: 'Address & contact', cFull: 'On several lines', cCompact: 'On one line', cOff: 'Do not show',
      density: 'Density', dCompact: 'Tight', dNormal: 'Normal', dAiry: 'Airy',
      showCashier: 'Cashier', showTerminal: 'Terminal', showCustomer: 'Customer',
      showLoyalty: 'Loyalty & points', showRef: 'Product reference', showBarcode: 'Product barcode',
      legalShow: 'Legal details printed',
      vat: 'VAT', vatNone: 'Not applicable', vatRate: 'Apply a rate',
      vatRateL: 'Rate', vatIncl: 'Prices include VAT', vatExcl: 'Prices exclude VAT',
      vatNote: 'Left on “not applicable” until you set it: a VAT line shown by default on an accounting document is an invented figure.',
      welcome: 'Welcome message', welcomePh: 'e.g. Welcome',
      thanks: 'Closing message', thanksPh: 'e.g. Thank you, see you soon',
      policy: 'Returns & exchanges', policyPh: 'e.g. Exchange within 7 days with the receipt',
      social: 'Social media', socialPh: 'e.g. @amiraboutique',
      web: 'Website', webPh: 'amiraboutique.ma', whatsapp: 'WhatsApp', whatsappPh: '+212 6 12 34 56 78',
      qr: 'QR code', qrNone: 'None', qrWeb: 'Website', qrWa: 'WhatsApp', qrCustom: 'Custom text',
      qrTextPh: 'QR address or text',
      paper: 'Roll width', decimals: 'Decimals',
      dAuto: 'Only when needed', dAlways: 'Always', dNever: 'Never',
      plang: 'Receipt language', pauto: 'Follow the interface', psecond: 'Second language',
      pnone: 'None', bilingualNote: 'The second language repeats the total and the thank-you, not the whole ticket.',
      preview: 'Preview', testPrint: 'Print a test receipt',
      testNote: 'Records no sale and uses up no receipt number.',
      save: 'Save', cancel: 'Cancel', saved: 'Receipt saved',
      notSynced: 'Kept on this device only — the logo is too heavy to reach the till. Choose a lighter image.',
      printing: 'Sending the test ticket…', printed: 'Test ticket printed', printFail: 'Could not print',
      logoBig: 'Image too large (max 300 kB).', logoBad: 'Unrecognised format — use a PNG or a JPEG.',
      noVenue: 'Select a business to set up its receipt.',
    },
    ar: {
      title: 'وصل الصندوق', sub: 'الوصل الذي يتسلمه زبناؤكم — طبعاً وإعادة طبع واسترجاعاً وعرضاً',
      gIdentity: 'الهوية والبيانات القانونية', gLook: 'مظهر الوصل',
      gSale: 'ما يظهر في كل عملية', gMsg: 'الرسائل والسياسات', gPrint: 'صيغة الطباعة',
      editBiz: 'تعديل المؤسسة', sourceNote: 'هذه المعلومات من بطاقة المؤسسة. تُدخل مرة واحدة هناك، وتُعرض هنا فقط.',
      missingHead: 'ينقص لإتمام وصل مطابق',
      missingBody: 'لن تظهر على الوصل ما دامت فارغة — الوصل لا يطبع شرطة مكان بيان قانوني.',
      allSet: 'كل البيانات المهمة مملوءة.',
      lockedHead: 'يُطبع دائماً', lockedBody: 'اسم المؤسسة · رقم الوصل · التاريخ والساعة · المنتجات · المجاميع · الأداء. هذه ما يجعل الوصل إثبات شراء: لا يمكن حذفها.',
      logo: 'الشعار', logoAdd: 'اختيار صورة', logoDel: 'حذف', logoHint: 'PNG أو JPEG، ≤ 300 كب. يُطبع بالأبيض والأسود.',
      header: 'العنوان', headerPh: 'افتراضياً: اسم المؤسسة',
      tagline: 'عنوان فرعي', taglinePh: 'مثال: ملابس نسائية',
      contact: 'العنوان والاتصال', cFull: 'على عدة أسطر', cCompact: 'على سطر واحد', cOff: 'عدم العرض',
      density: 'الكثافة', dCompact: 'ضيقة', dNormal: 'عادية', dAiry: 'واسعة',
      showCashier: 'الصندوقي', showTerminal: 'الجهاز', showCustomer: 'الزبون',
      showLoyalty: 'الوفاء والنقاط', showRef: 'مرجع المنتج', showBarcode: 'الباركود',
      legalShow: 'البيانات القانونية المطبوعة',
      vat: 'الضريبة على القيمة المضافة', vatNone: 'غير مطبقة', vatRate: 'تطبيق نسبة',
      vatRateL: 'النسبة', vatIncl: 'الأثمنة تشمل الضريبة', vatExcl: 'الأثمنة دون الضريبة',
      vatNote: 'تبقى «غير مطبقة» حتى تضبطوها: سطر ضريبة يظهر تلقائياً على وثيقة محاسبية رقم مُختلق.',
      welcome: 'رسالة ترحيب', welcomePh: 'مثال: مرحباً بكم',
      thanks: 'رسالة الختام', thanksPh: 'مثال: شكراً وإلى اللقاء',
      policy: 'الإرجاع والتبديل', policyPh: 'مثال: التبديل خلال 7 أيام بالوصل',
      social: 'شبكات التواصل', socialPh: 'مثال: @amiraboutique',
      web: 'الموقع', webPh: 'amiraboutique.ma', whatsapp: 'واتساب', whatsappPh: '+212 6 12 34 56 78',
      qr: 'رمز QR', qrNone: 'بدون', qrWeb: 'الموقع', qrWa: 'واتساب', qrCustom: 'نص حر',
      qrTextPh: 'عنوان أو نص الرمز',
      paper: 'عرض الورق', decimals: 'السنتيمات',
      dAuto: 'عند الحاجة فقط', dAlways: 'دائماً', dNever: 'أبداً',
      plang: 'لغة الوصل', pauto: 'حسب الواجهة', psecond: 'لغة ثانية',
      pnone: 'بدون', bilingualNote: 'اللغة الثانية تعيد المجموع والشكر، لا الوصل كاملاً.',
      preview: 'معاينة', testPrint: 'طبع وصل تجريبي',
      testNote: 'لا يسجل أي عملية بيع ولا يستهلك أي رقم.',
      save: 'حفظ', cancel: 'إلغاء', saved: 'تم حفظ الوصل',
      notSynced: 'محفوظ على هذا الجهاز فقط — الشعار ثقيل ولم يصل إلى الصندوق. اختاروا صورة أخف.',
      printing: 'إرسال الوصل التجريبي…', printed: 'تم طبع الوصل التجريبي', printFail: 'تعذرت الطباعة',
      logoBig: 'الصورة ثقيلة جداً (300 كب كحد أقصى).', logoBad: 'صيغة غير معروفة — استعملوا PNG أو JPEG.',
      noVenue: 'اختاروا مؤسسة لضبط وصلها.',
    },
  };
  function t() { return T[lang()] || T.fr; }

  var CSS = [
    '.kr-wrap{display:grid;grid-template-columns:1fr 320px;gap:22px;align-items:start;max-height:66vh;overflow:auto;padding-inline-end:4px;}',
    '@media(max-width:820px){.kr-wrap{grid-template-columns:1fr;}}',
    '.kr-g{margin-bottom:22px;}',
    '.kr-g-h{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--n-500);margin-bottom:11px;}',
    '.kr-card{border:1px solid var(--n-200);border-radius:13px;background:var(--surface);padding:14px 16px;}',
    '.kr-f{display:block;margin-bottom:13px;}.kr-f:last-child{margin-bottom:0;}',
    '.kr-l{display:block;font-size:11.5px;font-weight:500;color:var(--n-600);margin-bottom:5px;}',
    '.kr-i{width:100%;padding:9px 11px;border:1px solid var(--n-200);border-radius:9px;font-family:var(--sans);font-size:13.5px;color:var(--ink);background:var(--surface);outline:none;box-sizing:border-box;}',
    '.kr-i:focus{border-color:var(--atlas);}',
    'textarea.kr-i{min-height:62px;resize:vertical;line-height:1.5;}',
    '.kr-2{display:grid;grid-template-columns:1fr 1fr;gap:0 12px;}',
    '@media(max-width:560px){.kr-2{grid-template-columns:1fr;}}',
    '.kr-sw-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--n-100);font-size:13.5px;}',
    '.kr-sw-row:last-child{border-bottom:0;}',
    '.kr-sw{width:38px;height:22px;border:0;padding:0;background:var(--n-300);border-radius:999px;position:relative;cursor:pointer;flex-shrink:0;transition:background 150ms;}',
    '.kr-sw[aria-checked="true"]{background:var(--atlas);}',
    '.kr-sw::after{content:"";position:absolute;top:2px;inset-inline-start:2px;width:18px;height:18px;background:#fff;border-radius:50%;transition:inset-inline-start 150ms;box-shadow:0 1px 3px rgba(10,15,13,.3);}',
    '.kr-sw[aria-checked="true"]::after{inset-inline-start:18px;}',
    '.kr-legal{display:grid;grid-template-columns:repeat(2,1fr);gap:9px 16px;}',
    '@media(max-width:560px){.kr-legal{grid-template-columns:1fr;}}',
    '.kr-legal .k{font-family:var(--mono);font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--n-500);}',
    '.kr-legal .v{font-size:13px;font-weight:500;margin-top:1px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;}',
    '.kr-legal .v.miss{color:var(--danger,#dc2626);font-weight:500;}',
    '.kr-warn{margin-top:12px;border:1px solid color-mix(in srgb,var(--danger,#dc2626) 30%,transparent);background:color-mix(in srgb,var(--danger,#dc2626) 7%,transparent);border-radius:11px;padding:11px 13px;}',
    '.kr-warn b{display:block;font-size:12.5px;margin-bottom:4px;}',
    '.kr-warn p{margin:0;font-size:12px;color:var(--n-600);line-height:1.5;}',
    '.kr-ok{margin-top:12px;font-size:12.5px;color:var(--success,#16a34a);}',
    '.kr-lock{margin-top:12px;border:1px dashed var(--n-300);border-radius:11px;padding:11px 13px;}',
    '.kr-lock b{display:block;font-size:12.5px;margin-bottom:4px;}',
    '.kr-lock p{margin:0;font-size:12px;color:var(--n-500);line-height:1.5;}',
    '.kr-note{font-size:11.5px;color:var(--n-500);line-height:1.5;margin-top:7px;}',
    '.kr-btn{border:1px solid var(--n-300);background:transparent;color:var(--ink);border-radius:9px;padding:8px 14px;font-size:12.5px;font-weight:600;font-family:var(--sans);cursor:pointer;}',
    '.kr-btn:hover{border-color:var(--atlas);color:var(--atlas);}',
    '.kr-btn.on{background:var(--atlas);color:#fff;border-color:var(--atlas);}',
    '.kr-side{position:sticky;top:0;}',
    '.kr-side-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;}',
    '.kr-side-h .kr-g-h{margin:0;}',
    '.kr-tabs{display:inline-flex;gap:4px;background:var(--paper-soft,#f2f0ea);border-radius:999px;padding:3px;}',
    '.kr-tab{border:0;background:transparent;border-radius:999px;padding:5px 11px;font-size:11.5px;font-weight:600;font-family:var(--mono);cursor:pointer;color:var(--n-600);}',
    '.kr-tab.on{background:var(--surface);color:var(--atlas);box-shadow:0 1px 3px rgba(10,15,13,.14);}',
    '.kr-stage{background:var(--paper-soft,#f2f0ea);border-radius:13px;padding:16px 8px;overflow:auto;max-height:52vh;}',
    '.kr-stage .kr-ticket{box-shadow:0 10px 28px -14px rgba(10,15,13,.4);}',
    '.kr-logo-box{display:flex;align-items:center;gap:12px;}',
    '.kr-logo-prev{width:56px;height:56px;border:1px solid var(--n-200);border-radius:10px;display:grid;place-items:center;background:var(--paper-soft,#f2f0ea);overflow:hidden;flex-shrink:0;}',
    '.kr-logo-prev img{max-width:100%;max-height:100%;object-fit:contain;}',
  ].join('');
  function ensureCSS() {
    if (!document.getElementById('kru-style')) {
      var s = document.createElement('style');
      s.id = 'kru-style'; s.textContent = CSS;
      document.head.appendChild(s);
    }
    try { R().ensureCSS(); } catch (_) {}
  }

  /* ═══════════════════════════ l'éditeur ═══════════════════════════
   * opts.venueId   l'établissement réglé (défaut : l'actif)
   * opts.title     le nom affiché en sous-titre
   * opts.onEditBusiness()  ouvre la fiche établissement (le raccourci)
   * opts.onSave(cfg) */
  function open(opts) {
    opts = opts || {};
    var K = R(); if (!K || !Kw() || !Kw().modal) return null;
    ensureCSS();
    var L = t();
    var vid = opts.venueId || null;
    var cfg = K.config(vid);
    /* L'identité montrée. Normalement la fiche de l'établissement ; quand elle
     * est encore vide, ce que l'appelant a sous les yeux (la carte « Mes
     * établissements »). C'est un AFFICHAGE de secours, jamais une écriture :
     * l'éditeur de reçu ne détient pas de copie des mentions légales. */
    var biz = function () {
      var b = K.business(vid);
      if (!Object.keys(b.legal).length && opts.fallbackBusiness) {
        var f = opts.fallbackBusiness;
        return { name: b.name || f.name || '', tradeName: b.tradeName || '', legal: f.legal || {} };
      }
      return b;
    };
    var previewPaper = cfg.print.paper === '58' || cfg.print.paper === '57' ? '58' : '80';

    var m = Kw().modal({
      title: L.title, desc: esc(opts.title || '') || L.sub, width: 940,
      body: '<div class="kr-wrap"><div id="kru-form"></div>' +
            '<div class="kr-side">' +
              '<div class="kr-side-h"><div class="kr-g-h">' + esc(L.preview) + '</div>' +
              '<div class="kr-tabs" id="kru-paper"><button class="kr-tab" data-p="80" type="button">80 mm</button>' +
              '<button class="kr-tab" data-p="58" type="button">58 mm</button></div></div>' +
              '<div class="kr-stage" id="kru-stage"></div>' +
              '<button class="kr-btn" id="kru-test" type="button" style="width:100%;margin-top:11px;">' + esc(L.testPrint) + '</button>' +
              '<p class="kr-note">' + esc(L.testNote) + '</p>' +
            '</div></div>',
      foot: '<button class="kb ghost" id="kru-cancel" type="button">' + esc(L.cancel) + '</button>' +
            '<button class="kb primary" id="kru-save" type="button">' + esc(L.save) + '</button>',
    });
    var form = m.el.querySelector('#kru-form');
    var stage = m.el.querySelector('#kru-stage');

    /* ── petites fabriques de champs ── */
    function field(label, key, val, ph, ta) {
      return '<label class="kr-f"><span class="kr-l">' + esc(label) + '</span>' +
        (ta ? '<textarea class="kr-i" data-k="' + esc(key) + '" maxlength="240" placeholder="' + esc(ph || '') + '">' + esc(val || '') + '</textarea>'
            : '<input class="kr-i" data-k="' + esc(key) + '" maxlength="160" placeholder="' + esc(ph || '') + '" value="' + esc(val || '') + '"/>') +
        '</label>';
    }
    function select(label, key, val, options) {
      return '<label class="kr-f"><span class="kr-l">' + esc(label) + '</span>' +
        '<select class="kr-i" data-k="' + esc(key) + '">' +
        options.map(function (o) {
          return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
        }).join('') + '</select></label>';
    }
    function toggle(label, key, on) {
      return '<div class="kr-sw-row"><span>' + esc(label) + '</span>' +
        '<button class="kr-sw" type="button" role="switch" data-t="' + esc(key) + '" aria-checked="' + (on ? 'true' : 'false') + '" aria-label="' + esc(label) + '"></button></div>';
    }

    /* ── groupe 1 · identité & mentions légales (lecture seule) ── */
    function identityGroup() {
      var b = biz();
      var miss = K.LEGAL_FIELDS.filter(function (f) { return f.important && !b.legal[f.k]; })
        .map(function (f) { return { key: f.k, label: f.label[lang()] || f.label.fr }; });
      var missKeys = miss.map(function (x) { return x.key; });
      var rows = K.LEGAL_FIELDS.filter(function (f) { return f.important || b.legal[f.k]; }).map(function (f) {
        var v = b.legal[f.k];
        var lbl = f.label[lang()] || f.label.fr;
        return '<div><div class="k">' + esc(lbl) + '</div><div class="v' + (v ? '' : ' miss') + '">' +
          esc(v || (missKeys.indexOf(f.k) >= 0 ? (lang() === 'ar' ? 'ينقص' : lang() === 'en' ? 'missing' : 'à compléter') : '—')) + '</div></div>';
      }).join('');
      var h = '<div class="kr-g"><div class="kr-g-h">' + esc(L.gIdentity) + '</div><div class="kr-card">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:13px;">' +
          '<div><div style="font-size:15px;font-weight:600;">' + esc(b.name || opts.title || '') + '</div>' +
          '<div class="kr-note" style="margin-top:2px;">' + esc(L.sourceNote) + '</div></div>' +
          '<button class="kr-btn" id="kru-editbiz" type="button" style="flex-shrink:0;">' + esc(L.editBiz) + '</button>' +
        '</div>' +
        '<div class="kr-legal">' + rows + '</div>';
      if (miss.length) {
        h += '<div class="kr-warn"><b>' + esc(L.missingHead) + ' · ' + miss.map(function (x) { return esc(x.label); }).join(', ') +
             '</b><p>' + esc(L.missingBody) + '</p></div>';
      } else {
        h += '<div class="kr-ok">' + esc(L.allSet) + '</div>';
      }
      h += '<div class="kr-lock"><b>' + esc(L.lockedHead) + '</b><p>' + esc(L.lockedBody) + '</p></div>';
      return h + '</div></div>';
    }

    /* ── le formulaire ── */
    function render() {
      var h = identityGroup();

      /* 2 · apparence */
      h += '<div class="kr-g"><div class="kr-g-h">' + esc(L.gLook) + '</div><div class="kr-card">' +
        '<div class="kr-f"><span class="kr-l">' + esc(L.logo) + '</span><div class="kr-logo-box">' +
          '<div class="kr-logo-prev">' + (cfg.look.logo ? '<img alt="" src="' + esc(cfg.look.logo) + '"/>' : '<span style="font-size:10px;color:var(--n-500);">—</span>') + '</div>' +
          '<div><button class="kr-btn" id="kru-logo-add" type="button">' + esc(L.logoAdd) + '</button>' +
          (cfg.look.logo ? ' <button class="kr-btn" id="kru-logo-del" type="button">' + esc(L.logoDel) + '</button>' : '') +
          '<p class="kr-note">' + esc(L.logoHint) + '</p></div>' +
          '<input type="file" id="kru-logo-file" accept="image/png,image/jpeg" hidden/>' +
        '</div></div>' +
        '<div class="kr-2">' + field(L.header, 'look.header', cfg.look.header, L.headerPh) +
        field(L.tagline, 'look.tagline', cfg.look.tagline, L.taglinePh) + '</div>' +
        '<div class="kr-2">' +
        select(L.contact, 'look.contact', cfg.look.contact, [['full', L.cFull], ['compact', L.cCompact], ['off', L.cOff]]) +
        select(L.density, 'print.density', cfg.print.density, [['compact', L.dCompact], ['normal', L.dNormal], ['airy', L.dAiry]]) +
        '</div></div></div>';

      /* 3 · par vente */
      h += '<div class="kr-g"><div class="kr-g-h">' + esc(L.gSale) + '</div><div class="kr-card">' +
        toggle(L.showCashier, 'show.cashier', cfg.show.cashier) +
        toggle(L.showTerminal, 'show.terminal', cfg.show.terminal) +
        toggle(L.showCustomer, 'show.customer', cfg.show.customer) +
        toggle(L.showLoyalty, 'show.loyalty', cfg.show.loyalty) +
        toggle(L.showRef, 'show.itemRef', cfg.show.itemRef) +
        toggle(L.showBarcode, 'show.itemBarcode', cfg.show.itemBarcode) +
        '<div style="margin-top:14px;"><span class="kr-l">' + esc(L.legalShow) + '</span>' +
        toggle('ICE', 'show.legal.ice', cfg.show.legal.ice) +
        toggle('IF', 'show.legal.fiscal', cfg.show.legal.fiscal) +
        toggle('RC', 'show.legal.rc', cfg.show.legal.rc) +
        toggle('Patente', 'show.legal.patente', cfg.show.legal.patente) +
        toggle('CNSS', 'show.legal.cnss', cfg.show.legal.cnss) +
        '</div>' +
        '<div style="margin-top:14px;">' +
        select(L.vat, 'vat.mode', cfg.vat.mode, [['none', L.vatNone], ['rate', L.vatRate]]) +
        (cfg.vat.mode === 'rate' ? '<div class="kr-2">' +
          select(L.vatRateL, 'vat.rate', String(cfg.vat.rate), [['20', '20 %'], ['14', '14 %'], ['10', '10 %'], ['7', '7 %']]) +
          select(' ', 'vat.included', cfg.vat.included ? '1' : '0', [['1', L.vatIncl], ['0', L.vatExcl]]) +
          '</div>' : '<p class="kr-note">' + esc(L.vatNote) + '</p>') +
        '</div></div></div>';

      /* 4 · messages */
      h += '<div class="kr-g"><div class="kr-g-h">' + esc(L.gMsg) + '</div><div class="kr-card">' +
        field(L.welcome, 'msg.welcome', cfg.msg.welcome, L.welcomePh) +
        field(L.thanks, 'msg.thanks', cfg.msg.thanks, L.thanksPh) +
        field(L.policy, 'msg.policy', cfg.msg.policy, L.policyPh, true) +
        '<div class="kr-2">' + field(L.social, 'msg.social', cfg.msg.social, L.socialPh) +
        field(L.web, 'msg.web', cfg.msg.web, L.webPh) + '</div>' +
        '<div class="kr-2">' + field(L.whatsapp, 'msg.whatsapp', cfg.msg.whatsapp, L.whatsappPh) +
        select(L.qr, 'msg.qr', cfg.msg.qr, [['none', L.qrNone], ['web', L.qrWeb], ['whatsapp', L.qrWa], ['custom', L.qrCustom]]) + '</div>' +
        (cfg.msg.qr === 'custom' ? field(' ', 'msg.qrText', cfg.msg.qrText, L.qrTextPh) : '') +
        '</div></div>';

      /* 5 · format d'impression */
      var papers = (window.KiwiEscPos && window.KiwiEscPos.paperWidths)
        ? window.KiwiEscPos.paperWidths.filter(function (p) { return p.value !== '44'; }).map(function (p) { return [p.value, p.label]; })
        : [['80', '80 mm'], ['58', '58 mm']];
      h += '<div class="kr-g"><div class="kr-g-h">' + esc(L.gPrint) + '</div><div class="kr-card">' +
        '<div class="kr-2">' + select(L.paper, 'print.paper', cfg.print.paper, papers) +
        select(L.decimals, 'print.decimals', cfg.print.decimals, [['auto', L.dAuto], ['always', L.dAlways], ['never', L.dNever]]) + '</div>' +
        '<div class="kr-2">' +
        select(L.plang, 'print.lang', cfg.print.lang, [['auto', L.pauto], ['fr', 'Français'], ['en', 'English'], ['ar', 'العربية']]) +
        select(L.psecond, 'print.second', cfg.print.second, [['', L.pnone], ['fr', 'Français'], ['en', 'English'], ['ar', 'العربية']]) +
        '</div><p class="kr-note">' + esc(L.bilingualNote) + '</p>' +
        '</div></div>';

      form.innerHTML = h;
      paint();
    }

    /* ── l'aperçu : le VRAI moteur, avec la config en cours d'édition ── */
    function paint() {
      m.el.querySelectorAll('#kru-paper .kr-tab').forEach(function (b) {
        b.classList.toggle('on', b.dataset.p === previewPaper);
      });
      var doc = K.sample({ venueId: vid, config: cfg, business: biz(), paper: previewPaper });
      stage.innerHTML = K.html(doc);
      var tk = stage.querySelector('.kr-ticket');
      if (tk && previewPaper === '58') tk.classList.add('kr-w58');
    }

    /* ── écriture d'un chemin 'a.b.c' dans la config ── */
    function put(path, value) {
      var parts = path.split('.'), o = cfg;
      for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
      o[parts[parts.length - 1]] = value;
    }

    /* Un changement qui fait apparaître ou disparaître des CHAMPS repeint le
     * formulaire ; les autres ne repeignent que l'aperçu, sinon le curseur du
     * commerçant saute hors du champ à chaque lettre tapée. */
    var STRUCTURAL = { 'vat.mode': 1, 'msg.qr': 1 };

    form.addEventListener('input', function (e) {
      var el = e.target.closest('[data-k]');
      if (!el || el.tagName === 'SELECT') return;
      put(el.dataset.k, el.value);
      paint();
    });
    form.addEventListener('change', function (e) {
      var el = e.target.closest('select[data-k]');
      if (!el) return;
      var k = el.dataset.k, v = el.value;
      if (k === 'vat.rate') v = +v;
      if (k === 'vat.included') v = v === '1';
      put(k, v);
      cfg = K.normalizeConfig(cfg);
      if (STRUCTURAL[k]) render(); else paint();
    });
    form.addEventListener('click', function (e) {
      var sw = e.target.closest('.kr-sw');
      if (sw) {
        var on = sw.getAttribute('aria-checked') !== 'true';
        sw.setAttribute('aria-checked', on ? 'true' : 'false');
        put(sw.dataset.t, on);
        paint();
        return;
      }
      if (e.target.closest('#kru-editbiz')) {
        if (opts.onEditBusiness) { m.close(); setTimeout(function () { opts.onEditBusiness(vid); }, 90); }
        return;
      }
      if (e.target.closest('#kru-logo-add')) { var f = form.querySelector('#kru-logo-file'); if (f) f.click(); return; }
      if (e.target.closest('#kru-logo-del')) { cfg.look.logo = ''; render(); return; }
    });
    /* Le logo. Lu localement, jamais téléversé : il part avec la fiche reçu
     * (donc chez le commerçant, sur son serveur), pas dans un service tiers. */
    form.addEventListener('change', function (e) {
      var inp = e.target.closest('#kru-logo-file');
      if (!inp || !inp.files || !inp.files[0]) return;
      var file = inp.files[0];
      if (!/^image\/(png|jpeg)$/.test(file.type)) { toast(L.logoBad, 'info'); inp.value = ''; return; }
      if (file.size > 300 * 1024) { toast(L.logoBig, 'info'); inp.value = ''; return; }
      var fr = new FileReader();
      fr.onload = function () { cfg.look.logo = String(fr.result || ''); cfg.look.logoOn = true; render(); };
      fr.readAsDataURL(file);
    });

    m.el.querySelector('#kru-paper').addEventListener('click', function (e) {
      var b = e.target.closest('.kr-tab'); if (!b) return;
      previewPaper = b.dataset.p; paint();
    });

    m.el.querySelector('#kru-test').addEventListener('click', function () {
      toast(L.printing, 'info');
      var doc = K.sample({ venueId: vid, config: cfg, paper: previewPaper, copy: '' });
      Promise.resolve(K.print(doc)).then(function (r) {
        toast(r && r.ok ? L.printed : L.printFail, r && r.ok ? 'success' : 'info');
      }, function () { toast(L.printFail, 'info'); });
    });

    m.el.querySelector('#kru-cancel').addEventListener('click', function () { m.close(); });
    m.el.querySelector('#kru-save').addEventListener('click', function () {
      var saved = K.saveConfig(cfg, vid);
      m.close();
      toast(L.saved, 'success');
      /* La remontée part en différé : on regarde une seconde plus tard si le
         serveur l'a refusée. Un reçu enregistré ici mais jamais accepté là-bas
         n'atteindra pas le comptoir, et le commerçant doit l'apprendre
         maintenant — pas en découvrant l'ancien ticket dans la main du client. */
      setTimeout(function () {
        try { if (K.syncRefused && K.syncRefused()) toast(L.notSynced, 'info'); } catch (_) {}
      }, 2500);
      if (opts.onSave) { try { opts.onSave(saved); } catch (_) {} }
    });

    function toast(msg, type) { try { Kw().toast(msg, { type: type || 'info', force: true }); } catch (_) {} }

    render();
    return m;
  }

  /* Une pastille d'état pour une fiche établissement : « Reçu réglé » /
   * « mentions manquantes ». Rendue en HTML, à insérer par l'appelant. */
  function badge(venueId) {
    var K = R(); if (!K) return '';
    var miss = K.missing(venueId);
    var L = t();
    if (!miss.length) {
      return '<span style="font-size:11px;font-weight:600;color:var(--success,#16a34a);">' +
        esc(lang() === 'ar' ? 'مكتمل' : lang() === 'en' ? 'Complete' : 'Complet') + '</span>';
    }
    return '<span style="font-size:11px;font-weight:600;color:var(--danger,#dc2626);">' +
      esc(miss.length + ' ' + (lang() === 'ar' ? 'ناقص' : lang() === 'en' ? 'missing' : 'à compléter')) + '</span>';
  }

  window.KiwiReceiptUI = { open: open, badge: badge, ensureCSS: ensureCSS };
})();
