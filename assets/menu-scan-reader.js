/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · MENU SCAN READER — window.KiwiMenuScanReader
 * ---------------------------------------------------------------------------
 * What « Scanner un menu » reads, without its screen: the PDF it is handed
 * (text layer, or bounded page images when the PDF is a scan) and the
 * conversion of the extracted articles into the menu import's CSV.
 *
 * Moved out of menu-scan.js on 28 October 2026 (thirteenth blind rating,
 * vision#0): the controller mixed its modal with pdf.js loading and page
 * rendering. It keeps the modal, the steps and the API call; this file keeps
 * the reading. It touches no global but pdf.js's own (window.pdfjsLib).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const MAX_PDF_PAGES = 12;     // une carte de plus de 12 pages est un catalogue
  const MAX_IMG_EDGE = 1600;    // px, assez pour lire les prix, léger à envoyer

  /* ── CSV de sortie ──────────────────────────────────────────────────────────
   * Colonnes exactes de l'import carte (catalog-import.js). Point-virgule et
   * guillemets échappés : une description contenant « ; » ne casse pas la ligne. */
  function csvField(v) {
    const s = String(v == null ? '' : v).replace(/\r?\n/g, ' ').trim();
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  /* A price the scan could not read stays EMPTY: the import then flags the row
   * « prix manquant » and refuses to create it, where a 0 would silently put a
   * free dish on the menu. */
  function csvPrice(v) {
    if (v == null || (typeof v === 'string' && !v.trim()) || typeof v === 'boolean') return '';
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? String(n) : '';
  }
  function toCsvText(items) {
    const head = 'article;categorie;sous_categorie;prix_mad;description;disponible';
    const lines = (items || []).map((it) => [
      csvField(it.name), csvField(it.cat), csvField(it.sub),
      csvPrice(it.price), csvField(it.desc), 'oui',
    ].join(';'));
    return head + '\n' + lines.join('\n');
  }

  /* Deux pages d'une même carte répètent souvent l'en-tête ou un plat vedette :
   * Même nom et catégorie : seuls les doublons identiques disparaissent.
   * Prix ou description différents : les deux lignes restent à vérifier. */
  function dedupe(items) {
    const groups = new Map(), out = [];
    for (const it of items || []) {
      if (!it.name) continue;
      const k = String(it.name).toLowerCase().trim() + '\0' + String(it.cat || '').toLowerCase().trim();
      const group = groups.get(k) || [];
      if (group.some((old) => Number(old.price || 0) === Number(it.price || 0) && String(old.desc || '') === String(it.desc || '') && String(old.sub || '') === String(it.sub || ''))) continue;
      const row = { ...it };
      if (group.length) { row.needsReview = true; group.forEach((old) => { old.needsReview = true; }); }
      group.push(row); groups.set(k, group); out.push(row);
    }
    return out;
  }

  /* ── pdf.js à la demande (même vendored build que le scan de factures) ── */
  let pdfjsPromise = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfjsPromise) return pdfjsPromise;
    pdfjsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'assets/vendor/pdfjs/pdf.min.js';
      script.onload = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdfjs/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        } else resolve(null);
      };
      script.onerror = () => { pdfjsPromise = null; reject(new Error('pdfjs')); };
      (document.head || document.documentElement).appendChild(script);
    });
    let timer;
    const loading = pdfjsPromise;
    pdfjsPromise = Promise.race([loading, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('pdf-timeout')), 15000); })]).catch(error => { pdfjsPromise = null; throw error; }).finally(() => clearTimeout(timer));
    return pdfjsPromise;
  }

  // One deadline covers preparation, including file reads, loader and worker.
  async function prepare(file, signal, read) {
    let timer, task, pdf, renderTask, abort, ended = false;
    const stopped = new Promise((_, reject) => {
      abort = () => { reject(new Error('pdf-cancelled')); cleanup(); };
      timer = setTimeout(() => { reject(new Error('pdf-timeout')); cleanup(); }, 15000);
      if (signal) signal.addEventListener('abort', abort, { once: true });
    });
    function cleanup() {
      ended = true;
      try { renderTask?.cancel(); } catch (_) {}
      try { const result = task?.destroy(); result?.catch(() => {}); } catch (_) {}
    }
    try {
      if (ended || signal?.aborted) throw new Error('pdf-cancelled');
      return await Promise.race([stopped, (async () => {
        const pdfjs = await loadPdfJs();
        if (!pdfjs) throw new Error('pdfjs');
        if (ended || signal?.aborted) throw new Error('pdf-cancelled');
        const data = await file.arrayBuffer();
        if (ended || signal?.aborted) throw new Error('pdf-cancelled');
        task = pdfjs.getDocument({ data, isEvalSupported: false });
        pdf = await task.promise;
        if (ended) throw new Error('pdf-cancelled');
        return read(pdf, task => { renderTask = task; }, () => { if (ended) throw new Error('pdf-cancelled'); });
      })()]);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); cleanup(); }
  }

  async function pdfText(file, metadata = false, signal) {
    return prepare(file, signal, async (pdf, _, check) => {
      let full = '';
      for (let i = 1; i <= Math.min(pdf.numPages, MAX_PDF_PAGES); i++) {
        check();
        const page = await pdf.getPage(i);
        check();
        const content = await page.getTextContent();
        check();
        full += (content.items || []).map(it => it.str).join(' ') + '\n';
      }
      const result = { text: full.trim(), pageCount: pdf.numPages, pagesRead: Math.min(pdf.numPages, MAX_PDF_PAGES), truncated: pdf.numPages > MAX_PDF_PAGES };
      return metadata ? result : result.text;
    });
  }

  /* Image-only PDFs: all pages up to the same disclosed 12-page bound. */
  async function pdfFirstPageImage(file, metadata = false, signal) {
    return prepare(file, signal, async (pdf, rendering, check) => {
      const images = [];
      for (let i = 1; i <= Math.min(pdf.numPages, MAX_PDF_PAGES); i++) {
        check();
        const page = await pdf.getPage(i);
        check();
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(2, MAX_IMG_EDGE / Math.max(base.width, base.height)) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
        const task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
        rendering(task); await task.promise; check();
        images.push(canvas.toDataURL('image/jpeg', 0.85));
        canvas.width = canvas.height = 0;
      }
      return metadata ? { image: images[0], images, pageCount: pdf.numPages, pagesRead: images.length, truncated: pdf.numPages > MAX_PDF_PAGES } : images[0];
    });
  }

  window.KiwiMenuScanReader = Object.freeze({ toCsvText, dedupe, pdfText, pdfFirstPageImage, MAX_PDF_PAGES, MAX_IMG_EDGE });
})();
