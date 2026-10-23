/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · MENU SCAN — window.KiwiMenuScan
 * ---------------------------------------------------------------------------
 * « Scanner un menu » : le restaurateur apporte sa carte sous la forme qu'il
 * a — photo, PDF, lien vers un menu en ligne, ou texte collé — et Kiwi AI
 * (Workers AI, hébergé Cloudflare) en extrait tous les articles.
 *
 * Ce module ne SAISIT rien dans la carte. Il normalise l'entrée (photos
 * réduites côté client, PDF lu par pdf.js, lien envoyé tel quel), appelle
 * POST /api/ai/menu-import, puis convertit la réponse en CSV et la remet à
 * KiwiCatalogImport.openMenuWithCsv — la MÊME revue « rien n'est écrit avant
 * confirmation » que l'import Excel. Un seul chemin d'écriture, une seule
 * revue à connaître.
 *
 * Dépend de : Kiwi.modal · KiwiCatalogImport · assets/vendor/pdfjs (à la
 * demande). Fail-soft : sans backend (démo locale, hors ligne), l'appel AI
 * échoue proprement et le commerçant garde l'import CSV et la saisie manuelle.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (t, o) => { try { window.Kiwi && Kiwi.toast && Kiwi.toast(t, o); } catch (_) {} };

  const COPY = {
  "fr": {
    "title": "Scanner un menu",
    "cancel": "Annuler",
    "close": "Fermer",
    "drop": "Photo, PDF ou capture de votre carte",
    "hint": "Déposez jusqu'à {n} fichiers, ou cliquez pour les choisir",
    "pick": "Choisir des fichiers",
    "camera": "Prendre une photo",
    "orLink": "ou un lien",
    "urlPlaceholder": "https://le-menu-en-ligne-du-restaurant…",
    "readLink": "Lire le lien",
    "paste": "Coller le texte du menu à la place",
    "disclosure": "Analyse par Kiwi AI (hébergée Cloudflare). Rien n'est ajouté à votre carte avant votre confirmation.",
    "pasteLabel": "Collez le texte de votre carte (articles, prix, sections)",
    "sample": "TAJINE POULET CITRON … 95\nCOUSCOUS ROYAL … 110",
    "back": "Retour",
    "analyse": "Analyser",
    "unavailable": "Import indisponible",
    "reload": "Rechargez la page.",
    "reading": "Lecture {n} / {total}",
    "pdf": "Lecture du PDF…",
    "photo": "Lecture de la photo…",
    "extract": "Kiwi AI extrait les articles et les prix.",
    "link": "Lecture du lien…",
    "text": "Analyse du texte…",
    "authTitle": "Compte Kiwi requis",
    "authDesc": "Le scan AI fonctionne avec un compte connecté. L'import CSV reste disponible.",
    "quotaTitle": "Limite du jour atteinte",
    "quotaDesc": "Réessayez demain, ou passez par l'import CSV.",
    "jsTitle": "Ce site ne se laisse pas lire",
    "jsDesc": "Le menu est rendu par JavaScript. Prenez une photo ou un PDF de la carte à la place.",
    "urlTitle": "Lien injoignable",
    "urlDesc": "Vérifiez l'adresse, ou prenez une photo de la carte.",
    "statusDesc": "La page a répondu par une erreur. Prenez une photo de la carte à la place.",
    "unparsedTitle": "Carte illisible",
    "unparsedDesc": "Le modèle n'a pas reconnu d'articles. Essayez une photo plus nette ou l'import CSV.",
    "failedTitle": "Scan impossible",
    "failedDesc": "Réessayez, ou passez par l'import CSV."
  },
  "en": {
    "title": "Scan a menu",
    "cancel": "Cancel",
    "close": "Close",
    "drop": "Photo, PDF or screenshot of your menu",
    "hint": "Drop up to {n} files, or click to choose them",
    "pick": "Choose files",
    "camera": "Take a photo",
    "orLink": "or a link",
    "urlPlaceholder": "https://restaurant-menu-online…",
    "readLink": "Read link",
    "paste": "Paste menu text instead",
    "disclosure": "Analysed by Kiwi AI (hosted on Cloudflare). Nothing is added to your menu until you confirm.",
    "pasteLabel": "Paste your menu text (items, prices, sections)",
    "sample": "LEMON CHICKEN TAGINE … 95\nROYAL COUSCOUS … 110",
    "back": "Back",
    "analyse": "Analyse",
    "unavailable": "Import unavailable",
    "reload": "Reload the page.",
    "reading": "Reading {n} / {total}",
    "pdf": "Reading PDF…",
    "photo": "Reading photo…",
    "extract": "Kiwi AI is extracting items and prices.",
    "link": "Reading link…",
    "text": "Analysing text…",
    "authTitle": "Kiwi account required",
    "authDesc": "AI scanning requires a signed-in account. CSV import is still available.",
    "quotaTitle": "Daily limit reached",
    "quotaDesc": "Try again tomorrow, or import a CSV file.",
    "jsTitle": "This site cannot be read",
    "jsDesc": "This menu uses JavaScript. Use a photo or PDF of the menu instead.",
    "urlTitle": "Link unavailable",
    "urlDesc": "Check the address, or take a photo of the menu.",
    "statusDesc": "The page returned an error. Use a photo of the menu instead.",
    "unparsedTitle": "Menu could not be read",
    "unparsedDesc": "No items were recognised. Try a clearer photo or import a CSV file.",
    "failedTitle": "Scan failed",
    "failedDesc": "Try again, or import a CSV file."
  },
  "ar": {
    "title": "مسح قائمة الطعام",
    "cancel": "إلغاء",
    "close": "إغلاق",
    "drop": "صورة أو PDF أو لقطة شاشة لقائمة الطعام",
    "hint": "أضف حتى {n} ملفات، أو اضغط لاختيارها",
    "pick": "اختيار ملفات",
    "camera": "التقاط صورة",
    "orLink": "أو رابط",
    "urlPlaceholder": "https://رابط-قائمة-المطعم…",
    "readLink": "قراءة الرابط",
    "paste": "لصق نص القائمة",
    "disclosure": "التحليل بواسطة Kiwi AI المستضاف على Cloudflare. لا يُضاف أي صنف إلى قائمتك قبل تأكيدك.",
    "pasteLabel": "الصق نص القائمة (الأصناف والأسعار والأقسام)",
    "sample": "طاجين دجاج بالليمون … 95\nكسكس ملكي … 110",
    "back": "رجوع",
    "analyse": "تحليل",
    "unavailable": "الاستيراد غير متاح",
    "reload": "أعد تحميل الصفحة.",
    "reading": "قراءة {n} / {total}",
    "pdf": "جارٍ قراءة PDF…",
    "photo": "جارٍ قراءة الصورة…",
    "extract": "يستخرج Kiwi AI الأصناف والأسعار.",
    "link": "جارٍ قراءة الرابط…",
    "text": "جارٍ تحليل النص…",
    "authTitle": "يلزم حساب Kiwi",
    "authDesc": "يتطلب المسح بالذكاء الاصطناعي تسجيل الدخول. يمكنك استيراد ملف CSV.",
    "quotaTitle": "بلغت الحد اليومي",
    "quotaDesc": "حاول غداً، أو استورد ملف CSV.",
    "jsTitle": "تعذّرت قراءة هذا الموقع",
    "jsDesc": "تستخدم هذه القائمة JavaScript. استعمل صورة أو ملف PDF للقائمة.",
    "urlTitle": "الرابط غير متاح",
    "urlDesc": "تحقق من العنوان، أو التقط صورة للقائمة.",
    "statusDesc": "حدث خطأ في الصفحة. استعمل صورة للقائمة.",
    "unparsedTitle": "تعذّرت قراءة القائمة",
    "unparsedDesc": "لم يتم التعرف على أي صنف. جرّب صورة أوضح أو استورد ملف CSV.",
    "failedTitle": "تعذّر المسح",
    "failedDesc": "حاول مجدداً، أو استورد ملف CSV."
  }
};
  function language() {
    try {
      const l = (window.Kiwi && Kiwi.lang && Kiwi.lang()) || window.KiwiI18n?.getLang?.() || window.KiwiMenuI18n?.lang?.() || localStorage.getItem('kiwiLang') || document.documentElement.lang || 'fr';
      return COPY[l] ? l : 'fr';
    } catch (_) { return COPY[document.documentElement.lang] ? document.documentElement.lang : 'fr'; }
  }
  function ui(key, params = {}) {
    return COPY[language()][key].replace(/\{(\w+)\}/g, (_, k) => String(params[k]));
  }

  const MAX_FILES = 6;        // une carte fait rarement plus de 6 pages
  const MAX_IMG_EDGE = 1600;  // px — assez pour lire les prix, léger à envoyer

  /* ── CSV de sortie ──────────────────────────────────────────────────────────
   * Colonnes exactes de l'import carte (catalog-import.js). Point-virgule et
   * guillemets échappés : une description contenant « ; » ne casse pas la ligne. */
  function csvField(v) {
    const s = String(v == null ? '' : v).replace(/\r?\n/g, ' ').trim();
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsvText(items) {
    const head = 'article;categorie;sous_categorie;prix_mad;description;disponible';
    const lines = (items || []).map((it) => [
      csvField(it.name), csvField(it.cat), csvField(it.sub),
      String(Number.isFinite(+it.price) ? +it.price : 0), csvField(it.desc), 'oui',
    ].join(';'));
    return head + '\n' + lines.join('\n');
  }

  /* ── pdf.js à la demande (même vendored build que le scan de factures) ── */
  let _pdfjsPromise = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (_pdfjsPromise) return _pdfjsPromise;
    _pdfjsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'assets/vendor/pdfjs/pdf.min.js';
      script.onload = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdfjs/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        } else resolve(null);
      };
      script.onerror = () => reject(new Error('pdfjs'));
      (document.head || document.documentElement).appendChild(script);
    });
    return _pdfjsPromise;
  }

  async function extractPdfText(file) {
    const pdfjs = await loadPdfJs();
    const ab = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: ab, isEvalSupported: false }).promise;
    const maxPages = Math.min(pdf.numPages, 12);
    let full = '';
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      full += (content.items || []).map((it) => it.str).join(' ') + '\n';
    }
    return full.trim();
  }

  /* Une photo de carte en 4000×3000 n'apprend rien de plus au modèle qu'en
   * 1600 px de grand côté — mais coûte dix fois plus à envoyer. */
  function downscaleImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, MAX_IMG_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }

  async function callApi(payload) {
    const venue = (window.Kiwi && Kiwi.venue && Kiwi.venue()) || '';
    const lang = language();
    const res = await fetch('/api/ai/menu-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ merchant: venue, targetLang: lang }, payload)),
    });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (res.status === 401) throw new Error('auth');
    if (res.status === 429) throw new Error('quota');
    if (!res.ok) throw new Error('server');
    if (!data || !data.ok) throw new Error((data && (data.reason || data.error)) || 'unparsed');
    return data.items || [];
  }

  const FAIL_KEYS = {
    auth: ['authTitle', 'authDesc'], quota: ['quotaTitle', 'quotaDesc'],
    'js-only': ['jsTitle', 'jsDesc'], 'url-fetch': ['urlTitle', 'urlDesc'],
    'url-status': ['urlTitle', 'statusDesc'], unparsed: ['unparsedTitle', 'unparsedDesc'],
  };
  function failToast(err) {
    const [t, d] = FAIL_KEYS[err && err.message] || ['failedTitle', 'failedDesc'];
    toast(ui(t), { type: 'warn', desc: ui(d) });
  }

  /* ── styles du modal (injectés une fois, préfixe kms-) ── */
  function ensureCss() {
    if (document.getElementById('kms-css')) return;
    const s = document.createElement('style');
    s.id = 'kms-css';
    s.textContent = '.kms-or{display:flex;align-items:center;gap:12px;margin:16px 0 12px;color:var(--n-500);font-size:11px;letter-spacing:.06em;text-transform:uppercase}.kms-or:before,.kms-or:after{content:"";flex:1;height:1px;background:var(--n-200)}.kms-url{display:flex;gap:8px}.kms-url input{flex:1;min-width:0;padding:11px 13px;border:1px solid var(--n-200);border-radius:10px;background:var(--surface);color:var(--ink);font-size:13px}.kms-url button{white-space:nowrap}.kms-paste{display:block;margin:14px auto 0;padding:0;border:0;background:none;color:var(--atlas);font-size:12.5px;text-decoration:underline;cursor:pointer}.kms-ta{width:100%;min-height:180px;margin-top:10px;padding:12px;border:1px solid var(--n-200);border-radius:10px;background:var(--surface);color:var(--ink);font:12.5px/1.5 var(--mono,monospace)}.kms-busy{text-align:center;padding:44px 20px}.kms-busy .sp{width:34px;height:34px;margin:0 auto 16px;border:3px solid var(--n-200);border-top-color:var(--atlas);border-radius:50%;animation:kms-spin .8s linear infinite}@keyframes kms-spin{to{transform:rotate(360deg)}}.kms-busy b{display:block;font-size:15px;margin-bottom:4px}.kms-busy span{font-size:12px;color:var(--n-500)}.kms-note{margin-top:10px;font-size:11.5px;color:var(--n-500);text-align:center}';
    document.head.appendChild(s);
  }

  function busyHtml(title, sub) {
    return '<div class="kms-busy"><div class="sp"></div><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></div>';
  }

  function stage1Html() {
    return [
      '<div class="st-dropzone" data-kms-drop tabindex="0" role="button">',
      '  <div class="st-dropzone-t">' + esc(ui('drop')) + '</div>',
      '  <div class="st-dropzone-s">' + esc(ui('hint', { n: MAX_FILES })) + '</div>',
      '  <div style="display:flex;gap:10px;justify-content:center;margin-top:12px;">',
      '    <button class="st-btn" type="button" data-kms-pick>' + esc(ui('pick')) + '</button>',
      '    <button class="st-btn" type="button" data-kms-cam>' + esc(ui('camera')) + '</button>',
      '  </div>',
      '</div>',
      '<input type="file" hidden multiple accept="application/pdf,image/*" data-kms-file />',
      '<input type="file" hidden accept="image/*" capture="environment" data-kms-camfile />',
      '<div class="kms-or">' + esc(ui('orLink')) + '</div>',
      '<div class="kms-url"><input type="url" placeholder="' + esc(ui('urlPlaceholder')) + '" data-kms-url /><button class="st-btn" type="button" data-kms-go-url>' + esc(ui('readLink')) + '</button></div>',
      '<button class="kms-paste" type="button" data-kms-paste>' + esc(ui('paste')) + '</button>',
      '<div class="kms-note">' + esc(ui('disclosure')) + '</div>',
    ].join('');
  }

  function pasteHtml() {
    return [
      '<label style="font-size:12px;color:var(--n-500);">' + esc(ui('pasteLabel')) + '</label>',
      '<textarea class="kms-ta" data-kms-text placeholder="' + esc(ui('sample')) + '"></textarea>',
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">',
      '  <button class="st-btn" type="button" data-kms-back>' + esc(ui('back')) + '</button>',
      '  <button class="st-btn" type="button" data-kms-go-text style="background:var(--atlas);color:#fff;border-color:var(--atlas);">' + esc(ui('analyse')) + '</button>',
      '</div>',
    ].join('');
  }

  function open(opts) {
    opts = opts || {};
    ensureCss();
    if (!window.Kiwi || !Kiwi.modal) return;
    if (!window.KiwiCatalogImport || !KiwiCatalogImport.openMenuWithCsv) {
      toast(ui('unavailable'), { type: 'warn', desc: ui('reload') });
      return;
    }

    const m = Kiwi.modal({
      tag: 'Kiwi AI', title: ui('title'), width: 620,
      body: '<div data-kms-stage></div>',
      foot: '<button class="st-btn" data-kms-cancel type="button">' + esc(ui('cancel')) + '</button>',
    });
    m.el.setAttribute('dir', language() === 'ar' ? 'rtl' : 'ltr');
    m.el.setAttribute('lang', language());
    const close = m.el.querySelector('.kiwi-modal-close');
    if (close) close.setAttribute('aria-label', ui('close'));
    const stage = m.el.querySelector('[data-kms-stage]');
    let busy = false;

    function render() { stage.innerHTML = stage1Html(); }

    /* Le résultat AI part dans la revue d'import — et CE modal se ferme :
     * la revue devient la seule surface, pas une pile de fenêtres. */
    function review(items) {
      if (!items.length) { failToast(new Error('unparsed')); render(); return; }
      m.close();
      KiwiCatalogImport.openMenuWithCsv(toCsvText(items), { onDone: opts.onDone });
    }

    async function runFiles(files) {
      if (busy) return;
      const list = [...files].slice(0, MAX_FILES);
      if (!list.length) return;
      busy = true;
      try {
        const collected = [];
        for (let i = 0; i < list.length; i++) {
          const f = list[i];
          const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
          stage.innerHTML = busyHtml(
            list.length > 1 ? ui('reading', { n: i + 1, total: list.length }) : (isPdf ? ui('pdf') : ui('photo')),
            ui('extract')
          );
          if (isPdf) {
            const text = await extractPdfText(f);
            /* Un PDF scanné (image pure) n'a pas de couche texte : on le rend
             * en image et on passe par le modèle vision plutôt que d'échouer. */
            if (text && text.length > 60) collected.push(...await callApi({ kind: 'text', text }));
            else collected.push(...await callApi({ kind: 'image', image: await pdfPageToImage(f) }));
          } else {
            collected.push(...await callApi({ kind: 'image', image: await downscaleImage(f) }));
          }
        }
        review(dedupe(collected));
      } catch (err) { failToast(err); render(); }
      busy = false;
    }

    async function runUrl(url) {
      if (busy || !url) return;
      busy = true;
      stage.innerHTML = busyHtml(ui('link'), ui('extract'));
      try { review(dedupe(await callApi({ kind: 'url', url }))); }
      catch (err) { failToast(err); render(); }
      busy = false;
    }

    async function runText(text) {
      if (busy || !text) return;
      busy = true;
      stage.innerHTML = busyHtml(ui('text'), ui('extract'));
      try { review(dedupe(await callApi({ kind: 'text', text }))); }
      catch (err) { failToast(err); render(); }
      busy = false;
    }

    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-kms-cancel]')) { m.close(); return; }
      if (e.target.closest('[data-kms-pick]') || e.target.closest('[data-kms-drop]')) {
        if (!e.target.closest('[data-kms-cam]')) { m.el.querySelector('[data-kms-file]').click(); return; }
      }
      if (e.target.closest('[data-kms-cam]')) { m.el.querySelector('[data-kms-camfile]').click(); return; }
      if (e.target.closest('[data-kms-go-url]')) { runUrl((m.el.querySelector('[data-kms-url]') || {}).value?.trim()); return; }
      if (e.target.closest('[data-kms-paste]')) { stage.innerHTML = pasteHtml(); return; }
      if (e.target.closest('[data-kms-back]')) { render(); return; }
      if (e.target.closest('[data-kms-go-text]')) { runText((m.el.querySelector('[data-kms-text]') || {}).value?.trim()); return; }
    });
    m.el.addEventListener('change', (e) => {
      if (e.target.matches('[data-kms-file]') || e.target.matches('[data-kms-camfile]')) runFiles(e.target.files || []);
    });
    ['dragenter', 'dragover'].forEach((n) => m.el.addEventListener(n, (e) => {
      if (e.target.closest('[data-kms-drop]')) { e.preventDefault(); e.target.closest('[data-kms-drop]').classList.add('is-dragover'); }
    }));
    m.el.addEventListener('dragleave', (e) => {
      const d = e.target.closest('[data-kms-drop]'); if (d) d.classList.remove('is-dragover');
    });
    m.el.addEventListener('drop', (e) => {
      const d = e.target.closest('[data-kms-drop]'); if (!d) return;
      e.preventDefault(); d.classList.remove('is-dragover');
      if (e.dataTransfer && e.dataTransfer.files) runFiles(e.dataTransfer.files);
    });

    render();
    return m;
  }

  /* Deux pages d'une même carte répètent souvent l'en-tête ou un plat vedette :
   * même nom + même catégorie = même article, on garde la première occurrence. */
  function dedupe(items) {
    const seen = new Set();
    return (items || []).filter((it) => {
      const k = String(it.name || '').toLowerCase().trim() + ' ' + String(it.cat || '').toLowerCase().trim();
      if (!it.name || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /* PDF scanné → image JPEG de la première page (le vision lit le reste). */
  async function pdfPageToImage(file) {
    const pdfjs = await loadPdfJs();
    const ab = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: ab, isEvalSupported: false }).promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, MAX_IMG_EDGE / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  window.KiwiMenuScan = { open, _toCsvText: toCsvText, _dedupe: dedupe };
})();
