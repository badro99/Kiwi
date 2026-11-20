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
      let img = new Image();
      const url = URL.createObjectURL(src);
      try { img.src = url; await img.decode(); }
      /* Une photo d'iPhone (HEIC) que le navigateur ne sait pas ouvrir : Chrome
         et Firefox sur ordinateur. Le scan tombait sur une table vide sans rien
         dire (BL Lahlou Menage, 20 nov. 2026). libheif la décode ici. */
      catch (e) { if (!(await stIsHeif(src))) throw e; img = await stHeifCanvas(src); }
      finally { URL.revokeObjectURL(url); }
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      const k = Math.min(1, 1600 / Math.max(w, h));
      c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
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

  /* HEIC/HEIF : la marque du conteneur (octets 8 à 12), pas le nom ni le type MIME, que Chrome laisse souvent vide. */
  async function stIsHeif(file) {
    try {
      const b = new TextDecoder().decode(await file.slice(8, 12).arrayBuffer()).replace(/\0/g, '').trim();
      return /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(b);
    } catch (_) { return false; }
  }
  /* libheif 1.23.5 (assets/vendor/libheif, LGPL), chargé à la demande : 2 Mo
     qu'aucun autre écran ne paie. Les anciennes versions (heic2any, heic-to)
     refusent les photos des iPhone récents (marques MiHB/MiHA, carte de gain). */
  let heifLib = null;
  function stLoadHeif() {
    if (heifLib) return heifLib;
    heifLib = new Promise((resolve, reject) => {
      if (typeof window.libheif === 'function') { resolve(window.libheif()); return; }
      const s = document.createElement('script');
      s.src = '/assets/vendor/libheif/libheif.min.js?v=1';
      s.onload = () => { try { resolve(window.libheif()); } catch (e) { reject(e); } };
      s.onerror = () => reject(new Error('heif-unavailable'));
      document.head.appendChild(s);
    }).catch((e) => { heifLib = null; throw e; });
    return heifLib;
  }
  async function stHeifCanvas(file) {
    const lib = await stLoadHeif();
    const dec = new lib.HeifDecoder();
    const images = dec.decode(new Uint8Array(await file.arrayBuffer()));
    if (!images || !images.length) throw new Error('heif-empty');
    const im = images[0], w = im.get_width(), h = im.get_height();
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), data = g.createImageData(w, h);
    await new Promise((resolve, reject) => im.display(data, (d) => (d ? resolve() : reject(new Error('heif-display')))));
    g.putImageData(data, 0, 0);
    try { im.free && im.free(); } catch (_) {}
    return c;
  }

  return { stPhotoDataUrl, stPdfPageCanvas, stIsHeif };
});
