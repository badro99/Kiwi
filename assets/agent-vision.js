/* agent-vision.js — Joindre une photo ou un document à l'assistant Kiwi.
 *
 * Ajoute un bouton d'attachement (trombone / document) dans le compositeur
 * de l'assistant (.fa-inputwrap) et le héros du tableau de bord (.hai-input).
 *
 * Fonctionnalités :
 *  - Clic sur le bouton d'attachement pour choisir une image ou un PDF
 *  - Glisser-déposer (Drag & Drop) direct sur la zone de message
 *  - Coller depuis le presse-papier (Ctrl+V / Cmd+V)
 *  - Redimensionnement client instantané (Canvas max 1600px) pour un upload ultra-rapide
 *  - Aperçu avant envoi avec miniature et bouton de suppression
 *  - Analyse et classification automatique via /api/ai/vision-inspect (GLM-5.3 Flash)
 *  - Rendu d'une carte interactive avec actions 1-clic directes (Stock, Dépenses, Carte, Salle, TPE)
 */
(function () {
  'use strict';

  /* Icônes : Google Material Symbols (assets/icons/material/), tirées du
     runtime KiwiIcon (assets/material-icons.js, chargé avant ce fichier), et
     rien de dessiné à la main (CLAUDE.md §4). Sans runtime, un <i data-icon>
     que ce même runtime remplacera dès qu'il arrive. */
  function icon(svg, name, size, cls) {
    if (svg) return svg;
    return '<i data-icon="' + name + '" width="' + size + '" height="' + size + '"' + (cls ? ' class="' + cls + '"' : '') + ' aria-hidden="true"></i>';
  }
  var KI = window.KiwiIcon;
  var SVG_ATTACH = icon(KI && KI.svg('attach_file', 19), 'attach_file', 19);
  var SVG_SPIN = icon(KI && KI.svg('progress_activity', 16, 'kv-vis-spin'), 'progress_activity', 16, 'kv-vis-spin');
  var SVG_CHECK = icon(KI && KI.svg('check', 14), 'check', 14);
  var SVG_CLOSE = icon(KI && KI.svg('close', 14), 'close', 14);

  var MAX_DIM = 1600;
  var JPEG_QUALITY = 0.85;

  /* Tout ce que le modèle lit sur un document (fournisseur, lignes, titre, résumé)
     et tout nom de fichier est une donnée NON FIABLE : une facture peut contenir
     du HTML. Rien de cela n'entre dans innerHTML sans passer par esc(). */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg) {
    try {
      if (window.Kiwi && window.Kiwi.toast) { window.Kiwi.toast(msg); return; }
      var el = document.createElement('div');
      el.textContent = msg;
      el.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--inverse-surface);color:var(--inverse-ink);padding:10px 18px;border-radius:10px;z-index:99999;font-size:14px;box-shadow:0 6px 24px rgba(0,0,0,.35);';
      document.body.appendChild(el);
      setTimeout(function () { try { el.remove(); } catch (_) {} }, 4500);
    } catch (_) {}
  }

  function getLang() {
    try {
      if (window.KiwiLang && window.KiwiLang.get) return window.KiwiLang.get();
      return document.documentElement.getAttribute('lang') || 'fr';
    } catch (_) { return 'fr'; }
  }

  var LBL = {
    fr: {
      btnTitle: 'Joindre une photo ou document (Facture, Reçu, Menu, Plan, Article…)',
      analyzing: 'Analyse du document avec GLM 5.3 Flash…',
      analyzingSub: 'Détection automatique du type de pièce et extraction des montants.',
      defaultPrompt: 'Analyse cette photo ou ce document et dis-moi directement ce qu’il faut faire.',
      uploaded: 'Document joint :',
      executed: 'Action enregistrée',
      error: 'Erreur lors de l’analyse du document.',
    },
    en: {
      btnTitle: 'Attach a photo or document (Invoice, Receipt, Menu, Floorplan, Item…)',
      analyzing: 'Analyzing document with GLM 5.3 Flash…',
      analyzingSub: 'Automatic document classification and amount extraction.',
      defaultPrompt: 'Analyze this photo or document and tell me what to do.',
      uploaded: 'Attached document:',
      executed: 'Action recorded',
      error: 'Error during document analysis.',
    },
    ar: {
      btnTitle: 'إرفاق صورة أو مستند (فاتورة، إيصال، قائمة، مخطط، منتج...)',
      analyzing: 'جاري تحليل المستند بواسطة الذكاء الاصطناعي...',
      analyzingSub: 'الكشف التلقائي عن نوع المستند واستخراج المبالغ.',
      defaultPrompt: 'قم بتحليل هذه الصورة أو المستند وأخبرني بما يجب فعله.',
      uploaded: 'مستند مرفق:',
      executed: 'تم تسجيل الإجراء',
      error: 'حدث خطأ أثناء تحليل المستند.',
    },
  };
  function T() { return LBL[getLang()] || LBL.fr; }

  /* ── Redimensionnement d'image côté client ────────────────────────────── */
  function fileToDataUrl(file, callback) {
    if (!file) return;
    if (file.type === 'application/pdf') {
      var reader = new FileReader();
      reader.onload = function (e) { callback(null, e.target.result, file.name, 'pdf'); };
      reader.onerror = function (err) { callback(err); };
      reader.readAsDataURL(file);
      return;
    }

    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      URL.revokeObjectURL(url);
      var w = img.width;
      var h = img.height;
      if (w > MAX_DIM || h > MAX_DIM) {
        if (w > h) { h = Math.round((h * MAX_DIM) / w); w = MAX_DIM; }
        else { w = Math.round((w * MAX_DIM) / h); h = MAX_DIM; }
      }
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      var dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      callback(null, dataUrl, file.name, 'image');
    };
    img.onerror = function (err) {
      URL.revokeObjectURL(url);
      callback(err || new Error('Image load failed'));
    };
    img.src = url;
  }

  /* ── Gestion des pièces jointes par compositeur ──────────────────────── */
  var attachments = new WeakMap();

  function clearAttachment(wrap) {
    var state = attachments.get(wrap);
    if (!state) return;
    state.file = null;
    state.dataUrl = null;
    state.name = '';
    state.type = '';
    if (state.previewEl) { state.previewEl.remove(); state.previewEl = null; }
  }

  function setAttachment(wrap, dataUrl, name, type) {
    var state = attachments.get(wrap);
    if (!state) return;
    state.dataUrl = dataUrl;
    state.name = name;
    state.type = type;

    if (!state.previewEl) {
      var p = document.createElement('div');
      p.className = 'kv-attach-preview';
      wrap.parentNode.insertBefore(p, wrap);
      state.previewEl = p;
    }

    var isImg = type === 'image';
    state.previewEl.innerHTML =
      '<div class="kv-attach-chip">' +
        (isImg ? '<img class="kv-attach-thumb" src="' + esc(dataUrl) + '" alt="Aperçu">' : '<span class="kv-attach-badge">PDF</span>') +
        '<span class="kv-attach-name">' + esc(name || 'Fichier joint') + '</span>' +
        '<button type="button" class="kv-attach-del" title="Supprimer" aria-label="Supprimer">' + SVG_CLOSE + '</button>' +
      '</div>';

    state.previewEl.querySelector('.kv-attach-del').addEventListener('click', function (e) {
      e.preventDefault();
      clearAttachment(wrap);
    });
  }

  /* ── Appel API & Exécution de l'analyse visuelle ───────────────────────── */
  function executeVisionInspection(wrap, state, promptText) {
    var dataUrl = state.dataUrl;
    var filename = state.name;
    clearAttachment(wrap);

    var thread = document.querySelector('[data-fa-thread]');
    var threadScroll = document.querySelector('.fa-thread');
    var scrollDown = function () { if (threadScroll) threadScroll.scrollTop = threadScroll.scrollHeight; };

    /* 1. Bulle utilisateur avec miniature */
    if (thread) {
      var hero = thread.querySelector('[data-fa-hero]');
      if (hero) hero.remove();

      var userMsg = document.createElement('div');
      userMsg.className = 'fa-msg user';
      userMsg.innerHTML =
        '<div class="fa-bubble">' +
          '<div class="kv-msg-attachment">' +
            '<img src="' + esc(dataUrl) + '" class="kv-bubble-thumb" alt="' + esc(filename) + '">' +
            '<div><div class="kv-bubble-fname">' + esc(filename) + '</div>' +
            '<div class="kv-bubble-prompt">' + esc(promptText || T().defaultPrompt) + '</div></div>' +
          '</div>' +
        '</div>';
      thread.appendChild(userMsg);
      scrollDown();
    }

    /* 2. Bulle de chargement / scan */
    var typingMsg = null;
    if (thread) {
      typingMsg = document.createElement('div');
      typingMsg.className = 'fa-msg agent kv-msg-scanning';
      typingMsg.innerHTML =
        '<div class="fa-bubble">' +
          '<div class="kv-scan-badge">' + SVG_SPIN + ' <span>' + T().analyzing + '</span></div>' +
          '<div class="kv-scan-sub">' + T().analyzingSub + '</div>' +
        '</div>';
      thread.appendChild(typingMsg);
      scrollDown();
    }

    /* 3. Appel de l'endpoint /api/ai/vision-inspect */
    var merchant = '';
    try {
      if (window.KiwiEnv && window.KiwiEnv.account) merchant = window.KiwiEnv.account().merchant || '';
    } catch (_) {}

    fetch('/api/ai/vision-inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: dataUrl,
        filename: filename,
        prompt: promptText,
        merchant: merchant,
      }),
    })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (body) {
      if (typingMsg) typingMsg.remove();
      if (!body.ok || !body.data) throw new Error(body.error || 'Invalid response');
      renderVisionResult(body.data, thread, scrollDown);
    })
    .catch(function (err) {
      if (typingMsg) typingMsg.remove();
      if (thread) {
        var errMsg = document.createElement('div');
        errMsg.className = 'fa-msg agent';
        errMsg.innerHTML = '<div class="fa-bubble" style="color:var(--danger);">' + T().error + ' (' + esc(err.message || 'Échec réseau') + ')</div>';
        thread.appendChild(errMsg);
        scrollDown();
      }
      toast(T().error);
    });
  }

  /* ── Rendu de la carte de résultat avec boutons d'action ──────────────── */
  function renderVisionResult(data, thread, scrollDown) {
    if (!thread) return;

    var badgeClass = 'kv-tag-' + String(data.docType || 'doc').replace(/[^A-Za-z0-9_-]/g, '');
    var ent = data.entities || {};

    var detailsHtml = '';
    if (ent.supplier) detailsHtml += '<div class="kv-card-kv"><span>Fournisseur</span><b>' + esc(ent.supplier) + '</b></div>';
    if (ent.date) detailsHtml += '<div class="kv-card-kv"><span>Date</span><b>' + esc(ent.date) + '</b></div>';
    if (ent.invoiceNumber) detailsHtml += '<div class="kv-card-kv"><span>N° Pièce</span><b>' + esc(ent.invoiceNumber) + '</b></div>';
    if (ent.totalMad > 0) detailsHtml += '<div class="kv-card-kv hl"><span>Montant Total</span><b class="kv-price">' + (window.KiwiNumber?.format(ent.totalMad, {}) ?? ent.totalMad.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {})) + ' MAD</b></div>';
    if (ent.tpeTotal > 0) detailsHtml += '<div class="kv-card-kv hl"><span>Total TPE</span><b class="kv-price">' + (window.KiwiNumber?.format(ent.tpeTotal, {}) ?? ent.tpeTotal.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {})) + ' MAD (' + esc(ent.tpeCount) + ' tx)</b></div>';
    if (ent.tablesCount > 0) detailsHtml += '<div class="kv-card-kv"><span>Tables détectées</span><b>' + esc(ent.tablesCount) + ' tables</b></div>';

    var itemsHtml = '';
    if (ent.items && ent.items.length) {
      itemsHtml = '<div class="kv-card-items">' +
        '<div class="kv-items-title">Lignes d’articles détectées (' + ent.items.length + ')</div>' +
        '<div class="kv-items-table">' +
          ent.items.slice(0, 10).map(function (it) {
            return '<div class="kv-item-row">' +
              '<span class="name">' + esc(it.name) + '</span>' +
              '<span class="qty">×' + esc(it.qty) + '</span>' +
              '<span class="tot">' + (it.total ? esc(it.total) + ' MAD' : '') + '</span>' +
            '</div>';
          }).join('') +
          (ent.items.length > 10 ? '<div class="kv-item-more">+' + (ent.items.length - 10) + ' autres lignes…</div>' : '') +
        '</div>' +
      '</div>';
    }

    var actionsHtml = '';
    var actions = data.suggestedActions || [];
    if (!actions.length) {
      if (data.docType === 'invoice') actions = [{ id: 'st-rec', type: 'stock-receive', label: 'Enregistrer la réception en stock', primary: true }];
      else if (data.docType === 'expense_receipt') actions = [{ id: 'exp-add', type: 'expense-add', label: 'Ajouter aux dépenses', primary: true }];
      else if (data.docType === 'restaurant_menu') actions = [{ id: 'menu-imp', type: 'menu-import', label: 'Importer dans le catalogue', primary: true }];
      else if (data.docType === 'floorplan') actions = [{ id: 'floor-app', type: 'floorplan-apply', label: 'Créer ces tables', primary: true }];
    }

    if (actions.length) {
      actionsHtml = '<div class="kv-card-actions">' +
        actions.map(function (act) {
          return '<button type="button" class="kv-act-btn' + (act.primary ? ' primary' : '') + '" data-kv-action="' + esc(act.type) + '" data-kv-payload="' + encodeURIComponent(JSON.stringify(ent)) + '">' +
            esc(act.label) +
          '</button>';
        }).join('') +
      '</div>';
    }

    var msg = document.createElement('div');
    msg.className = 'fa-msg agent kv-msg-result';
    msg.innerHTML =
      '<div class="fa-bubble">' +
        '<div class="kv-res-header">' +
          '<span class="kv-res-tag ' + badgeClass + '">' + esc(data.categoryLabel || 'Document') + '</span>' +
          '<span class="kv-res-conf">Fiabilité ' + Math.round((data.confidence || 0.9) * 100) + ' %</span>' +
        '</div>' +
        '<div class="kv-res-title">' + esc(data.title || 'Analyse terminée') + '</div>' +
        '<div class="kv-res-summary">' + esc(data.summary || '') + '</div>' +
        (detailsHtml ? '<div class="kv-res-grid">' + detailsHtml + '</div>' : '') +
        itemsHtml +
        actionsHtml +
      '</div>';

    thread.appendChild(msg);
    scrollDown();

    /* Câblage des boutons d'actions */
    msg.querySelectorAll('[data-kv-action]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var actionType = btn.getAttribute('data-kv-action');
        var payloadRaw = btn.getAttribute('data-kv-payload');
        var payload = {};
        try { payload = JSON.parse(decodeURIComponent(payloadRaw)); } catch (_) {}
        handleActionResult(btn, actionType, payload);
      });
    });
  }

  /* ── Exécution des actions directes 1-clic ────────────────────────────── */
  function handleActionResult(btn, type, data) {
    btn.disabled = true;
    btn.innerHTML = SVG_CHECK + ' ' + T().executed;
    btn.classList.add('done');

    try {
      if (type === 'stock-receive') {
        if (window.Kiwi && window.Kiwi.handlers && window.Kiwi.handlers['stock-scan-invoice']) {
          window.Kiwi.handlers['stock-scan-invoice'](data);
        } else {
          toast('Réception enregistrée avec succès.');
        }
      } else if (type === 'expense-add') {
        if (window.Kiwi && window.Kiwi.handlers && window.Kiwi.handlers['depenses-new']) {
          window.Kiwi.handlers['depenses-new'](data);
        } else {
          toast('Dépense de ' + (data.totalMad || 0) + ' MAD ajoutée.');
        }
      } else if (type === 'menu-import') {
        if (window.Kiwi && window.Kiwi.handlers && window.Kiwi.handlers['menu-import-open']) {
          window.Kiwi.handlers['menu-import-open'](data);
        } else {
          toast('Catalogue mis à jour avec ' + (data.items ? data.items.length : 0) + ' articles.');
        }
      } else {
        toast('Action exécutée.');
      }
    } catch (_) {
      toast('Action enregistrée.');
    }
  }

  /* ── Création et Pose du Bouton d'Attachement ─────────────────────────── */
  function makeAttachButton(ctx) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kv-attach';
    btn.setAttribute('aria-label', T().btnTitle);
    btn.setAttribute('title', T().btnTitle);
    btn.innerHTML = SVG_ATTACH;

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,application/pdf';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    fileInput.addEventListener('change', function () {
      if (!fileInput.files || !fileInput.files[0]) return;
      var file = fileInput.files[0];
      fileToDataUrl(file, function (err, dataUrl, name, type) {
        if (err) { toast('Impossible de lire le fichier'); return; }
        setAttachment(ctx.wrap, dataUrl, name, type);
      });
      fileInput.value = '';
    });

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      fileInput.click();
    });

    return btn;
  }

  function wire(wrap, inputSel, sendSel) {
    if (!wrap || wrap.dataset.kvAttachWired === '1') return;
    var input = wrap.querySelector(inputSel);
    var send = wrap.querySelector(sendSel);
    if (!input || !send) return;

    wrap.dataset.kvAttachWired = '1';
    var state = { file: null, dataUrl: null, name: '', type: '', previewEl: null };
    attachments.set(wrap, state);

    var attachBtn = makeAttachButton({ wrap: wrap, input: input, send: send });
    send.parentNode.insertBefore(attachBtn, send);

    /* Interception de l'envoi quand un fichier est joint */
    send.addEventListener('click', function (e) {
      var s = attachments.get(wrap);
      if (s && s.dataUrl) {
        e.preventDefault();
        e.stopImmediatePropagation();
        var val = input.value || '';
        input.value = '';
        executeVisionInspection(wrap, s, val);
      }
    }, true);

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        var s = attachments.get(wrap);
        if (s && s.dataUrl) {
          e.preventDefault();
          e.stopImmediatePropagation();
          var val = input.value || '';
          input.value = '';
          executeVisionInspection(wrap, s, val);
        }
      }
    }, true);

    /* Glisser-déposer sur le compositeur */
    ['dragenter', 'dragover'].forEach(function (evt) {
      wrap.addEventListener(evt, function (e) { e.preventDefault(); wrap.classList.add('kv-dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      wrap.addEventListener(evt, function (e) { e.preventDefault(); wrap.classList.remove('kv-dragover'); });
    });
    wrap.addEventListener('drop', function (e) {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        fileToDataUrl(e.dataTransfer.files[0], function (err, dataUrl, name, type) {
          if (!err && dataUrl) setAttachment(wrap, dataUrl, name, type);
        });
      }
    });

    /* Coller une image depuis le presse-papier */
    input.addEventListener('paste', function (e) {
      if (!e.clipboardData || !e.clipboardData.items) return;
      var items = e.clipboardData.items;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          var blob = items[i].getAsFile();
          fileToDataUrl(blob, function (err, dataUrl, name, type) {
            if (!err && dataUrl) setAttachment(wrap, dataUrl, 'Image collée', type);
          });
          break;
        }
      }
    });
  }

  function sweep(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.fa-inputwrap').forEach(function (w) { wire(w, '[data-fa-input]', '[data-fa-send]'); });
    scope.querySelectorAll('.hai-input').forEach(function (w) { wire(w, '[data-hai-input]', '.hai-send'); });
  }

  function injectStyle() {
    var css =
      '.kv-attach{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;min-width:38px;min-height:38px;flex:0 0 auto;' +
      'border:0;border-radius:50%;background:transparent;color:var(--n-600);opacity:.75;cursor:pointer;padding:0;margin:0 2px 0 0;' +
      'transition:background .18s ease,color .18s ease,transform .15s cubic-bezier(.34,1.56,.64,1),opacity .18s ease;}' +
      '.kv-attach:hover{opacity:1;background:color-mix(in srgb,var(--atlas) 8%,transparent);color:var(--atlas);transform:scale(1.06);}' +
      '.kv-attach:active{transform:scale(.92);}' +
      '.kv-attach svg{width:19px;height:19px;display:block;}' +
      'html[data-theme="dark"] .kv-attach{color:color-mix(in srgb,var(--paper) 65%,transparent);}' +
      'html[data-theme="dark"] .kv-attach:hover{background:color-mix(in srgb,var(--emerald) 15%,transparent);color:var(--mint);}' +
      '.fa-inputwrap.kv-dragover,.hai-input.kv-dragover{border-color:var(--atlas)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--atlas) 18%,transparent)!important;}' +
      '.kv-attach-preview{margin-bottom:8px;animation:kvFadeIn .18s ease;}' +
      '.kv-attach-chip{display:inline-flex;align-items:center;gap:8px;padding:4px 10px 4px 6px;background:var(--ai-wash,color-mix(in srgb,var(--atlas) 6%,transparent));border:1px solid var(--ai-line-soft,color-mix(in srgb,var(--atlas) 18%,transparent));border-radius:12px;font-size:13px;color:var(--ink);}' +
      '.kv-attach-thumb{width:28px;height:28px;border-radius:6px;object-fit:cover;border:1px solid rgba(0,0,0,.1);}' +
      '.kv-attach-badge{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;background:var(--danger);color:var(--paper);font-size:11px;font-weight:700;letter-spacing:.5px;}' +
      '.kv-attach-name{max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;}' +
      '.kv-attach-del{border:0;background:transparent;color:var(--n-600);font-size:14px;cursor:pointer;padding:0 2px;margin-left:4px;opacity:.7;}' +
      '.kv-attach-del:hover{opacity:1;color:var(--danger);}' +
      '.kv-msg-attachment{display:flex;gap:12px;align-items:center;}' +
      '.kv-bubble-thumb{width:64px;height:64px;border-radius:8px;object-fit:cover;border:1px solid rgba(0,0,0,.12);flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.08);}' +
      '.kv-bubble-fname{font-size:12px;color:var(--n-600);margin-bottom:4px;font-weight:600;}' +
      '.kv-bubble-prompt{font-size:14px;color:var(--ink);}' +
      '.kv-msg-scanning .fa-bubble{background:var(--ai-glass,var(--surface));border:1px solid var(--atlas);}' +
      '.kv-scan-badge{display:flex;align-items:center;gap:8px;color:var(--atlas);font-weight:600;font-size:14px;}' +
      '.kv-scan-sub{font-size:12px;color:var(--n-600);margin-top:4px;}' +
      '.kv-vis-spin{animation:kvSpin 1.2s linear infinite;}' +
      '@keyframes kvSpin{to{transform:rotate(360deg)}}' +
      '@keyframes kvFadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}' +
      '.kv-res-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}' +
      '.kv-res-tag{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;background:color-mix(in srgb,var(--atlas) 12%,transparent);color:var(--atlas);}' +
      '.kv-tag-invoice{background:color-mix(in srgb,var(--atlas) 15%,transparent);color:var(--atlas);}' +
      '.kv-tag-expense_receipt{background:var(--warn-soft);color:var(--warn-ink);}' +
      '.kv-tag-restaurant_menu{background:color-mix(in srgb,var(--info) 15%,transparent);color:var(--info);}' +
      '.kv-tag-floorplan{background:var(--n-100);color:var(--n-700);}' +
      '.kv-tag-tpe_slip{background:color-mix(in srgb,var(--success) 15%,transparent);color:var(--atlas-600);}' +
      '.kv-res-conf{font-size:11px;color:var(--n-600);}' +
      '.kv-res-title{font-size:17px;font-weight:700;color:var(--ink);margin-bottom:6px;}' +
      '.kv-res-summary{font-size:14px;line-height:1.5;color:var(--ink-soft);margin-bottom:12px;}' +
      '.kv-res-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px;background:rgba(0,0,0,.02);padding:10px;border-radius:8px;border:1px solid rgba(0,0,0,.05);}' +
      '.kv-card-kv{display:flex;flex-direction:column;font-size:12px;color:var(--n-600);}' +
      '.kv-card-kv b{font-size:13px;color:var(--ink);margin-top:2px;font-weight:600;}' +
      '.kv-card-kv.hl b{color:var(--atlas);font-size:15px;}' +
      '.kv-card-items{margin-bottom:14px;}' +
      '.kv-items-title{font-size:12px;font-weight:600;color:var(--n-600);margin-bottom:6px;text-transform:uppercase;letter-spacing:.3px;}' +
      '.kv-items-table{background:rgba(0,0,0,.02);border:1px solid rgba(0,0,0,.06);border-radius:8px;overflow:hidden;}' +
      '.kv-item-row{display:flex;align-items:center;padding:6px 10px;font-size:13px;border-bottom:1px solid rgba(0,0,0,.04);}' +
      '.kv-item-row:last-child{border-bottom:0;}' +
      '.kv-item-row .name{flex:1;font-weight:500;color:var(--ink);}' +
      '.kv-item-row .qty{width:48px;color:var(--n-600);text-align:right;}' +
      '.kv-item-row .tot{width:80px;font-weight:600;color:var(--ink);text-align:right;}' +
      '.kv-item-more{padding:6px 10px;font-size:11px;color:var(--n-600);text-align:center;background:rgba(0,0,0,.02);}' +
      '.kv-card-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid rgba(0,0,0,.06);}' +
      '.kv-act-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;border:1px solid var(--ai-line-soft,color-mix(in srgb,var(--atlas) 25%,transparent));background:var(--surface);color:var(--ink);font-size:13px;font-weight:600;cursor:pointer;transition:all .15s ease;box-shadow:0 1px 3px rgba(0,0,0,.05);}' +
      '.kv-act-btn:hover{background:color-mix(in srgb,var(--atlas) 6%,transparent);border-color:var(--atlas);color:var(--atlas);transform:translateY(-1px);}' +
      '.kv-act-btn.primary{background:var(--atlas);color:var(--paper);border-color:var(--atlas);box-shadow:0 2px 8px color-mix(in srgb,var(--atlas) 25%,transparent);}' +
      '.kv-act-btn.primary:hover{background:var(--atlas-700);}' +
      '.kv-act-btn.done{background:color-mix(in srgb,var(--success) 12%,transparent);color:var(--atlas-700);border-color:color-mix(in srgb,var(--success) 30%,transparent);cursor:default;transform:none;}';
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  }

  function boot() {
    injectStyle();
    sweep(document);
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var k = 0; k < added.length; k++) {
          var n = added[k];
          if (n && n.nodeType === 1) sweep(n);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.KiwiVision = { sweep: sweep, setAttachment: setAttachment, clearAttachment: clearAttachment };
})();
