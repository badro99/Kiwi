/* Stock · intake. Fonctions privées, installées au premier usage. */
window.KiwiStockInternal.install('intake', (S) => {
  'use strict';
  const { STR, closeTopModal, esc, fmtMad, getInv, getSup, lang, moveStock, render, stItemOverrides, stSaveOverlay, stShowReal, stockUnit, stockUnitOptions, svg, t, topBackdrop, wireDismiss } = S;

  function normalizeMatchStr(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenizeMatchStr(s) {
    return normalizeMatchStr(s).split(' ').filter((w) => w.length >= 2);
  }

  function tokenOverlapScore(a, b) {
    const setA = new Set(tokenizeMatchStr(a));
    const setB = new Set(tokenizeMatchStr(b));
    if (!setA.size || !setB.size) return 0;
    let inter = 0;
    for (const t of setA) {
      if (setB.has(t)) inter++;
    }
    return inter / Math.max(setA.size, setB.size);
  }

  function matchInvoiceLines(lines, items) {
    const allItems = Array.isArray(items) ? items : [];
    return (lines || []).map((line) => {
      if (!line) return { itemId: null, confidence: 0 };

      // 1. EAN / Code-barres
      if (line.ean) {
        const eanHit = allItems.find((it) => it.barcode === line.ean || it.ean === line.ean);
        if (eanHit) return { itemId: eanHit.id, confidence: 1.0 };
      }

      // 2. Ref / SKU sur la carte fournisseur ou sur l'article
      if (line.ref) {
        const refHit = allItems.find((it) => {
          if (it.sku === line.ref) return true;
          const cards = Array.isArray(it.suppliers) ? it.suppliers : [];
          return cards.some((c) => c.ref === line.ref);
        });
        if (refHit) return { itemId: refHit.id, confidence: 0.95 };
      }

      // 3. Correspondance exacte du nom normalisé
      const normLabel = normalizeMatchStr(line.label);
      if (normLabel) {
        const exactHit = allItems.find((it) => normalizeMatchStr(it.name) === normLabel);
        if (exactHit) return { itemId: exactHit.id, confidence: 0.9 };
      }

      // 4. Chevauchement de jetons (seuil >= 0.6)
      let bestHit = null;
      let bestScore = 0;
      for (const it of allItems) {
        const score = tokenOverlapScore(line.label, it.name);
        if (score > bestScore) {
          bestScore = score;
          bestHit = it;
        }
      }
      if (bestScore >= 0.6 && bestHit) {
        return { itemId: bestHit.id, confidence: Math.round(bestScore * 100) / 100 };
      }

      return { itemId: null, confidence: 0 };
    });
  }

  function compareLineCost(item, invoicedCost, supplierName) {
    const invCostNum = Math.max(0, Number(invoicedCost) || 0);
    if (!item) {
      return {
        currentCost: 0,
        invoicedPerUnit: invCostNum,
        pct: 0,
        isRise: false,
        isDrop: false,
        isChecked: invCostNum > 0,
        factor: 1,
        card: null,
      };
    }

    const cards = Array.isArray(item.suppliers) ? item.suppliers : [];
    let card = null;
    if (supplierName) {
      card = cards.find((c) => String(c.supplierName || '').trim().toLowerCase() === String(supplierName).trim().toLowerCase());
    }
    if (!card) card = cards[0] || null;

    const factor = (card && Number.isFinite(+card.factor) && +card.factor > 0) ? +card.factor : 1;
    const current = (card && card.defaultPrice != null && Number.isFinite(+card.defaultPrice))
      ? +card.defaultPrice
      : (Number.isFinite(+item.costPerUnit) ? +item.costPerUnit : 0);

    // Facture en unité d'achat ramenée à l'unité de la carte
    const invoicedPerUnit = Math.round((invCostNum / factor) * 10000) / 10000;

    if (current <= 0) {
      return {
        currentCost: current,
        invoicedPerUnit,
        pct: 0,
        isRise: false,
        isDrop: false,
        isChecked: invoicedPerUnit > 0,
        factor,
        card,
      };
    }

    const diff = invoicedPerUnit - current;
    const pct = Math.round((diff / current) * 100);
    const isRise = diff > 0.001;
    const isDrop = diff < -0.001;
    const isChecked = isRise; // Coché par défaut uniquement en cas de hausse réelle

    return {
      currentCost: current,
      invoicedPerUnit,
      pct,
      isRise,
      isDrop,
      isChecked,
      factor,
      card,
    };
  }

  function loadPdfJs() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.reject(new Error('no-dom'));
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (S._pdfjsPromise) return S._pdfjsPromise;
    S._pdfjsPromise = new Promise((resolve, reject) => {
      if (typeof document.createElement !== 'function') {
        return resolve(window.pdfjsLib || null);
      }
      const script = document.createElement('script');
      script.src = 'assets/vendor/pdfjs/pdf.min.js';
      script.onload = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdfjs/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        } else {
          resolve(null);
        }
      };
      script.onerror = () => reject(new Error('Erreur de chargement pdf.js'));
      const target = document.head || document.body || document.documentElement;
      if (target && target.appendChild) target.appendChild(script);
      else resolve(null);
    });
    return S._pdfjsPromise;
  }

  async function extractPdfText(file) {
    const pdfjs = await loadPdfJs();
    const ab = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: ab, isEvalSupported: false });
    const pdf = await loadingTask.promise;
    const maxPages = Math.min(pdf.numPages, 10);
    let fullText = '';
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = (content.items || []).map((it) => it.str);
      fullText += strings.join(' ') + '\n';
    }
    return fullText.trim();
  }

  function stUpsertSupplierCard(it, supplier, line, forcedId) {
    let supRank = 1;
    let supId = forcedId || ('sup-' + Date.now().toString(36));
    if (!stShowReal()) return { supId, supRank };
    const ov = stItemOverrides[it.id] || {};
    const cards = Array.isArray(it.suppliers) ? it.suppliers.slice() : [];
    let existing = cards.find((s) => String(s.supplierName || '').trim().toLowerCase() === String(supplier).toLowerCase());

    if (!existing) {
      supRank = cards.length + 1;
      existing = {
        id: supId,
        supplierName: supplier,
        defaultPrice: line.cost || +it.costPerUnit || 0,
        purchaseUnit: it.unit || 'unité',
        factor: 1,
        rank: supRank,
      };
      if (line.updateCost) {
        cards.push(existing);
      }
    } else {
      supId = existing.id;
      supRank = existing.rank || 1;
      // MISE À JOUR DE defaultPrice SEULEMENT SI LA CASE EST COCHÉE
      if (line.updateCost && line.cost > 0) {
        const factor = (Number.isFinite(+existing.factor) && +existing.factor > 0) ? +existing.factor : 1;
        existing.defaultPrice = Math.round((line.cost / factor) * 100) / 100;
      }
    }
    if (cards.length > 0) {
      ov.suppliers = cards;
      ov.updatedAt = Date.now();
      stItemOverrides[it.id] = ov;
    }
    return { supId, supRank };
  }

  function stIntakePostingLines(ctx) {
    return ((ctx && ctx.lines) || []).map((l) => ({
      itemId: String(l.itemId || '').slice(0, 80),
      name: String(l.name || l.itemId || '').slice(0, 120),
      qty: Math.round(Math.max(0, +(l.qty || 0)) * 1000) / 1000,
      unit: String(l.unit || 'unité').slice(0, 24),
      unitCost: Math.round(Math.max(0, +(l.unitCost || 0)) * 10000) / 10000,
      updateCost: !!l.updateCost,
      dlc: String(l.dlc || '').slice(0, 10),
      /* Dérivés de la carte locale : nécessaires au mouvement, mais exclus de
       * l'empreinte pour que deux appareils au cache différent ne divergent. */
      cardSupplierId: String(l.cardSupplierId || '').slice(0, 80),
      cardRank: Math.max(1, Math.round(+l.cardRank || 1)),
    })).filter((l) => l.itemId && l.qty > 0);
  }

  function stIntakePostingCanonical(ctx) {
    ctx = ctx || {};
    return {
      supplierName: String(ctx.supplierName || ''),
      externalRef: String(ctx.externalRef || ''),
      receivedAt: Math.max(0, Math.round(+ctx.receivedAt || 0)),
      issuedAt: Math.max(0, Math.round(+ctx.issuedAt || 0)),
      source: String(ctx.source || 'pdf'),
      lines: stIntakePostingLines(ctx).map((l) => ({
        itemId: l.itemId, name: l.name, qty: l.qty, unit: l.unit,
        unitCost: l.unitCost, updateCost: l.updateCost, dlc: l.dlc,
      })),
    };
  }

  async function stIntakePostingFingerprint(ctx) {
    const bytes = new TextEncoder().encode(JSON.stringify(stIntakePostingCanonical(ctx)));
    return stSha256Hex(bytes);
  }

  async function stIntakePrepare(docId, postingHash, lineCount) {
    const res = await fetch('/api/ai/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: stIntakeMerchant(), action: 'prepare', docId, postingHash, lineCount }),
    });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || !data || data.ok !== true || data.prepared !== true) {
      throw new Error('intake-' + String((data && data.error) || ('prepare-' + res.status)));
    }
    return true;
  }

  async function stIntakePostAll(ctx) {
    const P = window.KiwiProcurement || null;
    const K = window.KiwiInventory || null;
    const C = window.KiwiCost || null;
    const docId = String((ctx && ctx.docId) || '');
    if (!docId) throw new Error('intake-doc-required');
    /* Sans registre, aucun mouvement ne doit partir : un K.add absent
     * avalerait chaque ligne en silence et le document serait marqué
     * confirmé sur du vide. */
    if (!K || typeof K.add !== 'function') throw new Error('intake-ledger-required');
    const owner = (typeof K.merchant === 'function') ? String(K.merchant() || '') : '';
    if (!owner) throw new Error('intake-merchant-required');
    const supplierName = String(ctx.supplierName || '');
    const externalRef = String(ctx.externalRef || '');
    const receivedAt = +ctx.receivedAt || Date.now();
    const issuedAt = +ctx.issuedAt || receivedAt;

    let supplierId = '';
    if (P) {
      const list = (P.doc && P.doc().suppliers) || [];
      const norm = supplierName.trim().toLowerCase();
      const known = list.find((s) => String((s && s.name) || '').trim().toLowerCase() === norm);
      if (known) supplierId = known.id;
      else if (norm) {
        const created = P.addSupplier({ id: stIntakeSupplierId(supplierName), name: supplierName });
        supplierId = (created && created.id) || '';
      }
    }

    const normalizedCtx = Object.assign({}, ctx, {
      receivedAt, issuedAt, lines: ctx.lines || [],
    });
    const canonical = stIntakePostingCanonical(normalizedCtx);
    const postLines = stIntakePostingLines(normalizedCtx);
    const cleanLines = postLines.map((l) => ({
      itemId: l.itemId, name: l.name, qty: l.qty, unit: l.unit, unitCost: l.unitCost,
    }));
    if (!cleanLines.length) throw new Error('intake-lines-required');
    const ids = await stIntakePostingIds(owner, docId, postLines.length);

    /* Avant la première écriture locale, le serveur fige l'empreinte du
     * brouillon relu. Un crash puis une nouvelle extraction/correction ne peut
     * donc pas réutiliser les ids indexés avec un autre contenu. */
    const postingHash = await stSha256Hex(new TextEncoder().encode(JSON.stringify(canonical)));
    await stIntakePrepare(docId, postingHash, cleanLines.length);

    let receipt = null;
    if (P && P.receiveDirect) {
      receipt = P.receiveDirect({
        receiptId: ids.receiptId, supplierId, externalRef, receivedAt,
        lines: cleanLines, skipMovements: true, skipCosts: true,
      });
      if (!receipt || receipt.error) throw new Error((receipt && receipt.error) || 'receipt-failed');
    }

    postLines.forEach((l, idx) => {
      /* Acceptation vérifiée ligne par ligne : K.add rend null quand le
       * registre refuse (pas réel, pas de marchand, ligne invalide). Un
       * refus silencieux serait une confirmation mensongère — on lève, la
       * reprise rejouera (ids déterministes, couches convergentes). */
      const accepted = K.add({
        id: ids.movementIds[idx],
        itemId: l.itemId, qty: +l.qty, reason: 'receipt',
        refType: 'receipt', refId: receipt ? receipt.id : ids.receiptId,
        note: [supplierName, externalRef].filter(Boolean).join(' · '),
        unitCost: l.unitCost, occurredTs: receivedAt,
        meta: {
          supplierId: l.cardSupplierId || supplierId,
          supplierName, externalRef, receiptRef: ids.receiptId,
          receivedAt, rank: l.cardRank || 1,
          expiresAt: l.dlc ? new Date(l.dlc + 'T23:59:59').getTime() : null,
        },
      });
      if (!accepted) throw new Error('intake-movement-rejected:' + l.itemId);
      if (l.updateCost && +l.unitCost > 0 && C && C.setItemCost) {
        try { C.setItemCost(l.itemId, +l.unitCost, supplierName); } catch (_) {}
      }
    });

    /* K.add est local-first et ne constitue pas un accusé de réception D1.
     * Sans ce sync explicite, le document pouvait être marqué confirmed puis
     * l'onglet mourir avant que le setTimeout du registre pousse ses lignes. */
    if (typeof K.sync !== 'function' || await K.sync() !== true) {
      throw new Error('intake-movement-sync-required');
    }

    let invoice = null;
    if (P && P.attachInvoice) {
      const inv = P.attachInvoice({
        invoiceId: ids.invoiceId, supplierId, number: externalRef,
        issuedAt, receiptId: receipt ? receipt.id : ids.receiptId,
        lines: cleanLines, source: String(ctx.source || 'pdf'),
      });
      if (inv && !inv.error) invoice = inv;
    }
    return { receiptId: receipt ? receipt.id : ids.receiptId, invoiceId: invoice ? invoice.id : null, movementIds: ids.movementIds };
  }

  function stIntakeEnabled() {
    try {
      if (new URLSearchParams(window.location.search).get('intake') === '1') return true;
      return window.localStorage.getItem('kiwiIntake1') === '1';
    } catch (_) { return false; }
  }

  function stIntakeIdHint(text) {
    return /passeport|passport|carte\s+(nationale|d['’]identit)|c\.?\s*n\.?\s*i\.?\s*e\.?\b|\bcin\b|fiche\s+de\s+police|acte\s+de\s+naissance|جواز\s*السفر|بطاقة\s*(التعريف|الوطنية)| الحالة\s*المدنية/i.test(String(text || ''));
  }

  function stIntakeMrzZone(text) {
    const lines = String(text || '').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.replace(/\s+/g, '').toUpperCase();
      if (line.length < 30) continue;
      if (!/^[A-Z0-9<]+$/.test(line)) continue;
      let fillers = 0;
      for (const ch of line) if (ch === '<') fillers++;
      if (fillers >= 10) return true;
    }
    return false;
  }

  function stIntakeHash(str) {
    let h = 2166136261;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  async function stIntakePostingIds(merchant, docId, lineCount) {
    const m = String(merchant || '');
    const d = String(docId || '');
    if (!m || !d) throw new Error('intake-id-scope-required');
    const subtle = (window.crypto && window.crypto.subtle) || null;
    if (!subtle) throw new Error('intake-crypto-required');
    const enc = new TextEncoder();
    const movementIds = [];
    const n = Math.max(0, Math.min(200, lineCount | 0));
    for (let i = 0; i < n; i++) {
      const digest = await subtle.digest('SHA-256', enc.encode(m + '\n' + d + '\n' + i));
      const hex = Array.from(new Uint8Array(digest)).map((x) => x.toString(16).padStart(2, '0')).join('');
      movementIds.push('mov-intake-' + hex.slice(0, 20) + '-' + i);
    }
    return {
      receiptId: 'grn-intake-' + d.slice(0, 16),
      invoiceId: 'invdoc-intake-' + d.slice(0, 16),
      movementIds,
    };
  }

  function stIntakeSupplierId(name) {
    return 'sup-intake-' + stIntakeHash(String(name || '').trim().toLowerCase());
  }

  async function stSha256Hex(buffer) {
    const digest = await window.crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest)).map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  function stIntakeMerchant() {
    try { return (window.Kiwi && window.Kiwi.venue && window.Kiwi.venue()) || ''; } catch (_) { return ''; }
  }

  async function stIntakeCommit(payload) {
    const res = await fetch('/api/ai/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: stIntakeMerchant(), action: 'commit', ...payload }),
    });
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    return { status: res.status, data };
  }

  async function stIntakeUpload(docId, bytes) {
    // Booléen, jamais d'exception : l'appelant décide (archive ou repli).
    try {
      const res = await fetch(`/api/ai/intake?merchant=${encodeURIComponent(stIntakeMerchant())}&docId=${encodeURIComponent(docId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: bytes,
      });
      return res.ok;
    } catch (_) { return false; }
  }

  function stIntakeOutboxKey() { return 'kiwi:intakeOutbox:v1:' + (stIntakeMerchant() || 'local'); }

  function stIntakeOutboxRead() {
    try {
      const raw = window.localStorage.getItem(stIntakeOutboxKey());
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((e) => e && typeof e.docId === 'string').slice(-50) : [];
    } catch (_) { return []; }
  }

  function stIntakeOutboxWrite(list) {
    try { window.localStorage.setItem(stIntakeOutboxKey(), JSON.stringify((list || []).slice(-50))); } catch (_) {}
  }

  function stIntakePostedKey() { return 'kiwi:intakePosted:v1:' + (stIntakeMerchant() || 'local'); }

  function stIntakePostedHas(docId) {
    try {
      const raw = window.localStorage.getItem(stIntakePostedKey());
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) && arr.indexOf(docId) !== -1;
    } catch (_) { return false; }
  }

  function stIntakePostedAdd(docId) {
    try {
      const raw = window.localStorage.getItem(stIntakePostedKey());
      const arr = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(arr) ? arr : [];
      if (list.indexOf(docId) === -1) list.push(docId);
      window.localStorage.setItem(stIntakePostedKey(), JSON.stringify(list.slice(-200)));
    } catch (_) {}
  }

  function stIntakePostGuard(posted, serverStatus) {
    if (posted) return 'duplicate-local';
    if (serverStatus === 'confirmed') return 'duplicate-server';
    return 'ok';
  }

  async function stIntakeServerStatus(docId) {
    // Injoignable → '' : la garde reste ouverte, l'outbox garde la vérité.
    try {
      const res = await fetch(`/api/ai/intake?merchant=${encodeURIComponent(stIntakeMerchant())}&docId=${encodeURIComponent(docId)}`);
      if (!res.ok) return '';
      const data = await res.json().catch(() => null);
      return (data && data.doc && data.doc.status) || '';
    } catch (_) { return ''; }
  }

  async function stIntakeMarkOnce(docId) {
    const box = stIntakeOutboxRead();
    if (!box.some((e) => e.docId === docId)) {
      box.push({ docId, ts: Date.now() });
      stIntakeOutboxWrite(box);
    }
    try {
      const res = await fetch('/api/ai/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant: stIntakeMerchant(), action: 'mark', docId, status: 'confirmed' }),
      });
      if (res.ok) {
        stIntakeOutboxWrite(stIntakeOutboxRead().filter((e) => e.docId !== docId));
        return true;
      }
    } catch (_) {}
    return false;
  }

  async function stIntakeFlushOutbox() {
    const pending = stIntakeOutboxRead();
    for (const e of pending) {
      try {
        if (await stIntakeServerStatus(e.docId) === 'confirmed') {
          stIntakeOutboxWrite(stIntakeOutboxRead().filter((x) => x.docId !== e.docId));
          continue;
        }
        await stIntakeMarkOnce(e.docId);
      } catch (_) {}
    }
  }

  function stRenderIntakeStop(title, body) {
    return `
      <div class="st-notice warn">${svg('alertTriangle', 14)}<div><b>${esc(title)}</b><br />${esc(body)}</div></div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;">
        <button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button>
        <button class="st-btn" type="button" data-stock-scan-manual2>${esc(t('mScanManual'))}</button>
      </div>`;
  }

  function wireIntakeStop() {
    const scope = topBackdrop() || document;
    const stage = scope.querySelector('[data-stock-scan-stage]');
    scope.querySelector('[data-stock-scan-manual2]')?.addEventListener('click', () => {
      if (!stage) return;
      stage.innerHTML = renderRealReceiptReview({ supplier: null });
      wireScanReview();
    });
  }

  async function stIntakeFetchRecorded(docId) {
    const refId = 'grn-intake-' + String(docId || '').slice(0, 16);
    const res = await fetch(`/api/inventory/movements?merchant=${encodeURIComponent(stIntakeMerchant())}&refId=${encodeURIComponent(refId)}&reason=receipt`);
    if (!res.ok) throw new Error('intake-recorded-' + res.status);
    const data = await res.json().catch(() => null);
    const rows = data && Array.isArray(data.movements) ? data.movements : [];
    return rows.map((r) => ({
      itemId: String((r && r.itemId) || ''),
      qty: +(r && r.qty) || 0,
      unitCost: r && r.unitCost == null ? null : +(r.unitCost),
    })).filter((r) => r.itemId);
  }

  function stIntakeCompareConflict(recorded, current) {
    /* Plusieurs lignes d'une même facture peuvent pointer vers le même article
     * (lots ou DLC différents). On conserve donc chaque occurrence dans l'ordre
     * au lieu d'écraser silencieusement les suivantes dans une Map par article. */
    const index = (rows, pick) => {
      const m = new Map();
      for (const r of rows || []) {
        const id = String((r && r.itemId) || '');
        if (!id) continue;
        if (!m.has(id)) m.set(id, []);
        m.get(id).push(pick(r));
      }
      return m;
    };
    const rec = index(recorded, (r) => ({ qty: +r.qty || 0, unitCost: r.unitCost == null ? null : +r.unitCost }));
    const cur = index(current, (r) => ({ name: String(r.name || r.itemId || ''), qty: +r.qty || 0, unit: String(r.unit || ''), unitCost: r.unitCost == null ? null : +r.unitCost }));
    const sameCost = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.00005);
    const rows = [];
    const ids = new Set([...cur.keys(), ...rec.keys()]);
    for (const id of ids) {
      const currentRows = cur.get(id) || [];
      const recordedRows = rec.get(id) || [];
      const count = Math.max(currentRows.length, recordedRows.length);
      for (let occurrence = 0; occurrence < count; occurrence += 1) {
        const c = currentRows[occurrence] || null;
        const r = recordedRows[occurrence] || null;
        if (c && !r) rows.push({ kind: 'added', itemId: id, name: c.name, recQty: null, recCost: null, curQty: c.qty, curCost: c.unitCost, unit: c.unit });
        else if (r && !c) rows.push({ kind: 'missing', itemId: id, name: id, recQty: r.qty, recCost: r.unitCost, curQty: null, curCost: null, unit: '' });
        else if (r && c && (r.qty !== c.qty || !sameCost(r.unitCost, c.unitCost))) {
          rows.push({ kind: 'changed', itemId: id, name: c.name, recQty: r.qty, recCost: r.unitCost, curQty: c.qty, curCost: c.unitCost, unit: c.unit });
        }
      }
    }
    return rows;
  }

  function stRenderIntakeConflict(cmp) {
    const rows = (cmp && cmp.rows) || [];
    const fetchFailed = !!(cmp && cmp.fetchFailed);
    const badge = (kind) => {
      const label = kind === 'added' ? t('mScanConflictAdded') : kind === 'missing' ? t('mScanConflictMissing') : t('mScanConflictChanged');
      const paint = kind === 'added'
        ? 'background:var(--ok-bg,#ecfdf5);color:var(--ok-fg,#047857);'
        : kind === 'missing'
          ? 'background:#fdecec;color:#C94A3A;'
          : 'background:var(--warn-bg,#fffbeb);color:var(--warn-fg,#b45309);';
      return `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;${paint}">${esc(label)}</span>`;
    };
    const cell = (v, suffix) => (v == null
      ? '<span style="color:var(--n-400,#9ca3af);">·</span>'
      : `<bdi dir="ltr" class="mono">${esc(String(v))}${suffix ? ' ' + esc(suffix) : ''}</bdi>`);
    const firstId = rows.length ? rows[0].itemId : '';
    return `
      <div class="st-notice warn">${svg('alertTriangle', 14)}<div><b>${esc(t('mScanConflictT'))}</b><br />${esc(t('mScanConflictB1'))}<br />${esc(t('mScanConflictB2'))}<br />${esc(t('mScanConflictB3'))}</div></div>
      ${fetchFailed
        ? `<div class="st-notice" style="margin-top:8px;">${svg('info', 14)}<div>${esc(t('mScanConflictNoRec'))}</div></div>`
        : rows.length ? `<div class="st-notice" style="margin-top:8px;">${svg('info', 14)}<div>${esc(t('mScanConflictPartial'))}</div></div>
        <div style="overflow-x:auto;margin-top:12px;border:1px solid var(--n-200,#e5e7eb);border-radius:6px;">
        <table class="st-inv-items" style="margin:0;width:100%;">
          <thead><tr><th>${esc(t('mScanConflictColItem'))}</th><th class="r">${esc(t('mScanConflictRec'))}</th><th class="r">${esc(t('mScanConflictCur'))}</th><th></th></tr></thead>
          <tbody>${rows.map((r) => `
            <tr>
              <td style="min-width:140px;"><div style="font-size:12px;font-weight:500;color:var(--n-800);">${esc(r.name)}</div></td>
              <td class="r" style="font-size:12px;"><span>${esc(t('mScanConflictColQty'))} · ${cell(r.recQty, r.unit)}</span><br /><span>${esc(t('mScanConflictColCost'))} · ${cell(r.recCost)}</span></td>
              <td class="r" style="font-size:12px;"><span>${esc(t('mScanConflictColQty'))} · ${cell(r.curQty, r.unit)}</span><br /><span>${esc(t('mScanConflictColCost'))} · ${cell(r.curCost)}</span></td>
              <td style="min-width:90px;">${badge(r.kind)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>` : `<div class="st-notice" style="margin-top:8px;">${svg('info', 14)}<div>${esc(t('mScanConflictNoDiff'))}</div></div>`}
      <div style="display:flex; justify-content:flex-end; flex-wrap:wrap; gap:8px; margin-top:14px;">
        ${firstId && !fetchFailed ? `<button class="st-btn" type="button" data-action="stock-item-detail" data-item-id="${esc(firstId)}">${svg('eye', 12)}<span>${esc(t('mScanConflictHistory'))}</span></button>` : ''}
        <button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button>
        <button class="st-btn primary" type="button" data-stock-conflict-back>${esc(t('mScanConflictBack'))}</button>
      </div>`;
  }

  async function stShowIntakeConflict(scope, stage, opts) {
    const o = opts || {};
    const currentLines = Array.isArray(o.currentLines) ? o.currentLines : [];
    S.stConflictStash = [];
    if (stage && stage.firstChild) {
      let n = stage.firstChild;
      const kept = [];
      while (n) { kept.push(n); n = n.nextSibling; }
      kept.forEach((node) => { try { stage.removeChild(node); } catch (_) {} });
      S.stConflictStash = kept;
    }
    let recorded = null, fetchFailed = false;
    try { recorded = await stIntakeFetchRecorded(o.docId); }
    catch (_) { recorded = null; fetchFailed = true; }
    const rows = fetchFailed ? [] : stIntakeCompareConflict(recorded, currentLines);
    if (stage) {
      stage.innerHTML = stRenderIntakeConflict({ rows, fetchFailed });
      stage.querySelector('[data-stock-conflict-back]')?.addEventListener('click', () => {
        stRestoreIntakeReview(scope, stage);
      });
    }
    return { rows, fetchFailed };
  }

  async function stHandleIntakePostingConflict(scope, err, docId, currentLines) {
    if (!docId || String((err && err.message) || err).indexOf('posting-conflict') === -1) return false;
    const stage = scope && scope.querySelector ? scope.querySelector('[data-stock-scan-stage]') : null;
    if (stage) await stShowIntakeConflict(scope, stage, { docId, currentLines });
    else window.Kiwi.toast?.(t('mScanFailFallback'), { type: 'warn' });
    return true;
  }

  function stRestoreIntakeReview(scope, stage) {
    const kept = S.stConflictStash; S.stConflictStash = null;
    if (!stage) return false;
    if (kept && kept.length) {
      stage.innerHTML = '';
      kept.forEach((node) => { try { stage.appendChild(node); } catch (_) {} });
      return true;
    }
    stage.innerHTML = renderRealReceiptReview({ supplier: null });
    wireScanReview();
    return false;
  }

  function openInvoiceScan(opts) {
    // Pré-chargement discret en tâche de fond de pdf.js
    try { loadPdfJs(); } catch (_) {}
    // Guichet unique : rejoue les marquages interrompus (marquage seul).
    try { if (stIntakeEnabled()) stIntakeFlushOutbox(); } catch (_) {}
    S.stConflictStash = null;

    const preSupId = typeof opts === 'string' ? opts : opts?.supplierId;
    const sup = preSupId ? getSup().find((s) => s.id === preSupId) : null;
    const m = window.Kiwi.modal({
      title: t('mScanTitle'),
      width: 720,
      body: `<div data-stock-scan-stage>${sup ? renderRealReceiptReview({ supplier: sup }) : renderScanStage1()}</div>`,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button>`,
    });
    requestAnimationFrame(() => {
      wireDismiss(m?.el || topBackdrop());
      if (sup) {
        wireScanReview();
      } else {
        wireScanStage1();
      }
    });
  }

  function renderScanStage1() {
    return `
      <div class="st-dropzone" data-stock-dropzone>
        <input type="file" data-stock-file-input accept="application/pdf,image/*" style="display:none;" />
        <input type="file" data-stock-cam-input accept="image/*" capture="environment" style="display:none;" />
        <div class="st-dropzone-ico">${svg('upload', 26)}</div>
        <div class="st-dropzone-t">${esc(t('mScanDropT'))}</div>
        <div class="st-dropzone-s">${esc(t('mScanDropS'))}</div>
        <div class="st-dropzone-acts" style="display:flex;gap:10px;margin-top:12px;">
          <button class="st-btn" type="button" data-stock-pick-file>${esc(t('mScanBtnFile'))}</button>
          <button class="st-btn" type="button" data-stock-pick-cam>${svg('camera', 12)}<span>${esc(t('mScanBtnCam'))}</span></button>
        </div>
      </div>
      <div style="font-size:11.5px;color:var(--n-500,#6b7280);text-align:center;margin-top:8px;">
        ${esc(t('mScanServerNotice'))}
      </div>
      <div class="st-dropzone-link" data-stock-scan-manual style="text-align:center;margin-top:12px;cursor:pointer;color:var(--primary,#0070f3);font-size:13px;text-decoration:underline;">
        ${esc(t('mScanManual'))}
      </div>
      ${stIntakeEnabled() ? `<div class="st-dropzone-link" data-stock-scan-archive style="text-align:center;margin-top:6px;cursor:pointer;color:var(--primary,#0070f3);font-size:13px;text-decoration:underline;">
        ${esc(t('mScanArcLink'))}
      </div>` : ''}
    `;
  }

  function wireScanStage1() {
    const scope = topBackdrop() || document;
    const dropzone = scope.querySelector('[data-stock-dropzone]');
    const fileInp = scope.querySelector('[data-stock-file-input]');
    const camInp = scope.querySelector('[data-stock-cam-input]');
    const btnFile = scope.querySelector('[data-stock-pick-file]');
    const btnCam = scope.querySelector('[data-stock-pick-cam]');
    const linkManual = scope.querySelector('[data-stock-scan-manual]');
    const stage = scope.querySelector('[data-stock-scan-stage]');

    if (linkManual) {
      linkManual.onclick = () => {
        if (!stage) return;
        stage.innerHTML = renderRealReceiptReview({ supplier: null });
        wireScanReview();
      };
    }

    const linkArchive = scope.querySelector('[data-stock-scan-archive]');
    if (linkArchive) {
      linkArchive.onclick = () => {
        if (!stage) return;
        openScanArchive(scope, stage);
      };
    }

    if (btnFile && fileInp) {
      btnFile.onclick = () => fileInp.click();
    }
    if (btnCam && camInp) {
      btnCam.onclick = () => camInp.click();
    }

    const processFile = async (file) => {
      if (!file || !stage) return;
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      stage.innerHTML = `
        <div class="st-scanning" style="text-align:center;padding:40px 20px;">
          <div class="st-scanning-spinner" style="margin:0 auto 16px;"></div>
          <div class="st-scanning-t" style="font-weight:600;font-size:15px;margin-bottom:4px;">${esc(isPdf ? t('mScanReadingFile') : t('mScanReadingT'))}</div>
          <div class="st-scanning-s" style="font-size:12px;color:var(--n-500);">${esc(t('mScanReadingS'))}</div>
        </div>
      `;

      if (isPdf) {
        try {
          const text = await extractPdfText(file);
          if (!text) throw new Error('empty-text');

          // Guichet unique (fanion stIntakeEnabled) : le texte est déjà là,
          // donc le pré-filtre identité ne coûte aucun appel et précède tout.
          let intakeDocId = '';
          if (stIntakeEnabled()) {
            if (stIntakeIdHint(text) || stIntakeMrzZone(text)) {
              stage.innerHTML = stRenderIntakeStop(t('mScanIdTitle'), t('mScanIdBody'));
              wireIntakeStop();
              return;
            }
            try {
              const bytes = await file.arrayBuffer();
              if (!bytes.byteLength || bytes.byteLength > 10 * 1024 * 1024) throw new Error('too-large');
              const sha = await stSha256Hex(bytes);
              const commit = await stIntakeCommit({
                sha256: sha, mime: 'application/pdf', size: bytes.byteLength,
                docType: 'supplier_invoice', source: 'stock-scan',
                textSample: text.slice(0, 4000),
              });
              if (commit.status === 422) {
                stage.innerHTML = stRenderIntakeStop(t('mScanIdTitle'), t('mScanIdBody'));
                wireIntakeStop();
                return;
              }
              if (commit.data && commit.data.duplicate && commit.data.doc && commit.data.doc.status === 'confirmed') {
                const d = commit.data.doc.createdTs ? new Date(commit.data.doc.createdTs).toLocaleDateString() : '';
                stage.innerHTML = stRenderIntakeStop(t('mScanDupT'), t('mScanDupDone', d));
                wireIntakeStop();
                return;
              }
              if (commit.data && (commit.data.docId || (commit.data.doc && commit.data.doc.docId))) {
                const candidate = commit.data.docId || commit.data.doc.docId;
                // Vérité de l'archive : intakeDocId n'est posé que si l'objet
                // R2 est écrit et vérifié (le serveur compare le SHA-256).
                // Sans archive, l'extraction continue mais l'UI ne prétend
                // rien et aucun marquage ne sera possible (409 not-archived).
                if (await stIntakeUpload(candidate, bytes)) {
                  intakeDocId = candidate;
                  if (commit.data.duplicate) window.Kiwi.toast?.(t('mScanResume'), { type: 'info' });
                } else {
                  intakeDocId = '';
                }
              }
              // Registre ou quota indisponible (429, 503, réseau) : on ne
              // bloque jamais le travail, l'extraction continue sans archive.
            } catch (_) { intakeDocId = ''; }
          }

          const venue = (window.Kiwi && window.Kiwi.venue && window.Kiwi.venue()) || '';
          const res = await fetch('/api/ai/invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchant: venue, kind: 'text', text }),
          });

          if (!res.ok) {
            throw new Error('server-error-' + res.status);
          }
          const data = await res.json();
          if (data.ok && Array.isArray(data.lines) && data.lines.length) {
            stage.innerHTML = renderRealReceiptReview({ parsed: data, intakeDocId });
            wireScanReview();
            return;
          }
          throw new Error(data.error || data.reason || 'unparsed');
        } catch (err) {
          window.Kiwi.toast?.(t('mScanFailFallback'), { type: 'warn' });
          // Repli manuel : le contexte documentaire est préservé (si le
          // PDF est archivé, la confirmation marquera le brouillon).
          stage.innerHTML = renderRealReceiptReview({ supplier: null, intakeDocId });
          wireScanReview();
          return;
        }
      } else {
        // Image scan / photo — repli sur la table pour l'instant (Commit 1)
        setTimeout(() => {
          stage.innerHTML = renderRealReceiptReview({ supplier: null });
          wireScanReview();
        }, 800);
      }
    };

    if (fileInp) {
      fileInp.onchange = (e) => {
        if (e.target.files && e.target.files[0]) processFile(e.target.files[0]);
      };
    }
    if (camInp) {
      camInp.onchange = (e) => {
        if (e.target.files && e.target.files[0]) processFile(e.target.files[0]);
      };
    }

    if (dropzone) {
      ['dragenter', 'dragover'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('is-dragover'); });
      });
      ['dragleave', 'drop'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('is-dragover'); });
      });
      dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt?.files;
        if (files && files[0]) processFile(files[0]);
      });
    }
  }

  function stArchiveUrl(docId, download) {
    return '/api/ai/intake-archive?merchant=' + encodeURIComponent(stIntakeMerchant()) +
      '&docId=' + encodeURIComponent(String(docId || '')) + (download ? '&download=1' : '');
  }

  async function stIntakeArchiveList(cursor) {
    const res = await fetch('/api/ai/intake-archive?merchant=' + encodeURIComponent(stIntakeMerchant()) +
      '&limit=20' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    if (!res.ok) throw new Error('archive-' + res.status);
    const data = await res.json().catch(() => null);
    if (!data || data.ok !== true || !Array.isArray(data.docs)) throw new Error('archive-bad-shape');
    return data;
  }

  function stFmtSize(bytes) {
    const n = Math.max(0, Number(bytes) || 0);
    const dec = (x) => x.toFixed(1).replace('.', lang() === 'en' ? '.' : ',');
    if (n >= 1048576) return dec(n / 1048576) + ' ' + t('mScanArcUMB');
    if (n >= 1024) return dec(n / 1024) + ' ' + t('mScanArcUKB');
    return Math.round(n) + ' ' + t('mScanArcUB');
  }

  function stFmtArcDate(ts) {
    try {
      const loc = lang() === 'ar' ? 'ar-MA' : lang() === 'en' ? 'en-GB' : 'fr-MA';
      return new Date(Number(ts) || 0).toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (_) { return ''; }
  }

  function stArcTypeLabel(docType) {
    if (docType === 'supplier_invoice') return t('mScanArcTypeInvoice');
    const raw = String(docType || '').trim();
    return raw ? raw.slice(0, 24) : t('mScanArcTypeOther');
  }

  function stArcStatusLabel(status) {
    return status === 'confirmed' ? t('mScanArcStConfirmed') : t('mScanArcStReceived');
  }

  function renderScanArchive(state) {
    const st = state || {};
    const status = st.status || 'loading';
    const docs = Array.isArray(st.docs) ? st.docs : [];
    const head = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <button class="st-btn small" type="button" data-stock-arc-back>${esc(t('mScanArcBack'))}</button>
        <div class="st-mb-eyebrow" style="margin:0;">${esc(t('mScanArcTitle'))}</div>
      </div>`;
    if (status === 'loading') {
      return head + `<div style="text-align:center;padding:28px 12px;font-size:13px;color:var(--n-500,#6b7280);">${esc(t('mScanArcLoading'))}</div>`;
    }
    if (status === 'unavailable' && !docs.length) {
      return head + `<div class="st-notice warn">${svg('alertTriangle', 14)}<div>${esc(t('mScanArcDown'))}</div></div>
        <div style="display:flex;justify-content:flex-end;margin-top:12px;">
          <button class="st-btn" type="button" data-stock-arc-retry>${esc(t('mScanArcRetry'))}</button>
        </div>`;
    }
    if (!docs.length) {
      return head + `<div class="st-notice">${svg('info', 14)}<div>${esc(t('mScanArcEmpty'))}</div></div>`;
    }
    const rows = docs.map((d) => {
      const id = String((d && d.docId) || '');
      const short = id ? id.slice(0, 12) + '…' : '·';
      const archived = !!d.hasObject && !!id;
      const acts = archived
        ? `<a class="st-btn small" href="${esc(stArchiveUrl(id, false))}" target="_blank" rel="noopener">${esc(t('mScanArcView'))}</a>`
          + `<a data-activation=money class="st-btn small" href="${esc(stArchiveUrl(id, true))}" download>${esc(t('mScanArcDownload'))}</a>`
        : `<span style="font-size:11.5px;color:var(--n-500,#6b7280);">${esc(t('mScanArcPending'))}</span>`;
      return `
        <div style="display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;justify-content:space-between;padding:10px 4px;border-bottom:1px solid var(--n-200,#e5e7eb);">
          <div style="min-width:0;flex:1 1 180px;">
            <div style="font-size:13px;font-weight:600;">${esc(stArcTypeLabel(d.docType))}</div>
            <div style="font-size:11.5px;color:var(--n-500,#6b7280);display:flex;flex-wrap:wrap;gap:2px 8px;">
              <bdi dir="ltr" class="mono">${esc(short)}</bdi>
              <bdi dir="ltr">${esc(stFmtArcDate(d.createdTs))}</bdi>
              <bdi dir="ltr">${esc(stFmtSize(d.size))}</bdi>
              <span>${esc(stArcStatusLabel(d.status))}</span>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0;">${acts}</div>
        </div>`;
    }).join('');
    return head + `<div>${rows}</div>` + (st.nextCursor
      ? `<div style="display:flex;justify-content:center;margin-top:12px;">
          <button class="st-btn" type="button" data-stock-arc-more data-cursor="${esc(st.nextCursor)}">${esc(t('mScanArcMore'))}</button>
        </div>`
      : '');
  }

  function openScanArchive(scope, stage) {
    if (!stage) return;
    const acc = [];
    let cursor = null;
    let busy = false;
    function paint(state) {
      stage.innerHTML = renderScanArchive(state);
      const back = scope.querySelector('[data-stock-arc-back]');
      if (back) back.onclick = () => { stage.innerHTML = renderScanStage1(); wireScanStage1(); };
      const retry = scope.querySelector('[data-stock-arc-retry]');
      if (retry) retry.onclick = () => load(true);
      const more = scope.querySelector('[data-stock-arc-more]');
      if (more) more.onclick = () => load(false);
    }
    async function load(reset) {
      if (reset) { acc.length = 0; cursor = null; paint({ status: 'loading', docs: [] }); }
      else if (busy) return;
      busy = true;
      try {
        const data = await stIntakeArchiveList(reset ? null : cursor);
        for (const d of data.docs) acc.push(d);
        cursor = data.nextCursor || null;
        paint({ status: acc.length ? 'ready' : 'empty', docs: acc, nextCursor: cursor });
      } catch (_) {
        paint({ status: acc.length ? 'ready' : 'unavailable', docs: acc, nextCursor: cursor });
      }
      busy = false;
    }
    load(true);
  }

  function renderScanReview(opts) {
    if (stShowReal() || opts?.supplier) return renderRealReceiptReview(opts);
    const inv = getInv();
    const rows = [
      { id: 'inv01', name: 'Viande hachée bœuf', qty: 12, total: 1140 },
      { id: 'inv03', name: 'Agneau épaule', qty: 14, total: 2352 },
      { id: 'inv04', name: 'Merguez', qty: 4, total: 312 },
    ];
    return `
      <div class="st-mb-eyebrow">${esc(t('mScanReviewT'))}</div>
      <div class="st-mb-row three">
        <div class="st-mb-field"><label class="st-mb-label">${esc(t('mScanSupplier'))}</label><input class="st-mb-input" value="Boucherie Errazi" /></div>
        <div class="st-mb-field"><label class="st-mb-label">${esc(t('mScanDate'))}</label><input class="st-mb-input mono" value="14/05/2026" /></div>
        <div class="st-mb-field"><label class="st-mb-label">${esc(t('mScanNum'))}</label><input class="st-mb-input mono" value="FAC-2026-1842" /></div>
      </div>
      <table class="st-inv-items">
        <thead><tr><th>Article</th><th class="r">Qté</th><th>Unité</th><th class="r">Total</th></tr></thead>
        <tbody>
          ${rows.map((row) => {
            const item = inv.find((candidate) => candidate.id === row.id), unit = stockUnit(item?.unit || 'kg');
            return `<tr data-stock-scan-row="${esc(row.id)}"><td>${esc(item?.name || row.name)}</td><td class="r"><input class="st-pc-input mono" type="number" min="0" step="0.001" value="${row.qty}" data-stock-scan-qty /></td><td><select class="st-mb-input" data-stock-scan-unit>${stockUnitOptions(unit)}</select></td><td class="r mono">${esc(fmtMad(row.total))}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
      <div style="display:flex; justify-content:space-between; font-size:12.5px; color:var(--n-600); padding:6px 0;">
        <span>${esc(t('mScanTva'))} : −20 % comprise</span>
      </div>
      <div class="st-inv-foot"><span>${esc(t('mScanTotal'))}</span><b>3 804 MAD</b></div>
      <div class="st-notice ok">${svg('checkCircle', 14)}<div><b>${esc(t('mScanOk'))}</b></div></div>
      <div class="st-notice warn">${svg('alertTriangle', 14)}<div><b>${esc(t('mScanWarn'))}</b></div></div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;">
        <button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button>
        <button class="st-btn primary" data-stock-scan-confirm>${esc(t('mScanConfirm'))}</button>
      </div>
    `;
  }

  // Review copy also serves the image-to-manual fallback.
  function intakeText(key) {
    const words = {
      receipt: ['Réception fournisseur', 'Supplier receipt', 'استلام المورد'],
      notice: ['Vérifiez les prix et quantités avant de confirmer.', 'Check prices and quantities before confirming.', 'تحقق من الأسعار والكميات قبل التأكيد.'],
      item: ['Article reçu', 'Received item', 'الصنف المستلم'],
      expiry: ['Date limite (facultative)', 'Expiry date (optional)', 'تاريخ الصلاحية (اختياري)'],
      change: ['Évolution et mise à jour', 'Change and update', 'التغير والتحديث'],
      add: ['Ajouter une ligne', 'Add a line', 'إضافة سطر'],
      save: ['Enregistrer la réception', 'Save receipt', 'حفظ الاستلام'],
    };
    return words[key][lang() === 'ar' ? 2 : lang() === 'en' ? 1 : 0];
  }

  function renderRealReceiptReview(opts) {
    const preSupplier = opts?.supplier || null;
    const parsed = opts?.parsed || null;
    const allItems = getInv();
    let items = allItems;
    if (preSupplier) {
      const match = allItems.filter((it) => {
        const hasCard = (it.suppliers || []).some((card) =>
          String(card.supplierName || '').trim().toLowerCase() === preSupplier.name.toLowerCase() || card.id === preSupplier.id
        );
        return hasCard || (it.category === preSupplier.category) || (String(it.supplier || '').trim().toLowerCase() === preSupplier.name.toLowerCase());
      });
      if (match.length > 0) items = match;
    }

    const supName = parsed?.supplier?.name || preSupplier?.name || '';
    const today = new Date().toISOString().slice(0, 10);
    const invoiceDate = /^\d{4}-\d{2}-\d{2}$/.test(String(parsed?.date || '')) ? parsed.date : today;
    const invoiceNum = parsed?.number || '';

    const matches = parsed?.lines ? matchInvoiceLines(parsed.lines, items) : [];

    const makeRow = (line, matchHit) => {
      const matchedId = matchHit?.itemId || '';
      const matchedItem = matchedId ? items.find((it) => it.id === matchedId) : null;

      const lineQty = line ? line.qty : '';
      const lineCost = line ? line.unitCost : '';

      const comparison = compareLineCost(matchedItem, lineCost, supName);
      const isChecked = comparison.isChecked;

      let badgeHtml = '';
      if (matchedItem && comparison.currentCost > 0 && Number.isFinite(lineCost) && lineCost > 0) {
        if (comparison.isRise) {
          badgeHtml = `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:var(--warn-bg,#fffbeb);color:var(--warn-fg,#b45309);margin-right:6px;">↑ +${comparison.pct}%</span>`;
        } else if (comparison.isDrop) {
          badgeHtml = `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:var(--ok-bg,#ecfdf5);color:var(--ok-fg,#047857);margin-right:6px;">↓ −${Math.abs(comparison.pct)}%</span>`;
        }
      }

      const optionsHtml = `<option value="">${esc(t('mScanChoose'))}</option>` + items.map((it) => {
        const isSel = it.id === matchedId;
        const card = (it.suppliers || []).find((c) =>
          preSupplier && (String(c.supplierName || '').trim().toLowerCase() === preSupplier.name.toLowerCase() || c.id === preSupplier.id)
        );
        const defaultCost = card?.defaultPrice ?? it.costPerUnit ?? 0;
        return `<option value="${esc(it.id)}" data-default-cost="${esc(defaultCost)}" ${isSel ? 'selected' : ''}>${esc(it.name)} (${esc(it.unit || 'unité')})</option>`;
      }).join('');

      return `
        <tr data-stock-receive-row>
          <td style="min-width:180px;">
            <div style="font-size:12px;font-weight:500;margin-bottom:3px;color:var(--n-800);">${line ? esc(line.label) : ''}</div>
            <select class="st-mb-input" data-stock-receive-item aria-label="${esc(intakeText('item'))}" style="width:100%;font-size:12px;">${optionsHtml}</select>
          </td>
          <td class="r" style="width:90px;">
            <input class="st-mb-input mono" data-stock-receive-qty aria-label="${esc(t('mScanConflictColQty'))}" type="number" min="0" step="0.001" placeholder="0" value="${esc(lineQty)}" style="font-size:12px;" />
          </td>
          <td class="r" style="width:100px;">
            <input class="st-mb-input mono" data-stock-receive-cost aria-label="${esc(t('mScanColInvoicedCost'))}" type="number" min="0" step="0.01" placeholder="0.00" value="${esc(lineCost)}" style="font-size:12px;" />
          </td>
          <td class="r" style="width:132px;"><input class="st-mb-input mono" data-stock-receive-dlc type="date" title="${esc(intakeText('expiry'))}" style="font-size:12px;" /></td>
          <td class="r mono" data-stock-receive-ref-cost style="width:90px;font-size:12px;color:var(--n-600);">
            ${comparison.currentCost > 0 ? fmtMad(comparison.currentCost) : '·'}
          </td>
          <td style="min-width:170px;font-size:12px;">
            <div style="display:flex;align-items:center;">
              <span data-stock-receive-badge>${badgeHtml}</span>
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11.5px;color:var(--n-700);">
                <input type="checkbox" data-stock-receive-update-cost ${isChecked ? 'checked' : ''} />
                <span>${esc(t('mScanUpdateCost'))}</span>
              </label>
            </div>
          </td>
          <td class="r" style="width:30px;">
            <button class="st-btn" type="button" data-stock-receive-remove aria-label="${esc(t('mScanIgnore'))}" style="padding:4px 8px;font-size:12px;">×</button>
          </td>
        </tr>`;
    };

    let rowsHtml = '';
    if (parsed?.lines?.length) {
      rowsHtml = parsed.lines.map((l, i) => makeRow(l, matches[i])).join('');
    } else {
      rowsHtml = makeRow(null, null) + makeRow(null, null) + makeRow(null, null);
    }

    const supInputHtml = preSupplier
      ? `<input class="st-mb-input" data-stock-receive-supplier aria-label="${esc(t('mScanSupplier'))}" value="${esc(preSupplier.name)}" readonly style="background:var(--n-100,#f4f5f6); cursor:not-allowed;" />`
      : `<input class="st-mb-input" data-stock-receive-supplier aria-label="${esc(t('mScanSupplier'))}" autocomplete="organization" placeholder="${esc(t('mScanSupplier'))}" value="${esc(supName)}" />`;

    return `
      <div class="st-mb-eyebrow">${parsed ? esc(t('mScanReviewT')) : esc(intakeText('receipt'))}</div>
      <div class="st-notice ok">${svg('checkCircle', 14)}<div>${esc(intakeText('notice'))}</div></div>
      ${opts?.intakeDocId ? `<input type="hidden" data-stock-intake-doc value="${esc(String(opts.intakeDocId))}" /><div class="st-notice info" style="margin-top:8px;">${svg('receipt', 14)}<div>${esc(t('mScanArchived'))} · <span class="mono">${esc(String(opts.intakeDocId).slice(0, 12))}…</span></div></div>` : ''}
      <div class="st-mb-row three" style="margin-top:12px;">
        <div class="st-mb-field"><label class="st-mb-label">${esc(t('mScanSupplier'))}</label>${supInputHtml}</div>
        <div class="st-mb-field"><label class="st-mb-label">${esc(t('mScanDate'))}</label><input class="st-mb-input mono" data-stock-receive-date aria-label="${esc(t('mScanDate'))}" type="date" value="${esc(invoiceDate)}" /></div>
        <div class="st-mb-field"><label class="st-mb-label">${esc(t('mScanNum'))}</label><input class="st-mb-input mono" data-stock-receive-ref aria-label="${esc(t('mScanNum'))}" placeholder="${esc(t('mScanNum'))}" value="${esc(invoiceNum)}" /></div>
      </div>
      <div style="overflow-x:auto;max-height:360px;margin-top:12px;border:1px solid var(--n-200,#e5e7eb);border-radius:6px;">
        <table class="st-inv-items" style="margin:0;width:100%;">
          <thead>
            <tr>
              <th>${esc(intakeText('item'))}</th>
              <th class="r">${esc(t('mScanConflictColQty'))}</th>
              <th class="r">${esc(t('mScanColInvoicedCost'))} MAD</th>
              <th class="r">${esc(intakeText('expiry'))}</th>
              <th class="r">${esc(t('mScanColCurrentCost'))}</th>
              <th>${esc(intakeText('change'))}</th>
              <th></th>
            </tr>
          </thead>
          <tbody data-stock-receive-rows>${rowsHtml}</tbody>
        </table>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
        <button data-activation=write class="st-btn" type="button" data-stock-receive-add>${esc(intakeText('add'))}</button>
        <div class="st-inv-foot" style="margin:0;padding:0;border:none;"><span>${esc(t('mScanTotal'))}</span><b data-stock-receive-total>0,00 MAD</b></div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;">
        <button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button>
        <button data-activation=write class="st-btn primary" data-stock-scan-confirm>${esc(intakeText('save'))}</button>
      </div>`;
  }

  function stLegacyPostAll(ctx) {
    const supplier = String((ctx && ctx.supplier) || '');
    const externalRef = String((ctx && ctx.externalRef) || '');
    const date = String((ctx && ctx.date) || '');
    const receivedAt = +((ctx && ctx.receivedAt) || Date.now());
    const receiptRef = String((ctx && ctx.receiptRef) || ('receipt-' + Date.now().toString(36)));
    const lines = Array.isArray(ctx && ctx.lines) ? ctx.lines : [];
    const items = Array.isArray(ctx && ctx.items) ? ctx.items : [];
    const receivingLines = lines.map((line) => {
      const it = items.find((x) => x.id === line.itemId);
      return {
        itemId: line.itemId,
        name: it?.name || line.itemId,
        qty: line.qty,
        unit: it?.unit || 'unité',
        unitCost: line.cost,
      };
    });
    let receiptId = receiptRef;
    if (window.KiwiProcurement?.receiveDirect) {
      let known = window.KiwiProcurement.doc()?.suppliers?.find((s) => String(s.name || '').toLowerCase() === supplier.toLowerCase());
      if (!known) known = window.KiwiProcurement.addSupplier({ name: supplier });
      const receipt = window.KiwiProcurement.receiveDirect({
        receiptId: receiptRef,
        supplierId: known?.id || supplier,
        externalRef,
        receivedAt,
        lines: receivingLines,
        skipMovements: true,
        skipCosts: true,
      });
      if (receipt && receipt.id) receiptId = receipt.id;
      if (window.KiwiProcurement?.attachInvoice) {
        try {
          window.KiwiProcurement.attachInvoice({
            supplierId: known?.id || supplier,
            number: externalRef,
            date,
            receiptId,
            lines: receivingLines,
            source: 'pdf',
          });
        } catch (_) {}
      }
    }
    // La boucle moveStock reste la SEULE à écrire des mouvements sur ce chemin.
    lines.forEach((line) => {
      const it = items.find((x) => x.id === line.itemId);
      if (!it) return;
      const { supId, supRank } = stUpsertSupplierCard(it, supplier, line);
      moveStock(it, line.qty, 'receipt', 'receipt', receiptRef,
        [supplier, externalRef, date].filter(Boolean).join(' · '), line.cost || null, {
          supplierId: supId,
          supplierName: supplier,
          externalRef,
          receiptRef,
          receivedAt,
          rank: supRank,
          expiresAt: line.dlc ? new Date(line.dlc + 'T23:59:59').getTime() : null,
        });
      if (line.updateCost && line.cost > 0 && window.KiwiCost?.setItemCost) {
        window.KiwiCost.setItemCost(it.id, line.cost, supplier);
      }
    });
    return { receiptId };
  }

  function stClaimConfirmBusy(btn) {
    if (!btn || btn.dataset?.busy === '1') return false;
    try {
      btn.dataset.busy = '1';
      if (typeof btn.setAttribute === 'function') btn.setAttribute('disabled', '');
    } catch (_) {}
    return true;
  }

  function stReleaseConfirmBusy(btn) {
    if (!btn) return;
    try {
      delete btn.dataset.busy;
      if (typeof btn.removeAttribute === 'function') btn.removeAttribute('disabled');
    } catch (_) {}
  }

  function wireScanReview() {
    const scope = topBackdrop() || document;
    const tbody = scope.querySelector('[data-stock-receive-rows]');
    const allItems = getInv();

    const recompute = () => {
      let total = 0;
      const supInput = scope.querySelector('[data-stock-receive-supplier]');
      const currentSup = supInput ? supInput.value.trim() : '';

      scope.querySelectorAll('[data-stock-receive-row]').forEach((row) => {
        const qty = Math.max(0, +(row.querySelector('[data-stock-receive-qty]')?.value || 0));
        const cost = Math.max(0, +(row.querySelector('[data-stock-receive-cost]')?.value || 0));
        total += qty * cost;

        const sel = row.querySelector('[data-stock-receive-item]');
        const itemId = sel ? sel.value : '';
        const item = itemId ? allItems.find((candidate) => candidate.id === itemId) : null;

        const comp = compareLineCost(item, cost, currentSup);
        const refCostEl = row.querySelector('[data-stock-receive-ref-cost]');
        if (refCostEl) {
          refCostEl.textContent = comp.currentCost > 0 ? fmtMad(comp.currentCost) : '·';
        }

        const cb = row.querySelector('[data-stock-receive-update-cost]');
        if (cb && cb.dataset.userSet !== '1') {
          cb.checked = !!(item && comp.currentCost > 0 && cost > 0 && comp.isRise);
        }

        const badgeSpan = row.querySelector('[data-stock-receive-badge]');
        if (badgeSpan) {
          if (item && comp.currentCost > 0 && cost > 0) {
            if (comp.isRise) {
              badgeSpan.innerHTML = `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:var(--warn-bg,#fffbeb);color:var(--warn-fg,#b45309);margin-right:6px;">↑ +${comp.pct}%</span>`;
            } else if (comp.isDrop) {
              badgeSpan.innerHTML = `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:var(--ok-bg,#ecfdf5);color:var(--ok-fg,#047857);margin-right:6px;">↓ −${Math.abs(comp.pct)}%</span>`;
            } else {
              badgeSpan.innerHTML = '';
            }
          } else {
            badgeSpan.innerHTML = '';
          }
        }
      });

      const out = scope.querySelector('[data-stock-receive-total]');
      if (out) out.textContent = fmtMad(total);
    };

    const wireRows = () => {
      scope.querySelectorAll('[data-stock-receive-qty],[data-stock-receive-cost]').forEach((el) => {
        el.oninput = recompute;
      });
      scope.querySelectorAll('[data-stock-receive-update-cost]').forEach((cb) => {
        cb.onchange = () => {
          cb.dataset.userSet = '1';
        };
      });
      scope.querySelectorAll('[data-stock-receive-item]').forEach((sel) => {
        sel.onchange = () => {
          const row = sel.closest('tr');
          const cb = row?.querySelector('[data-stock-receive-update-cost]');
          if (cb) delete cb.dataset.userSet;
          const costInp = row?.querySelector('[data-stock-receive-cost]');
          const itemId = sel.value;
          const it = itemId ? allItems.find((candidate) => candidate.id === itemId) : null;
          if (it && costInp && !costInp.value) {
            const comp = compareLineCost(it, 0, scope.querySelector('[data-stock-receive-supplier]')?.value);
            if (comp.currentCost > 0) costInp.value = comp.currentCost;
          }
          recompute();
        };
      });
      scope.querySelectorAll('[data-stock-receive-remove]').forEach((el) => {
        el.onclick = () => {
          if (scope.querySelectorAll('[data-stock-receive-row]').length > 1) {
            el.closest('tr')?.remove();
          }
          recompute();
        };
      });
    };

    scope.querySelector('[data-stock-receive-add]')?.addEventListener('click', () => {
      const optionsHtml = `<option value="">${esc(t('mScanChoose'))}</option>` + allItems.map((it) => `<option value="${esc(it.id)}">${esc(it.name)} (${esc(it.unit || 'unité')})</option>`).join('');
      const emptyRowHtml = `
        <tr data-stock-receive-row>
          <td style="min-width:180px;">
            <select class="st-mb-input" data-stock-receive-item aria-label="${esc(intakeText('item'))}" style="width:100%;font-size:12px;">${optionsHtml}</select>
          </td>
          <td class="r" style="width:90px;">
            <input class="st-mb-input mono" data-stock-receive-qty aria-label="${esc(t('mScanConflictColQty'))}" type="number" min="0" step="0.001" placeholder="0" style="font-size:12px;" />
          </td>
          <td class="r" style="width:100px;">
            <input class="st-mb-input mono" data-stock-receive-cost aria-label="${esc(t('mScanColInvoicedCost'))}" type="number" min="0" step="0.01" placeholder="0.00" style="font-size:12px;" />
          </td>
          <td class="r" style="width:132px;"><input class="st-mb-input mono" data-stock-receive-dlc type="date" title="${esc(intakeText('expiry'))}" style="font-size:12px;" /></td>
          <td class="r mono" data-stock-receive-ref-cost style="width:90px;font-size:12px;color:var(--n-600);">·</td>
          <td style="min-width:170px;font-size:12px;">
            <div style="display:flex;align-items:center;">
              <span data-stock-receive-badge></span>
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11.5px;color:var(--n-700);">
                <input type="checkbox" data-stock-receive-update-cost />
                <span>${esc(t('mScanUpdateCost'))}</span>
              </label>
            </div>
          </td>
          <td class="r" style="width:30px;">
            <button class="st-btn" type="button" data-stock-receive-remove aria-label="${esc(t('mScanIgnore'))}" style="padding:4px 8px;font-size:12px;">×</button>
          </td>
        </tr>`;
      tbody?.insertAdjacentHTML('beforeend', emptyRowHtml);
      wireRows();
      recompute();
    });

    wireRows();
    recompute();

    const confirmBtn = scope.querySelector('[data-stock-scan-confirm]');
    confirmBtn?.addEventListener('click', async () => {
      const supplier = scope.querySelector('[data-stock-receive-supplier]')?.value.trim() || '';
      const externalRef = scope.querySelector('[data-stock-receive-ref]')?.value.trim() || '';
      const date = scope.querySelector('[data-stock-receive-date]')?.value || '';
      const intakeDocId = scope.querySelector('[data-stock-intake-doc]')?.value || '';

      const lines = Array.from(scope.querySelectorAll('[data-stock-receive-row]')).map((row) => ({
        itemId: row.querySelector('[data-stock-receive-item]')?.value || '',
        qty: Math.max(0, +(row.querySelector('[data-stock-receive-qty]')?.value || 0)),
        cost: Math.max(0, +(row.querySelector('[data-stock-receive-cost]')?.value || 0)),
        updateCost: !!row.querySelector('[data-stock-receive-update-cost]')?.checked,
        // DLC / DDM saisie à la réception — alimente le suivi de péremption (lots FIFO)
        dlc: row.querySelector('[data-stock-receive-dlc]')?.value || '',
      })).filter((line) => line.itemId && line.qty > 0);

      if (!supplier || !lines.length) {
        window.Kiwi.toast?.('Indiquez le fournisseur et au moins une ligne reçue.', { type: 'warning' });
        return;
      }

      // Garde anti double-clic : un seul appui effectif jusqu'à la fermeture
      // ou l'échec récupérable. Les appuis concurrents sont jetés.
      if (!stClaimConfirmBusy(confirmBtn)) return;
      const releaseBusy = () => stReleaseConfirmBusy(confirmBtn);

      // Guichet unique : jamais deux écritures stock pour le même document.
      // Le même PDF re-déposé (deuxième appareil, marquage interrompu) est
      // arrêté ici, AVANT tout moveStock.
      if (intakeDocId) {
        const guard = stIntakePostGuard(stIntakePostedHas(intakeDocId), await stIntakeServerStatus(intakeDocId));
        if (guard !== 'ok') {
          const st = scope.querySelector('[data-stock-scan-stage]');
          if (st) { st.innerHTML = stRenderIntakeStop(t('mScanDupT'), t('mScanDupDone', '')); wireIntakeStop(); }
          else window.Kiwi.toast?.(t('mScanDupT'), { type: 'warn' });
          releaseBusy();
          return;
        }
      }

      // Chemin historique (hors guichet) : référence aléatoire, inchangé.
      const receiptRef = 'receipt-' + Date.now().toString(36);
      const receivedAt = date ? new Date(`${date}T12:00:00`).getTime() : Date.now();
      const inv = getInv();

      if (intakeDocId) {
        // Guichet unique : UN SEUL propriétaire des écritures (stIntakePostAll
        // : ligne comptable + mouvements + coûts + facture, tout déterministe
        // et rejouable après n'importe quelle interruption). Ni receiveDirect
        // ni moveStock ne sont appelés sur ce chemin.
        const ctxLines = lines.map((line) => {
          const it = inv.find((x) => x.id === line.itemId);
          let cardSupplierId = '';
          let cardRank = 1;
          if (it) {
            const card = stUpsertSupplierCard(it, supplier, line,
              'supc-intake-' + stIntakeHash(it.id + '|' + String(supplier).toLowerCase()));
            cardSupplierId = card.supId;
            cardRank = card.supRank;
          }
          return {
            itemId: line.itemId,
            name: it?.name || line.itemId,
            qty: line.qty,
            unit: it?.unit || 'unité',
            unitCost: line.cost,
            updateCost: line.updateCost,
            dlc: line.dlc || '',
            cardSupplierId, cardRank,
          };
        }).filter((l) => l.itemId && l.qty > 0);
        try {
          await stIntakePostAll({
            docId: intakeDocId, supplierName: supplier, externalRef, receivedAt,
            issuedAt: date ? new Date(`${date}T12:00:00`).getTime() : receivedAt,
            source: 'pdf', lines: ctxLines,
          });
        } catch (err) {
          /* Reprise divergente : aucun écrit n'a eu lieu (le prepare précède
           * tout), on montre l'état dédié plutôt que l'échec générique — et
           * toujours ni postedAdd, ni marquage, ni fermeture. */
          if (await stHandleIntakePostingConflict(scope, err, intakeDocId, ctxLines)) { releaseBusy(); return; }
          window.Kiwi.toast?.(t('mScanFailFallback'), { type: 'warn' });
          releaseBusy();
          return; // ni postedAdd, ni marquage, ni fermeture : la reprise converge.
        }
      } else {

      // Chemin historique : stLegacyPostAll est l'unique écrivain (boucle
      // moveStock seule ; receiveDirect ne fait que la pièce + facture).
      try {
        stLegacyPostAll({ supplier, externalRef, date, receivedAt, lines, items: inv, receiptRef });
      } catch (_) {
        window.Kiwi.toast?.(t('mScanFailFallback'), { type: 'warn' });
        releaseBusy();
        return;
      }
      } // fin chemin historique

      stSaveOverlay();
      // Guichet unique : le stock est écrit, on scelle le brouillon. Si le
      // marquage échoue (onglet tué, réseau coupé), l'outbox le rejouera —
      // marquage seul, jamais de repost — à la prochaine ouverture du scan.
      if (intakeDocId) {
        stIntakePostedAdd(intakeDocId);
        try {
          const marked = await stIntakeMarkOnce(intakeDocId);
          if (!marked) window.Kiwi.toast?.(t('mScanMarkRetry'), { type: 'warn' });
        } catch (_) {}
      }
      closeTopModal();
      window.Kiwi.toast?.(`${lines.length} ligne${lines.length > 1 ? 's' : ''} reçue${lines.length > 1 ? 's' : ''} et ajoutée${lines.length > 1 ? 's' : ''} au stock.`, { type: 'success', duration: 3800 });
      if (S.stPageActive) render();
    });
  }

  return { normalizeMatchStr, tokenizeMatchStr, tokenOverlapScore, matchInvoiceLines, compareLineCost, loadPdfJs, extractPdfText, stUpsertSupplierCard, stIntakePostingLines, stIntakePostingCanonical, stIntakePostingFingerprint, stIntakePrepare, stIntakePostAll, stIntakeEnabled, stIntakeIdHint, stIntakeMrzZone, stIntakeHash, stIntakePostingIds, stIntakeSupplierId, stSha256Hex, stIntakeMerchant, stIntakeCommit, stIntakeUpload, stIntakeOutboxKey, stIntakeOutboxRead, stIntakeOutboxWrite, stIntakePostedKey, stIntakePostedHas, stIntakePostedAdd, stIntakePostGuard, stIntakeServerStatus, stIntakeMarkOnce, stIntakeFlushOutbox, stRenderIntakeStop, wireIntakeStop, stIntakeFetchRecorded, stIntakeCompareConflict, stRenderIntakeConflict, stShowIntakeConflict, stHandleIntakePostingConflict, stRestoreIntakeReview, openInvoiceScan, renderScanStage1, wireScanStage1, stArchiveUrl, stIntakeArchiveList, stFmtSize, stFmtArcDate, stArcTypeLabel, stArcStatusLabel, renderScanArchive, openScanArchive, renderScanReview, renderRealReceiptReview, stLegacyPostAll, stClaimConfirmBusy, stReleaseConfirmBusy, wireScanReview };
});
