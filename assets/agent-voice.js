/* agent-voice.js — parler à l'assistant au lieu de taper.
 *
 * Un bouton micro dans les deux endroits où on pose une question à
 * l'assistant : la boîte du héros du tableau de bord (.hai-input) et le
 * compositeur du tiroir assistant (.fa-inputwrap). Un appui enregistre, un
 * second appui envoie l'audio à /api/ai/voice (Whisper sur Workers AI, même
 * binding que le copilote) ; le texte transcrit tombe dans le champ et part
 * tout seul — la conversation se mène à la voix.
 *
 * Fail-soft, dans les deux sens :
 *  - pas de MediaRecorder, endpoint absent (503), quota du jour (429) → on
 *    retombe sur la reconnaissance du NAVIGATEUR (webkitSpeechRecognition),
 *    moins bonne en darija mais toujours utilisable ;
 *  - rien de tout ça ne marche → un toast, jamais une erreur brute.
 *
 * Le tiroir assistant est rendu à l'ouverture (Kiwi.drawer) : on ne peut pas
 * câbler au chargement. Un MutationObserver pose le bouton sur chaque
 * compositeur qui apparaît — la même robustesse que la lentille liquide.
 */
(function () {
  'use strict';

  /* Icônes : Material Symbols (assets/icons/material/mic.svg,
   * stop_circle.svg) — forme pleine, viewBox natif, currentColor. */
  var SVG_MIC = '<svg viewBox="0 -960 960 960" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M395-435q-35-35-35-85v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q0 50-35 85t-85 35q-50 0-85-35Zm85-205Zm-40 520v-123q-104-14-172-93t-68-184h80q0 83 58.5 141.5T480-320q83 0 141.5-58.5T680-520h80q0 105-68 184t-172 93v123h-80Zm68.5-371.5Q520-503 520-520v-240q0-17-11.5-28.5T480-800q-17 0-28.5 11.5T440-760v240q0 17 11.5 28.5T480-480q17 0 28.5-11.5Z"/></svg>';
  var SVG_STOP = '<svg viewBox="0 -960 960 960" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M320-320h320v-320H320v320ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg>';

  var MAX_RECORD_MS = 60000;      // personne ne dicte plus d'une minute
  var MIN_BLOB_BYTES = 1200;      // en dessous, c'est un clic accidentel

  /* Après un 503 (binding absent) ou un 429 (quota du jour), inutile de
   * repayer l'aller-retour : les dictées suivantes de la session passent
   * directement par le navigateur. */
  var preferBrowser = false;
  /* A 401 means no account session (the signed-out demo): say so at once on
   * the next press instead of recording a question that cannot be sent. */
  var needsSignIn = false;

  var active = null;              // { btn, recorder, stream, timer } — une seule dictée à la fois

  /* Copy in the merchant's language. The app and the dashboard both stamp
   * <html lang>; kiwiLang is the web fallback. */
  var WORDS = {
    fr: { dictate: 'Dicter votre question', stop: 'Arrêter et envoyer', busy: 'Transcription…',
          nothing: 'Rien entendu · réessayez plus près du micro', unavailable: 'Dictée indisponible sur cet appareil',
          denied: 'Micro refusé · autorisez-le dans Réglages › Kiwi Pro', interrupted: 'Dictée interrompue · réessayez',
          fallback: 'Transcription Kiwi indisponible · le micro passe par le navigateur, réessayez',
          down: 'Transcription indisponible pour le moment', auth: 'La dictée demande un compte Kiwi connecté. La démo ne transcrit pas l’audio',
          failed: 'Transcription en échec · réessayez', offline: 'Hors ligne · la dictée a besoin du réseau' },
    en: { dictate: 'Dictate your question', stop: 'Stop and send', busy: 'Transcribing…',
          nothing: 'Nothing heard · try again closer to the microphone', unavailable: 'Dictation is not available on this device',
          denied: 'Microphone blocked · allow it in Settings › Kiwi Pro', interrupted: 'Dictation stopped · try again',
          fallback: 'Kiwi transcription unavailable · using the browser microphone, try again',
          down: 'Transcription is unavailable right now', auth: 'Dictation needs a signed-in Kiwi account. The demo does not transcribe audio',
          failed: 'Transcription failed · try again', offline: 'Offline · dictation needs the network' },
    ar: { dictate: 'أملِ سؤالك', stop: 'إيقاف وإرسال', busy: 'جارٍ التفريغ…',
          nothing: 'لم يُسمع شيء · أعد المحاولة قرب الميكروفون', unavailable: 'الإملاء غير متاح على هذا الجهاز',
          denied: 'الميكروفون محظور · اسمح به في الإعدادات › Kiwi Pro', interrupted: 'توقف الإملاء · أعد المحاولة',
          fallback: 'تفريغ Kiwi غير متاح · يُستخدم ميكروفون المتصفح، أعد المحاولة',
          down: 'التفريغ غير متاح حاليًا', auth: 'الإملاء يتطلب حساب Kiwi مسجّل الدخول. العرض التجريبي لا يفرّغ الصوت',
          failed: 'فشل التفريغ · أعد المحاولة', offline: 'غير متصل · الإملاء يحتاج إلى الشبكة' },
  };
  function lang() {
    var l = String(document.documentElement.lang || '').slice(0, 2);
    if (!WORDS[l]) { try { l = String(localStorage.getItem('kiwiLang') || '').slice(0, 2); } catch (_) {} }
    return WORDS[l] ? l : 'fr';
  }
  function w(key) { return WORDS[lang()][key] || WORDS.fr[key]; }

  /* Every message here reports a problem, except none: say so to the toast,
   * so it is not drawn with a success tick. */
  function toast(msg, type) {
    type = type || 'error';
    try {
      if (window.Kiwi && window.Kiwi.toast) { window.Kiwi.toast(msg, { type: type, force: true }); return; }
      var el = document.createElement('div');
      el.textContent = msg;
      el.setAttribute('role', 'alert');
      el.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#0A0F0D;color:#F7F5F0;padding:10px 18px;border-radius:10px;z-index:99999;font-size:14px;box-shadow:0 6px 24px rgba(0,0,0,.35);';
      document.body.appendChild(el);
      setTimeout(function () { try { el.remove(); } catch (_) {} }, 4500);
    } catch (_) {}
  }

  function speechCtor() {
    // Native consent names Cloudflare, never silently switch to another provider.
    if (document.documentElement.classList.contains('kiwi-native')) return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }
  function canRecord() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  function pickMime() {
    var list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (var i = 0; i < list.length; i++) {
      try { if (window.MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (_) {}
    }
    return '';
  }

  function setState(btn, state) {
    btn.classList.remove('rec', 'busy');
    var label = state === 'rec' ? w('stop') : state === 'busy' ? w('busy') : w('dictate');
    btn.innerHTML = state === 'rec' ? SVG_STOP : SVG_MIC;
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', state === 'rec' ? 'true' : 'false');
    if (state === 'busy') btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
    if (state) btn.classList.add(state);
  }

  /* Le texte transcrit tombe dans le champ pour relecture par le commerçant :
   * il peut ainsi vérifier, ajuster un mot et appuyer sur Entrée pour envoyer. */
  function deliver(ctx, text) {
    var t = String(text || '').trim();
    if (!t) { toast(w('nothing'), 'warn'); return; }
    var cur = (ctx.input.value || '').trim();
    ctx.input.value = cur ? cur + ' ' + t : t;
    try {
      ctx.input.dispatchEvent(new Event('input', { bubbles: true }));
      ctx.input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {}
    try {
      ctx.input.focus();
      if (ctx.input.setSelectionRange && typeof ctx.input.value === 'string') {
        var len = ctx.input.value.length;
        ctx.input.setSelectionRange(len, len);
      }
    } catch (_) {}
  }

  /* ── Secours : la reconnaissance du navigateur ─────────────────────── */
  function browserDictate(ctx, btn) {
    var Ctor = speechCtor();
    if (!Ctor) { toast(w('unavailable')); return; }
    var rec;
    try { rec = new Ctor(); } catch (_) { toast(w('unavailable')); return; }
    var lang = { fr: 'fr-FR', ar: 'ar-MA', en: 'en-US', es: 'es-ES' }[localStorage.getItem('kiwiLang') || 'fr'] || 'fr-FR';
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setState(btn, 'rec');
    active = { btn: btn, speech: rec };
    rec.onresult = function (e) {
      var t = e.results && e.results[0] && e.results[0][0] ? e.results[0][0].transcript : '';
      deliver(ctx, t);
    };
    rec.onerror = function (e) {
      if (e && e.error === 'not-allowed') toast(w('denied'));
      else toast(w('interrupted'));
    };
    rec.onend = function () { active = null; setState(btn, ''); };
    try { rec.start(); } catch (_) { active = null; setState(btn, ''); }
  }

  /* ── Chemin principal : enregistrer puis transcrire chez Whisper ───── */
  function startRecording(ctx, btn) {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var mime = pickMime();
      var recorder;
      try { /* Speech needs ~32 kb/s. WebKit's default is several times that, which
       * pushed a 30 s question past the endpoint's 2 MB cap. */
      var opts = { audioBitsPerSecond: 32000 };
      if (mime) opts.mimeType = mime;
      recorder = new MediaRecorder(stream, opts); }
      catch (_) { stream.getTracks().forEach(function (t) { t.stop(); }); browserDictate(ctx, btn); return; }
      var chunks = [];
      recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        if (active && active.timer) clearTimeout(active.timer);
        active = null;
        var blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' });
        if (blob.size < MIN_BLOB_BYTES) { setState(btn, ''); return; }
        transcribe(ctx, btn, blob);
      };
      var timer = setTimeout(function () { try { recorder.stop(); } catch (_) {} }, MAX_RECORD_MS);
      active = { btn: btn, recorder: recorder, stream: stream, timer: timer };
      setState(btn, 'rec');
      recorder.start();
    }).catch(function () {
      toast(w('denied'));
    });
  }

  function transcribe(ctx, btn, blob) {
    setState(btn, 'busy');
    var reader = new FileReader();
    reader.onload = function () {
      var b64 = String(reader.result || '').split(',')[1] || '';
      if (!b64) { setState(btn, ''); toast(w('interrupted')); return; }
      fetch('/api/ai/voice', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ audio: b64 }),
      }).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (j) { return { res: res, j: j }; });
      }).then(function (r) {
        setState(btn, '');
        if (r.j && r.j.ok) { deliver(ctx, r.j.text); return; }
        var code = r.res.status === 401 ? 'auth' : ((r.j && r.j.error) || r.res.status);
        try { console.warn('[kiwi-voice] transcription refused', r.res.status, code, blob.type, blob.size); } catch (_) {}
        /* L'endpoint nomme sa panne ; on choisit le secours en connaissance
         * de cause plutôt que de réessayer un mur toute la journée. */
        if (code === 'unbound' || code === 'quota') {
          preferBrowser = !!speechCtor();
          toast(speechCtor() ? w('fallback') : w('down'), 'warn');
        } else if (code === 'auth') {
          needsSignIn = true;
          toast(w('auth'), 'warn');
        } else {
          toast(w('failed'));
        }
      }).catch(function (error) {
        setState(btn, '');
        if (error && error.name === 'NotAllowedError') return;
        toast(w('offline'));
      });
    };
    reader.onerror = function () { setState(btn, ''); toast(w('interrupted')); };
    reader.readAsDataURL(blob);
  }

  function onPress(ctx, btn) {
    if (active) {
      /* Second appui : on clôt la dictée en cours, où qu'elle soit. */
      if (active.recorder) { try { active.recorder.stop(); } catch (_) {} }
      else if (active.speech) { try { active.speech.stop(); } catch (_) {} }
      return;
    }
    if (btn.classList.contains('busy')) return;
    if (needsSignIn) { toast(w('auth'), 'warn'); return; }
    if (window.KiwiNativePrivacy) {
      if (!canRecord()) { toast(w('unavailable')); return; }
      /* The press is the explicit request: ask again rather than stay silent
         when AI was refused earlier in the session. */
      var P = window.KiwiNativePrivacy;
      var ask = P.allowed && P.allowed() ? Promise.resolve(true) : P.show();
      ask.then(function (allowed) { if (allowed && !active) startRecording(ctx, btn); });
      return;
    }
    if (preferBrowser || !canRecord()) { browserDictate(ctx, btn); return; }
    startRecording(ctx, btn);
  }

  /* ── Pose du bouton ────────────────────────────────────────────────── */
  function makeButton(ctx) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kv-mic';
        setState(btn, '');
    btn.addEventListener('click', function (e) { e.preventDefault(); onPress(ctx, btn); });
    return btn;
  }

  function wire(wrap, inputSel, sendSel) {
    if (!wrap || wrap.dataset.kvWired === '1') return;
    var input = wrap.querySelector(inputSel);
    var send = wrap.querySelector(sendSel);
    if (!input || !send) return;
    wrap.dataset.kvWired = '1';
    send.parentNode.insertBefore(makeButton({ input: input, send: send }), send);
  }

  function sweep(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.fa-inputwrap').forEach(function (w) { wire(w, '[data-fa-input]', '[data-fa-send]'); });
    scope.querySelectorAll('.hai-input').forEach(function (w) { wire(w, '[data-hai-input]', '.hai-send'); });
  }

  function injectStyle() {
    var css =
      '.kv-mic{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;min-width:38px;min-height:38px;flex:0 0 auto;' +
      'border:0;border-radius:50%;background:transparent;color:var(--n-600,#5C6761);opacity:.75;cursor:pointer;padding:0;margin:0;' +
      'transition:background .18s ease,color .18s ease,transform .15s cubic-bezier(.34,1.56,.64,1),opacity .18s ease;}' +
      '.kv-mic:hover{opacity:1;background:rgba(11,110,79,.08);color:var(--atlas,#0B6E4F);transform:scale(1.06);}' +
      '.kv-mic:active{transform:scale(.92);}' +
      '.kv-mic svg{width:20px;height:20px;display:block;}' +
      '.kv-mic.rec{opacity:1;color:#e5484d;background:rgba(229,72,77,.12);animation:kv-mic-pulse 1.1s ease-in-out infinite;}' +
      '.kv-mic.busy{opacity:.7;color:var(--atlas,#0B6E4F);animation:kv-mic-spin 1s linear infinite;cursor:progress;}' +
      'html[data-theme="dark"] .kv-mic{color:rgba(247,245,240,.65);}' +
      'html[data-theme="dark"] .kv-mic:hover{background:rgba(63,182,122,.15);color:var(--mint,#3FB67A);}' +
      '@keyframes kv-mic-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}' +
      '@keyframes kv-mic-spin{to{transform:rotate(360deg)}}';
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  }

  function boot() {
    injectStyle();
    sweep(document);
    /* Le tiroir assistant naît après coup ; on le voit naître. */
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

  window.KiwiVoice = { sweep: sweep };
})();
/* ── Ci-dessous, l'ancien assets/agent-vision.js (réuni ici le 23 octobre 2026, corps inchangé). ── */
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
      executed: 'Ouvert, à confirmer',
      actionFailed: 'L’action n’a pas abouti. Réessayez.',
      unavailable: 'Cette action n’est pas disponible ici.',
      reviewTag: 'À vérifier',
      reviewTitle: 'Lecture incertaine',
      reviewSub: 'Kiwi n’a pas pu lire ce document de façon fiable. Rien n’a été enregistré : vérifiez-le à la main.',
      error: 'Erreur lors de l’analyse du document.',
    },
    en: {
      btnTitle: 'Attach a photo or document (Invoice, Receipt, Menu, Floorplan, Item…)',
      analyzing: 'Analyzing document with GLM 5.3 Flash…',
      analyzingSub: 'Automatic document classification and amount extraction.',
      defaultPrompt: 'Analyze this photo or document and tell me what to do.',
      uploaded: 'Attached document:',
      executed: 'Opened, confirm there',
      actionFailed: 'The action did not go through. Try again.',
      unavailable: 'This action is not available here.',
      reviewTag: 'Needs review',
      reviewTitle: 'Uncertain reading',
      reviewSub: 'Kiwi could not read this document reliably. Nothing was recorded: check it by hand.',
      error: 'Error during document analysis.',
    },
    ar: {
      btnTitle: 'إرفاق صورة أو مستند (فاتورة، إيصال، قائمة، مخطط، منتج...)',
      analyzing: 'جاري تحليل المستند بواسطة الذكاء الاصطناعي...',
      analyzingSub: 'الكشف التلقائي عن نوع المستند واستخراج المبالغ.',
      defaultPrompt: 'قم بتحليل هذه الصورة أو المستند وأخبرني بما يجب فعله.',
      uploaded: 'مستند مرفق:',
      executed: 'فُتح، أكّد هناك',
      actionFailed: 'لم يكتمل الإجراء. أعد المحاولة.',
      unavailable: 'هذا الإجراء غير متاح هنا.',
      reviewTag: 'للمراجعة',
      reviewTitle: 'قراءة غير مؤكدة',
      reviewSub: 'لم يتمكن Kiwi من قراءة هذا المستند بشكل موثوق. لم يُسجَّل أي شيء: تحقق منه يدوياً.',
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
        '<button data-activation=write type="button" class="kv-attach-del" title="Supprimer" aria-label="Supprimer">' + SVG_CLOSE + '</button>' +
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
        locale: document.documentElement.lang || localStorage.getItem('kiwiLang') || 'fr',
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

    /* Lecture illisible côté serveur : une carte « à vérifier », sans fiabilité
       ni bouton d'action. Le texte brut du modèle n'est qu'une donnée (esc). */
    if (data && data.reviewNeeded) {
      var rv = document.createElement('div');
      rv.className = 'fa-msg agent kv-msg-result kv-msg-review';
      rv.innerHTML =
        '<div class="fa-bubble">' +
          '<div class="kv-res-header"><span class="kv-res-tag kv-tag-review">' + esc(T().reviewTag) + '</span></div>' +
          '<div class="kv-res-title">' + esc(T().reviewTitle) + '</div>' +
          '<div class="kv-res-summary">' + esc(T().reviewSub) + '</div>' +
          (data.summary ? '<div class="kv-res-raw">' + esc(data.summary) + '</div>' : '') +
        '</div>';
      thread.appendChild(rv);
      scrollDown();
      return rv;
    }

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
          /* La fiabilité est celle que le modèle a donnée : 0 reste 0, absente on ne l'affiche pas. */
          (typeof data.confidence === 'number' && isFinite(data.confidence)
            ? '<span class="kv-res-conf">Fiabilité ' + Math.round(data.confidence * 100) + ' %</span>' : '') +
        '</div>' +
        '<div class="kv-res-title">' + esc(data.title || 'Analyse terminée') + '</div>' +
        '<div class="kv-res-summary">' + esc(data.summary || '') + '</div>' +
        (detailsHtml ? '<div class="kv-res-grid">' + detailsHtml + '</div>' : '') +
        itemsHtml +
        actionsHtml +
      '</div>';

    thread.appendChild(msg);
    scrollDown();
    var result = msg;

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
    return result;
  }

  /* ── Exécution des actions directes 1-clic ────────────────────────────── */
  /* Chaque action vise un handler réel de Kiwi.handlers. Le bouton ne passe à
     « fait » qu'APRÈS que ce handler a terminé sans erreur (promesse résolue
     comprise). Handler absent, exception ou promesse rejetée : état d'échec,
     message traduit, et le bouton reste cliquable pour réessayer. Plus jamais
     de toast « enregistré » quand rien n'a tourné. */
  var ACTION_HANDLERS = {
    'stock-receive': 'stock-scan-invoice',
    'expense-add': 'depenses-new',
    'menu-import': 'menu-import-open',
  };

  function actionLabel(btn) {
    var l = btn.getAttribute('data-kv-label');
    if (l == null) { l = btn.textContent || ''; btn.setAttribute('data-kv-label', l); }
    return l;
  }

  function actionStatus(btn, msg) {
    try {
      var box = btn.closest && btn.closest('.kv-card-actions');
      if (!box) return;
      var st = box.querySelector('.kv-act-status');
      if (!msg) { if (st) st.remove(); return; }
      if (!st) {
        st = document.createElement('div');
        st.className = 'kv-act-status';
        st.setAttribute('role', 'status');
        box.appendChild(st);
      }
      st.textContent = msg;
    } catch (_) {}
  }

  function actionFailed(btn, label, msg) {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.classList.remove('done');
    btn.classList.add('failed');
    btn.innerHTML = esc(label);
    actionStatus(btn, msg);
    toast(msg);
    return false;
  }

  function handleActionResult(btn, type, data) {
    if (btn.getAttribute('aria-busy') === 'true' || btn.classList.contains('done')) return Promise.resolve(false);
    var label = actionLabel(btn);
    var name = ACTION_HANDLERS[type];
    var H = window.Kiwi && window.Kiwi.handlers;
    var fn = name && H && typeof H[name] === 'function' ? H[name] : null;
    if (!fn) return Promise.resolve(actionFailed(btn, label, T().unavailable));

    btn.classList.remove('failed');
    actionStatus(btn, '');
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = SVG_SPIN + ' ' + esc(label);

    var run;
    try { run = Promise.resolve(fn(data)); } catch (err) { run = Promise.reject(err); }
    return run.then(function (out) {
      /* Un handler qui répond explicitement false a refusé : ce n'est pas fait. */
      if (out === false) return actionFailed(btn, label, T().actionFailed);
      btn.removeAttribute('aria-busy');
      btn.disabled = true;
      btn.innerHTML = SVG_CHECK + ' ' + esc(T().executed);
      btn.classList.add('done');
      return true;
    }, function () {
      return actionFailed(btn, label, T().actionFailed);
    });
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
      '.kv-act-btn.failed{border-color:var(--danger);color:var(--danger);}' +
      '.kv-act-btn[aria-busy="true"]{cursor:progress;}' +
      '.kv-act-status{flex-basis:100%;font-size:12px;color:var(--danger);}' +
      '.kv-tag-review{background:var(--warn-soft);color:var(--warn-ink);}' +
      '.kv-res-raw{font-size:12px;line-height:1.5;color:var(--n-600);white-space:pre-wrap;max-height:160px;overflow:auto;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.02);border:1px solid rgba(0,0,0,.05);}' +
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

  window.KiwiVision = {
    sweep: sweep, setAttachment: setAttachment, clearAttachment: clearAttachment,
    /* Exposés pour tools/agent-vision-test.mjs : le rendu d'une lecture et l'exécution d'une action. */
    renderResult: renderVisionResult, runAction: handleActionResult,
  };
})();
/* ── Ci-dessous, l'ancien assets/agent-skin.js (réuni ici le 23 octobre 2026, corps inchangé). ── */
/* ═══════════════════════════════════════════════════════════════════════════
 * KIWI · ASSISTANT — « LE RELEVÉ », la couche vivante.
 *
 * assets/agent-skin.css fait la forme ; ce fichier fait les trois choses que
 * le CSS ne peut pas faire seul, et RIEN d'autre :
 *
 *   1. numéroter les feuillets (I, II, III… sur le filet de reliure) ;
 *   2. sortir le chiffre de tête en display (la première statistique d'une
 *      réponse est toujours la métrique du titre — c'est un fait de agent.js,
 *      pas une supposition) ;
 *   3. L'ANCRAGE VISIBLE : allumer, dans le volet de droite, les lignes dont
 *      la valeur apparaît littéralement dans la réponse, et lier les deux au
 *      survol.
 *
 * ── POURQUOI L'ANCRAGE EST UNE CORRESPONDANCE DE TEXTE, ET PAS UN GRAPHE ───
 * On pourrait faire déclarer à chaque scénario ses entrées de calcul, et
 * dessiner le vrai graphe de dépendances. Ce serait plus riche — et ce serait
 * une deuxième vérité à maintenir à côté du calcul, qui dériverait au premier
 * scénario modifié sans que rien ne le signale. Une interface qui prétend
 * montrer la provenance et se trompe est pire que pas d'interface du tout :
 * c'est exactement la faute que l'audit de juillet a relevée côté chiffres.
 *
 * Donc on n'affirme que ce qu'on peut prouver sur place : « ce montant, dans
 * la réponse, est le même que celui-ci, sur vos livres ». Correspondance
 * exacte, chaîne contre chaîne, après normalisation des espaces (fine,
 * insécable, ordinaire — toLocaleString('fr-FR') émet les trois). Aucun lien
 * approché, aucune tolérance : un chiffre qui ne correspond pas ne s'allume
 * pas, et c'est une information en soi.
 *
 * ── RÉVERSIBILITÉ ──────────────────────────────────────────────────────────
 *   KiwiAiSkin.disable()  → l'ancien assistant, au pixel près.
 *   KiwiAiSkin.enable()   → le relevé.
 *   KiwiAiSkin.toggle()
 * L'attribut <html data-kiwi-ai="releve"> est le seul interrupteur ; retirer
 * le <link> et le <script> de dashboard.html suffit à revenir en arrière.
 *
 * Zéro dépendance. N'entre jamais dans agent.js.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.KiwiAiSkin) return;

  var ROOT_ATTR = 'data-kiwi-ai';
  var SKIN = 'releve';
  var ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

  /* Espaces fine / insécable / insécable étroite / ordinaire : toLocaleString
     ('fr-FR') n'émet pas le même selon le moteur, et deux chaînes qui
     s'affichent pareil doivent se comparer pareil. */
  function norm(s) {
    return String(s == null ? '' : s)
      .replace(/[    \s]+/g, ' ')
      .trim().toLowerCase();
  }

  /* ─── 1 · les feuillets et le chiffre de tête ─────────────────────────── */

  /* Le canal `stats` d'agent.js ne transporte pas que des montants : le
     parcours de configuration y fait passer ses questions
     (`{ l:'Question de configuration 1/3', v:'Vos catégories, traitements et
     tarifs sont-ils prêts ?' }`). Promue au rang de chiffre de tête, une
     phrase s'affichait en 48 px vert d'atlas et traversait la carte.
     On ne promeut donc que ce qui se lit comme un nombre : un chiffre
     présent, et une longueur de montant — « 842 300 MAD », « 69,0 % »,
     « 134 ». Tout le reste est de la prose, et se compose comme telle. */
  function isFigure(s) {
    var t = norm(s);
    return !!t && t.length <= 24 && /\d/.test(t);
  }

  function dressAnswer(msg, index) {
    if (!msg || msg.dataset.rlvDone === '1') return;
    msg.dataset.rlvDone = '1';
    msg.setAttribute('data-rlv-turn', ROMAN[index] || String(index));
    var stats = msg.querySelectorAll('.fa-stats > .fa-stat');
    for (var i = 0; i < stats.length; i++) {
      var v = stats[i].querySelector('.v');
      if (!isFigure(v ? v.textContent : '')) { stats[i].classList.add('rlv-prose'); continue; }
      if (i === 0) stats[i].classList.add('rlv-lead');
    }
  }

  /* ─── 2 · l'ancrage visible ───────────────────────────────────────────── */
  function railRows(scope) {
    return Array.prototype.slice.call(
      scope.querySelectorAll('.fa-ctx-kpi, .fa-ctx-item, .fa-ctx-net')
    );
  }
  /* La valeur portée par une ligne du volet — « 842 300 MAD ». Assez longue
     pour ne pas s'allumer par hasard : « 134 » se retrouve partout, « 842 300
     MAD » n'apparaît que là où on l'a écrit. */
  function rowValue(row) {
    var v = row.querySelector('.v');
    var t = norm(v ? v.textContent : '');
    if (t.length < 6) return '';           /* trop court pour prouver quoi que ce soit */
    /* Certaines lignes portent deux faits (« 581 300 MAD · 69,0 % ») : on ne
       retient que le premier, le seul dont on soit sûr de la frontière. */
    return t.split(' · ')[0].trim();
  }

  /* Entoure chaque occurrence de `needle` dans les nœuds texte de `el`.
     N'opère QUE sur des nœuds texte : le HTML de la réponse (gras, liens)
     ressort intact, il n'est jamais reconstruit à partir d'une chaîne. */
  function markOccurrences(el, needle, key) {
    if (!needle) return 0;
    var hits = 0;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (n.parentNode && n.parentNode.classList && n.parentNode.classList.contains('rlv-cite')) {
          return NodeFilter.FILTER_REJECT;      /* déjà cité, on ne réentoure pas */
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);

    texts.forEach(function (node) {
      var hay = norm(node.nodeValue);
      var at = hay.indexOf(needle);
      if (at === -1) return;
      /* norm() peut avoir changé la longueur (espaces multiples) ; on
         relocalise sur le texte BRUT avec une comparaison normalisée
         glissante, sinon la découpe tomberait à côté. */
      var raw = node.nodeValue;
      var start = -1, end = -1;
      for (var i = 0; i < raw.length && start === -1; i++) {
        for (var j = i + needle.length - 2; j <= Math.min(raw.length, i + needle.length + 6); j++) {
          if (norm(raw.slice(i, j)) === needle) { start = i; end = j; break; }
        }
      }
      if (start === -1) return;
      /* norm() avale les espaces de tête, donc la fenêtre trouvée peut
         commencer un caractère avant le chiffre — et on soulignait l'espace
         qui précède « 842 300 MAD ». On recale sur le premier caractère utile. */
      while (start < end && /\s/.test(raw[start])) start++;
      while (end > start && /\s/.test(raw[end - 1])) end--;
      var after = node.splitText(start);
      after.splitText(end - start);
      var mark = document.createElement('span');
      mark.className = 'rlv-cite';
      mark.setAttribute('data-rlv-cite', key);
      mark.textContent = after.nodeValue;
      after.parentNode.replaceChild(mark, after);
      hits++;
    });
    return hits;
  }

  function ground(fa) {
    var rows = railRows(fa);
    if (!rows.length) return;
    var bubbles = fa.querySelectorAll('.fa-msg.agent .fa-bubble');
    if (!bubbles.length) return;

    rows.forEach(function (row) {
      var needle = rowValue(row);
      if (!needle) return;
      /* La clé vient de la VALEUR, pas du rang de la ligne : le volet se
         reconstruit (« voir tous les chiffres »), et une clé positionnelle
         aurait relié la trésorerie d'une réponse à la marge de la suivante. */
      var key = 'c' + needle.replace(/[^a-z0-9]/g, '');
      var hits = 0;
      Array.prototype.forEach.call(bubbles, function (b) { hits += markOccurrences(b, needle, key); });
      /* markOccurrences() ignore ce qui est DÉJÀ marqué — sans quoi chaque
         passage réentourerait le même chiffre. Il faut donc compter aussi les
         marques posées aux tours précédents, ou la ligne du volet perdait son
         point dès la deuxième réponse. */
      hits += fa.querySelectorAll('.fa-msg.agent [data-rlv-cite="' + key + '"]').length;
      if (!hits) { row.classList.remove('is-cited'); row.removeAttribute('data-rlv-cite'); return; }
      row.classList.add('is-cited');
      row.setAttribute('data-rlv-cite', key);
    });
  }

  /* Le survol lie les deux sens. Délégué sur le conteneur : les réponses
     arrivent après coup, et un écouteur par élément fuirait à chaque tour. */
  function wireHover(fa) {
    if (fa.dataset.rlvHover === '1') return;
    fa.dataset.rlvHover = '1';
    var light = function (key, on) {
      if (!key) return;
      fa.querySelectorAll('[data-rlv-cite="' + key + '"]').forEach(function (el) {
        el.classList.toggle('is-lit', !!on);
      });
    };
    var keyOf = function (t) {
      var el = t && t.closest ? t.closest('[data-rlv-cite]') : null;
      return el ? el.getAttribute('data-rlv-cite') : null;
    };
    fa.addEventListener('mouseover', function (e) { light(keyOf(e.target), true); });
    fa.addEventListener('mouseout', function (e) { light(keyOf(e.target), false); });
    /* Au clavier et au doigt, le survol n'existe pas : le focus fait le même
       travail, sinon l'ancrage ne serait visible qu'à la souris. */
    fa.addEventListener('focusin', function (e) { light(keyOf(e.target), true); });
    fa.addEventListener('focusout', function (e) { light(keyOf(e.target), false); });
  }

  /* ─── 3 · l'état de service dans le bandeau ───────────────────────────── */
  function stamp(head) {
    if (!head || head.querySelector('.rlv-status')) return;
    var live = null;
    try { live = window.KiwiLive && window.KiwiLive.status ? window.KiwiLive.status() : null; } catch (_) { live = null; }
    var lang = 'FR';
    try { lang = String((window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr').toUpperCase(); } catch (_) {}
    var el = document.createElement('div');
    el.className = 'rlv-status';
    /* Construit nœud par nœud : `lang` vient d'un module tiers, et une ligne
       d'état n'a aucune raison d'être un point d'injection. */
    el.appendChild(document.createElement('i'));
    var label = document.createElement('span');
    label.textContent = (live && live.on ? 'en direct' : 'local') + ' · ' + lang.replace(/[^A-Z]/g, '').slice(0, 3);
    el.appendChild(label);
    head.appendChild(el);
  }

  /* ─── 4 · la boucle ───────────────────────────────────────────────────── */
  var observer = null;
  function refresh(fa) {
    var msgs = fa.querySelectorAll('.fa-msg.agent');
    Array.prototype.forEach.call(msgs, function (m, i) { dressAnswer(m, i + 1); });
    ground(fa);
  }
  function attach() {
    var fa = document.querySelector('.fa-drawer .fa');
    if (!fa) return false;
    wireHover(fa);
    var head = document.querySelector('.fa-drawer .kiwi-drawer-head');
    if (head) { head.style.position = head.style.position || 'relative'; stamp(head); }
    refresh(fa);
    if (observer) observer.disconnect();
    observer = new MutationObserver(function () { refresh(fa); });
    var thread = fa.querySelector('[data-fa-thread]');
    if (thread) observer.observe(thread, { childList: true, subtree: true });
    return true;
  }

  /* Le tiroir naît et meurt au fil des ouvertures : on guette son arrivée sur
     le document plutôt que d'espérer un événement que agent.js n'émet pas. */
  var docWatcher = null;
  function watch() {
    if (docWatcher) return;
    docWatcher = new MutationObserver(function () {
      if (document.documentElement.getAttribute(ROOT_ATTR) !== SKIN) return;
      var fa = document.querySelector('.fa-drawer .fa');
      if (fa && fa.dataset.rlvHover !== '1') attach();
    });
    docWatcher.observe(document.body, { childList: true, subtree: true });
  }

  function enable() {
    document.documentElement.setAttribute(ROOT_ATTR, SKIN);
    watch();
    attach();
  }
  function disable() {
    document.documentElement.removeAttribute(ROOT_ATTR);
    if (observer) { observer.disconnect(); observer = null; }
    /* On rend l'écran d'origine : les marques d'ancrage repartent, les
       feuillets perdent leur numéro. Le CSS, lui, ne s'applique plus du tout
       — c'est l'attribut racine qui le porte en entier. */
    document.querySelectorAll('.rlv-cite').forEach(function (m) {
      var t = document.createTextNode(m.textContent);
      m.parentNode.replaceChild(t, m);
    });
    document.querySelectorAll('[data-rlv-turn]').forEach(function (m) {
      m.removeAttribute('data-rlv-turn'); delete m.dataset.rlvDone;
    });
    document.querySelectorAll('.rlv-lead, .rlv-prose').forEach(function (m) {
      m.classList.remove('rlv-lead'); m.classList.remove('rlv-prose');
    });
    document.querySelectorAll('.is-cited').forEach(function (m) { m.classList.remove('is-cited'); });
    document.querySelectorAll('.rlv-status').forEach(function (m) { m.remove(); });
  }

  window.KiwiAiSkin = {
    enable: enable,
    disable: disable,
    toggle: function () {
      if (document.documentElement.getAttribute(ROOT_ATTR) === SKIN) disable(); else enable();
    },
    name: SKIN,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enable);
  } else {
    enable();
  }
}());
