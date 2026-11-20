/* Stock · photo. Une photo de bon de livraison ou de facture, ou la première
 * page d'un PDF scanné (sans couche texte), devient un JPEG réduit que
 * /api/ai/invoice (kind 'image') fait lire par son duo vision. Sorti de
 * intake.js, au plafond de taille (tools/file-size-ratchet-test.mjs). */
window.KiwiStockInternal.install('photo', () => {
  'use strict';
  /* Une photo (File) ou une page rendue (canvas) → JPEG ≤ 1600 px sous 2,4 Mo, le plafond de /api/ai/invoice. */
  async function stPhotoDataUrl(src) {
    let c = src;
    if (!(src instanceof HTMLCanvasElement)) {
      const url = URL.createObjectURL(src), img = new Image();
      try { img.src = url; await img.decode(); } finally { URL.revokeObjectURL(url); }
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    }
    let q = 0.85, out = c.toDataURL('image/jpeg', q);
    while (out.length > 2400000 && q > 0.4) out = c.toDataURL('image/jpeg', q -= 0.15);
    return out;
  }
  async function stPdfPageCanvas(file, pdfjs) { // première page d'un PDF scanné
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
    const page = await pdf.getPage(1), v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(3, 1600 / Math.max(v1.width, v1.height)) }), c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return c;
  }

  return { stPhotoDataUrl, stPdfPageCanvas };
});
