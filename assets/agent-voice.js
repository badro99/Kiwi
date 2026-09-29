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
