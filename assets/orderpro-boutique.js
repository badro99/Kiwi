/* Private OrderPro boutique bridge. Reads: $, escapeHtml, money, t, toCents.
 * Browser capabilities: tools/fixtures/orderpro/interfaces.json. Original bodies below are unchanged. */
KiwiOrderMenu.orderProParts.run('boutique', function (scope) {
  with (scope) {
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/orderpro-boutique.js · OrderPro's boutique vertical: the
 * product list and the barcode lookup, consultation only.
 *
 * Moved out of OrderPro.html's own script (design 2027 §19, stage 3c): a
 * restaurant never runs it, so its guests no longer download it. OrderPro
 * loads it from <template id="orderpro-lazy"> (KiwiOrderMenu.need('boutique'))
 * for a boutique only, before bootBoutique(). Like orderpro-guest.js it is a
 * classic script that shares the page's globals ($, t, escapeHtml, money,
 * STORE, gotoScreen…), and its own functions are globals the page calls,
 * each behind `typeof … === 'function'`.
 * ═══════════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════
   BOUTIQUE — product list + barcode lookup. Consultation only.
   Published shape (assets/boutique-catalog.js):
     { categories:[{id,name}],
       products:[{id,name,categoryId,priceMAD,photo,archived}],
       variants:[{id,productId,colorId,size,stock,barcodes:[{code}|"code"]}],
       colors:[{id,label,hex}] }
   ═══════════════════════════════════════════════════════════════════════ */
const BQ = { products: [], byId: new Map(), byCode: new Map(), colors: new Map(), filter: '' };

function bootBoutique(data) {
  const products = (Array.isArray(data.products) ? data.products : []).filter(p => p && !p.archived);
  if (!products.length) return false;
  const variants = Array.isArray(data.variants) ? data.variants : [];
  const cats = new Map((Array.isArray(data.categories) ? data.categories : [])
    .map(c => [String(c.id), String(c.name || '')]));

  BQ.colors = new Map((Array.isArray(data.colors) ? data.colors : [])
    .map(c => [String(c.id), { label: String(c.label || c.id), hex: String(c.hex || '#ccc') }]));

  BQ.products = products.map(p => ({
    id: String(p.id),
    name: String(p.name || ''),
    price: Math.max(0, toCents(p.priceMAD != null ? p.priceMAD : p.price) / 100),
    photo: p.photo || '',
    video: p.video || '',
    category: cats.get(String(p.categoryId)) || '',
    variants: [],
  }));
  BQ.byId = new Map(BQ.products.map(p => [p.id, p]));

  BQ.byCode = new Map();
  for (const v of variants) {
    const p = BQ.byId.get(String(v.productId));
    if (!p) continue;
    const entry = {
      size: String(v.size || ''),
      colorId: String(v.colorId || ''),
      stock: Math.max(0, Number(v.stock) || 0),
    };
    p.variants.push(entry);
    // Barcodes are either plain strings or { code } records — accept both,
    // so an old-POS alias resolves exactly like a generated in-store EAN.
    for (const b of (Array.isArray(v.barcodes) ? v.barcodes : [])) {
      const code = String((b && b.code) != null ? b.code : b || '').trim();
      if (code) BQ.byCode.set(code, p.id);
    }
  }
  renderBoutique();
  return true;
}

function stockOf(p) { return p.variants.reduce((s, v) => s + v.stock, 0); }
function stockPill(n) {
  if (n <= 0) return { cls: 'out', label: t('bq_outstock') };
  if (n <= 3)  return { cls: 'low', label: t('bq_lowstock') };
  return { cls: 'ok', label: t('bq_instock') };
}

function renderBoutique() {
  const list = $('#bq-list');
  if (!list) return;
  const q = BQ.filter.trim().toLowerCase();
  const rows = q
    ? BQ.products.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
    : BQ.products;
  if (!rows.length) {
    list.innerHTML = `<div class="bq-empty">${escapeHtml(q ? t('bq_noresult') : t('bq_empty'))}</div>`;
    return;
  }
  list.innerHTML = rows.map(p => {
    const n = stockOf(p);
    const pill = stockPill(n);
    // A clip autoplays muted in the thumbnail — a garment sells on movement.
    const thumb = p.video
      ? `<video src="${escapeHtml(p.video)}" autoplay loop muted playsinline preload="metadata" disablepictureinpicture></video>`
      : (p.photo
        ? `<img src="${escapeHtml(p.photo)}" alt="" loading="lazy" />`
        : `<i data-icon="checkroom"></i>`);
    return `
    <button class="bq-card" type="button" data-bq="${escapeHtml(p.id)}">
      <span class="bq-thumb">${thumb}</span>
      <span>
        <span class="bq-name">${escapeHtml(p.name)}</span>
        <span class="bq-meta">${escapeHtml(p.category)}</span>
        <span class="bq-pill ${pill.cls}">${escapeHtml(pill.label)}</span>
      </span>
      <span class="bq-price">${escapeHtml(money(p.price))}</span>
    </button>`;
  }).join('');
  if (window.lucide) window.lucide.createIcons();
}

function openBoutiqueItem(id) {
  const p = BQ.byId.get(String(id));
  if (!p) return;
  $('#bq-d-name').textContent = p.name;
  $('#bq-d-price').textContent = `${money(p.price)}`;

  // The merchant's own photo or clip, full width above the stock detail.
  const hero = $('#bq-d-hero');
  if (hero) {
    hero.innerHTML = p.video
      ? `<video src="${escapeHtml(p.video)}" autoplay loop muted playsinline preload="metadata" disablepictureinpicture></video>`
      : (p.photo ? `<img src="${escapeHtml(p.photo)}" alt="" />` : '');
    hero.hidden = !(p.video || p.photo);
  }

  // Sizes: summed across colours, because "is my size left?" is the question.
  const bySize = new Map();
  const byColor = new Map();
  for (const v of p.variants) {
    if (v.size) bySize.set(v.size, (bySize.get(v.size) || 0) + v.stock);
    if (v.colorId) byColor.set(v.colorId, (byColor.get(v.colorId) || 0) + v.stock);
  }
  const sizeChips = [...bySize.entries()].map(([size, n]) => {
    const cls = n <= 0 ? 'is-out' : (n <= 2 ? 'is-low' : '');
    return `<span class="bq-chip ${cls}">${escapeHtml(size)} <b>${n}</b></span>`;
  }).join('');
  const colorChips = [...byColor.entries()].map(([cid, n]) => {
    const c = BQ.colors.get(cid) || { label: cid, hex: '#ccc' };
    const cls = n <= 0 ? 'is-out' : '';
    const pat = cid === 'multi' ? 'multi' : cid === 'transparent' ? 'clear' : '';
    return `<span class="bq-chip ${cls}"><i class="bq-swatch" ${pat ? `data-pat="${pat}"` : ''} style="background:${escapeHtml(c.hex)}"></i>${escapeHtml(c.label)} <b>${n}</b></span>`;
  }).join('');

  const total = stockOf(p);
  const pill = stockPill(total);
  $('#bq-d-body').innerHTML = `
    <div class="bq-d-section">${escapeHtml(t('bq_stock'))}</div>
    <div class="bq-chips"><span class="bq-pill ${pill.cls}">${escapeHtml(pill.label)} · ${total}</span></div>
    ${sizeChips ? `<div class="bq-d-section">${escapeHtml(t('bq_sizes'))}</div><div class="bq-chips">${sizeChips}</div>` : ''}
    ${colorChips ? `<div class="bq-d-section">${escapeHtml(t('bq_colors'))}</div><div class="bq-chips">${colorChips}</div>` : ''}`;
  openSheet('#bq-detail');
}

function openSheet(sel) {
  const el = $(sel);
  if (!el) return;
  el.classList.add('is-open');
  el.setAttribute('aria-hidden', 'false');
}
function closeSheet(sel) {
  const el = $(sel);
  if (!el) return;
  el.classList.remove('is-open');
  el.setAttribute('aria-hidden', 'true');
}

/* ============ boutique: camera barcode scan (+ manual fallback) ============
   BarcodeDetector is Chrome/Android; iOS Safari has no camera decoder, so
   the manual field is always present rather than a dead end. */
let scanStream = null, scanTimer = null;

async function openScanner() {
  $('#bq-manual').value = '';
  openSheet('#bq-scan');
  const msg = $('#bq-scan-msg');
  const box = $('#bq-scan-box');
  const video = $('#bq-video');
  const supported = 'BarcodeDetector' in window && navigator.mediaDevices &&
                    navigator.mediaDevices.getUserMedia;
  if (!supported) {
    box.hidden = true;
    msg.textContent = t('bq_camera_none');
    $('#bq-manual').focus();
    return;
  }
  box.hidden = false;
  msg.textContent = t('bq_scan_hint');
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }, audio: false,
    });
    video.srcObject = scanStream;
    await video.play();
  } catch (_) {
    box.hidden = true;
    msg.textContent = t('bq_camera_denied');
    $('#bq-manual').focus();
    return;
  }
  let detector;
  try {
    detector = new window.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'code_39'],
    });
  } catch (_) { detector = new window.BarcodeDetector(); }

  scanTimer = setInterval(async () => {
    if (!scanStream || video.readyState < 2) return;
    try {
      const hits = await detector.detect(video);
      if (hits && hits.length) resolveScan(String(hits[0].rawValue || '').trim());
    } catch (_) { /* a frame failed to decode — keep going */ }
  }, 350);
}

function closeScanner() {
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  if (scanStream) { scanStream.getTracks().forEach(tr => tr.stop()); scanStream = null; }
  const video = $('#bq-video');
  if (video) video.srcObject = null;
  closeSheet('#bq-scan');
}

function resolveScan(code) {
  const clean = String(code || '').trim();
  if (!clean) return;
  const pid = BQ.byCode.get(clean);
  if (!pid) { $('#bq-scan-msg').textContent = t('bq_not_found'); return; }
  closeScanner();
  openBoutiqueItem(pid);
}

/* The two fields of the boutique screen, wired once this file is here. */
(function () {
  const bqSearch = $('#bq-search');
  if (bqSearch) bqSearch.addEventListener('input', () => {
    BQ.filter = bqSearch.value || '';
    renderBoutique();
  });
  // Manual barcode entry (the always-available path — iOS has no camera
  // decoder, and a scratched label beats every scanner).
  const manual = $('#bq-manual');
  if (manual) manual.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); resolveScan(manual.value); }
  });
})();

    return Object.freeze({ bootBoutique, stockOf, stockPill, renderBoutique, openBoutiqueItem, openSheet, closeSheet, openScanner, closeScanner, resolveScan });
  }
});
