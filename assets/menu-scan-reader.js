/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · MENU SCAN READER — window.KiwiMenuScanReader
 * ---------------------------------------------------------------------------
 * What « Scanner un menu » reads, without its screen: the PDF it is handed
 * (text layer, or the first page as an image when the PDF is a scan) and the
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
  function toCsvText(items) {
    const head = 'article;categorie;sous_categorie;prix_mad;description;disponible';
    const lines = (items || []).map((it) => [
      csvField(it.name), csvField(it.cat), csvField(it.sub),
      String(Number.isFinite(+it.price) ? +it.price : 0), csvField(it.desc), 'oui',
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
    return pdfjsPromise;
  }

  async function openPdf(file) {
    const pdfjs = await loadPdfJs();
    if (!pdfjs) throw new Error('pdfjs');
    return pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  }

  async function pdfText(file, metadata = false) {
    const pdf = await openPdf(file);
    let full = '';
    for (let i = 1; i <= Math.min(pdf.numPages, MAX_PDF_PAGES); i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      full += (content.items || []).map((it) => it.str).join(' ') + '\n';
    }
    const result = { text: full.trim(), pageCount: pdf.numPages, pagesRead: Math.min(pdf.numPages, MAX_PDF_PAGES), truncated: pdf.numPages > MAX_PDF_PAGES };
    return metadata ? result : result.text;
  }

  /* PDF scanné : seule la première page est envoyée au modèle vision. */
  async function pdfFirstPageImage(file, metadata = false) {
    const pdf = await openPdf(file);
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2, MAX_IMG_EDGE / Math.max(base.width, base.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const image = canvas.toDataURL('image/jpeg', 0.85);
    return metadata ? { image, pageCount: pdf.numPages, pagesRead: 1, truncated: pdf.numPages > 1 } : image;
  }

  window.KiwiMenuScanReader = Object.freeze({ toCsvText, dedupe, pdfText, pdfFirstPageImage, MAX_PDF_PAGES, MAX_IMG_EDGE });
})();
