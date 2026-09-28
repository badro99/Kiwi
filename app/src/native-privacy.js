/* Native-only AI consent. Loaded synchronously before shared product scripts.
 * No request body is stored here. Consent lasts for this WebView session and
 * is reset on sign-out; every role shares the same explicit choice. */
(function () {
  'use strict';
  if (!window.Capacitor || typeof window.Capacitor.isNativePlatform !== 'function' || !window.Capacitor.isNativePlatform()) return;
  var KEY = 'kiwi:native:ai-consent:v1', pending = null, revision = 0;
  function choice() { try { return sessionStorage.getItem(KEY); } catch (_) { return null; } }
  function save(value) { try { sessionStorage.setItem(KEY, value); } catch (_) {} }
  function copy() {
    var lang = document.documentElement.lang.slice(0, 2);
    if (lang === 'ar') return {title:'خصوصية Kiwi AI', body:'عند استخدام ميزات الذكاء الاصطناعي، يرسل Kiwi رسائلك وبيانات النشاط المرتبطة بها، والصور والمستندات والتسجيلات الصوتية التي تختارها، إلى Cloudflare Workers AI لمعالجة طلبك. قد تتضمن هذه البيانات معلومات عن العملاء أو الموظفين. لا ترسل بيانات شخصية إلا إذا كان مسموحاً لك بمشاركتها. يمكنك استخدام الصندوق دون الذكاء الاصطناعي. يسري اختيارك على هذه الجلسة ويمكن تغييره من «المزيد».', allow:'السماح بالمعالجة', deny:'بدون ذكاء اصطناعي', policy:'سياسة الخصوصية'};
    if (lang === 'en') return {title:'Kiwi AI privacy', body:'When you use AI features, Kiwi sends your messages and relevant business context, plus the photos, documents and audio you select, to Cloudflare Workers AI to process your request. This may include customer or employee information. Only send personal data you are permitted to share. You can use the till without AI. Your choice applies to this session and can be changed in More.', allow:'Allow processing', deny:'Continue without AI', policy:'Privacy policy'};
    return {title:'Confidentialité Kiwi AI', body:'Lorsque vous utilisez les fonctions IA, Kiwi transmet vos messages et le contexte de votre activité, ainsi que les photos, documents et enregistrements choisis, à Cloudflare Workers AI pour traiter votre demande. Ces éléments peuvent contenir des informations sur vos clients ou employés. Ne transmettez que les données personnelles que vous êtes autorisé à partager. La caisse reste utilisable sans IA. Votre choix vaut pour cette session et peut être modifié dans Plus.', allow:'Autoriser le traitement', deny:'Continuer sans IA', policy:'Politique de confidentialité'};
  }
  function show() {
    if (pending) return pending;
    // Changing the choice immediately fences new requests while the sheet is open.
    save('denied');
    pending = new Promise(function (resolve) {
      function mount() {
        var words = copy(), previous = document.activeElement;
        var overlay = document.createElement('div');
        overlay.className = 'kiwi-native-account kiwi-native-privacy is-open';
        overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', words.title);
        overlay.innerHTML = '<div class="kiwi-native-account-card"><h2></h2><p></p><a href="https://kiwi-os.com/privacy.html" target="_blank" rel="noopener noreferrer"></a><div class="kiwi-native-account-actions"><button type="button" data-deny></button><button type="button" data-submit></button></div></div>';
        overlay.querySelector('h2').textContent = words.title;
        overlay.querySelector('p').textContent = words.body;
        overlay.querySelector('a').textContent = words.policy;
        var deny = overlay.querySelector('[data-deny]'), allow = overlay.querySelector('[data-submit]');
        deny.textContent = words.deny; allow.textContent = words.allow;
        function finish(accepted) {
          save(accepted ? 'allowed' : 'denied'); overlay.remove(); pending = null;
          if (previous && previous.isConnected && previous.focus) previous.focus();
          if (window.KiwiNativeHostRequestState) window.KiwiNativeHostRequestState();
          resolve(accepted);
        }
        deny.onclick = function () { finish(false); }; allow.onclick = function () { finish(true); };
        overlay.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') { event.preventDefault(); finish(false); }
          if (event.key === 'Tab') {
            var first = overlay.querySelector('a'), last = allow;
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          }
        });
        document.body.appendChild(overlay); deny.focus();
        if (window.KiwiNativeHostRequestState) window.KiwiNativeHostRequestState();
      }
      if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount, {once:true});
    });
    return pending;
  }
  function permission() {
    if (pending) return pending;
    var value = choice();
    return value ? Promise.resolve(value === 'allowed') : show();
  }
  function requestPath(input) {
    try { return new URL(input && input.url || String(input), location.href).pathname; }
    catch (_) { return ''; }
  }
  function aiURL(input) {
    var path = requestPath(input);
    // These two authenticated routes only save/read the document registry and
    // its stored media. Refusing AI must not prevent access to existing records.
    if (/^\/api\/ai\/(?:intake|intake-archive)\/?$/.test(path)) return false;
    return /^\/api\/ai(?:\/|$)/.test(path);
  }
  function reset() {
    revision++; save('denied');
    var decline = document.querySelector('.kiwi-native-privacy [data-deny]');
    if (decline) decline.click();
    try { sessionStorage.removeItem(KEY); } catch (_) {}
  }
  function denied() { return new DOMException('Kiwi AI processing was not allowed. Change your choice in More.', 'NotAllowedError'); }
  var transport = window.fetch;
  window.fetch = function (input, init) {
    if (/^\/auth\/(?:login|logout)(?:\/|$)/.test(requestPath(input))) reset();
    if (!aiURL(input)) return transport.call(window, input, init);
    var signal = init && init.signal || input && input.signal, started = revision;
    return permission().then(function (allowed) {
      if (signal && signal.aborted) throw new DOMException('Request aborted', 'AbortError');
      if (!allowed || started !== revision || choice() !== 'allowed') throw denied();
      return transport.call(window, input, init);
    });
  };
  // Current AI clients all use fetch. Fence XHR/beacon as well so a future
  // uploader cannot silently skip the disclosure; callers must request consent.
  var XHR = window.XMLHttpRequest;
  if (XHR) {
    var open = XHR.prototype.open, send = XHR.prototype.send;
    XHR.prototype.open = function (method, url) { this.__kiwiAI = aiURL(url); return open.apply(this, arguments); };
    XHR.prototype.send = function () { if (this.__kiwiAI && choice() !== 'allowed') throw denied(); return send.apply(this, arguments); };
  }
  if (navigator.sendBeacon) {
    var beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) { return aiURL(url) && choice() !== 'allowed' ? false : beacon(url, data); };
  }
  window.KiwiNativePrivacy = { show:show, request:permission, reset:reset };
})();
