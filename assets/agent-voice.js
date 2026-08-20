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

  var active = null;              // { btn, recorder, stream, timer } — une seule dictée à la fois

  function toast(msg) {
    try {
      if (window.Kiwi && window.Kiwi.toast) { window.Kiwi.toast(msg); return; }
      var el = document.createElement('div');
      el.textContent = msg;
      el.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#0A0F0D;color:#F7F5F0;padding:10px 18px;border-radius:10px;z-index:99999;font-size:14px;box-shadow:0 6px 24px rgba(0,0,0,.35);';
      document.body.appendChild(el);
      setTimeout(function () { try { el.remove(); } catch (_) {} }, 4500);
    } catch (_) {}
  }

  function speechCtor() {
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
    if (state === 'rec') { btn.classList.add('rec'); btn.innerHTML = SVG_STOP; btn.title = 'Arrêter et envoyer'; }
    else if (state === 'busy') { btn.classList.add('busy'); btn.innerHTML = SVG_MIC; btn.title = 'Transcription…'; }
    else { btn.innerHTML = SVG_MIC; btn.title = 'Dicter votre question'; }
  }

  /* Le texte transcrit tombe dans le champ et part tout seul : la promesse
   * « à la voix » s'arrête net si l'utilisateur doit encore cliquer. */
  function deliver(ctx, text) {
    var t = String(text || '').trim();
    if (!t) { toast('Rien entendu — réessayez plus près du micro'); return; }
    var cur = (ctx.input.value || '').trim();
    ctx.input.value = cur ? cur + ' ' + t : t;
    try { ctx.input.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
    if (ctx.send) ctx.send.click();
  }

  /* ── Secours : la reconnaissance du navigateur ─────────────────────── */
  function browserDictate(ctx, btn) {
    var Ctor = speechCtor();
    if (!Ctor) { toast('Dictée indisponible sur ce navigateur'); return; }
    var rec;
    try { rec = new Ctor(); } catch (_) { toast('Dictée indisponible sur ce navigateur'); return; }
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
      if (e && e.error === 'not-allowed') toast('Micro refusé — autorisez-le dans le navigateur');
      else toast('Dictée interrompue — réessayez');
    };
    rec.onend = function () { active = null; setState(btn, ''); };
    try { rec.start(); } catch (_) { active = null; setState(btn, ''); }
  }

  /* ── Chemin principal : enregistrer puis transcrire chez Whisper ───── */
  function startRecording(ctx, btn) {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var mime = pickMime();
      var recorder;
      try { recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
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
      toast('Micro refusé — autorisez-le dans le navigateur');
    });
  }

  function transcribe(ctx, btn, blob) {
    setState(btn, 'busy');
    var reader = new FileReader();
    reader.onload = function () {
      var b64 = String(reader.result || '').split(',')[1] || '';
      if (!b64) { setState(btn, ''); toast('Dictée interrompue — réessayez'); return; }
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
        var code = (r.j && r.j.error) || r.res.status;
        /* L'endpoint nomme sa panne ; on choisit le secours en connaissance
         * de cause plutôt que de réessayer un mur toute la journée. */
        if (code === 'unbound' || code === 'quota') {
          preferBrowser = true;
          toast(speechCtor() ? 'Transcription Kiwi indisponible — le micro passe par le navigateur, réessayez' : 'Transcription indisponible pour le moment');
        } else if (code === 'auth') {
          toast('Session expirée — reconnectez-vous');
        } else {
          toast('Transcription en échec — réessayez');
        }
      }).catch(function () {
        setState(btn, '');
        toast('Hors ligne — la dictée a besoin du réseau');
      });
    };
    reader.onerror = function () { setState(btn, ''); toast('Dictée interrompue — réessayez'); };
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
    if (preferBrowser || !canRecord()) { browserDictate(ctx, btn); return; }
    startRecording(ctx, btn);
  }

  /* ── Pose du bouton ────────────────────────────────────────────────── */
  function makeButton(ctx) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kv-mic';
    btn.setAttribute('aria-label', 'Dicter votre question');
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
      '.kv-mic{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;flex:0 0 auto;' +
      'border:0;border-radius:999px;background:transparent;color:inherit;opacity:.62;cursor:pointer;padding:0;}' +
      '.kv-mic:hover{opacity:1;}' +
      '.kv-mic.rec{opacity:1;color:#e5484d;animation:kv-mic-pulse 1.1s ease-in-out infinite;}' +
      '.kv-mic.busy{opacity:.5;animation:kv-mic-spin 1s linear infinite;cursor:progress;}' +
      '@keyframes kv-mic-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}' +
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
