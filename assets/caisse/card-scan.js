/* La carte fidélité, lue à la caméra de la caisse.
 *
 * La carte Kiwi du client (Apple Wallet, Google Wallet ou la carte web /carte)
 * porte un QR « KIWI-C:<fiche> ». Une douchette le lisait déjà
 * (assets/wallet-till.js) ; une caisse sur iPad n'en a pas. Ici la caméra de
 * l'appareil fait la douchette : le QR lu passe par le même KiwiWalletTill.take,
 * qui pose le client sur la note ouverte, exactement comme au carnet.
 *
 * L'écran a deux moitiés, parce qu'au comptoir il y a deux clients :
 *   · celui qui a sa carte : il la montre, la caméra la lit, la note est à lui ;
 *   · celui qui n'en a pas encore : il scanne le QR du magasin affiché à côté
 *     (/carte/<magasin>, la page d'inscription), et sa carte arrive dans son
 *     téléphone pendant que la commande se prépare.
 *
 * Décodeur : BarcodeDetector quand le navigateur l'a, sinon le décodeur ZXing
 * déjà embarqué pour la caisse boutique (registre paresseux de la caisse).
 * Caméra : frontale sur tablette (l'écran regarde le caissier, le client tend
 * son téléphone devant), arrière sur téléphone ; le choix se garde.
 * Ouvert par la ligne « Client & fidélité » de la note 2027 (till-frame.js). */
(function () {
  'use strict';
  var tr = function (s) { try { return window.KiwiCaisseLang ? window.KiwiCaisseLang.tr(s) : s; } catch (_) { return s; } };
  var FACING_KEY = 'kiwiCardScanFacing';
  var veil = null, video = null, stream = null, raf = 0, reader = null, controls = null, busy = false, gen = 0, said = 0, watch = 0;

  function css() {
    if (document.getElementById('kw-cs-style')) return;
    var st = document.createElement('style'); st.id = 'kw-cs-style';
    st.textContent =
      '.kw-cs{position:fixed;inset:0;z-index:9400;display:grid;place-items:center;padding:16px;background:rgba(5,20,14,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);font-family:"Inter Tight",system-ui,sans-serif}' +
      '.kw-cs-sheet{position:relative;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:16px;width:min(880px,100%);max-height:100%;padding:16px;border-radius:28px;background:var(--k-surface-1,#FBFAF6);color:var(--k-ink-1,#0A0F0D);box-shadow:0 30px 80px -30px rgba(0,0,0,.6)}' +
      '.kw-cs-cam{position:relative;aspect-ratio:4/3;border-radius:20px;overflow:hidden;background:#0A0F0D}' +
      '.kw-cs-cam video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.kw-cs-cam.is-user video{transform:scaleX(-1)}' +
      '.kw-cs-frame{position:absolute;inset:18%;pointer-events:none}' +
      '.kw-cs-frame i{position:absolute;width:44px;height:44px;border:4px solid #F7F5F0;transition:border-color .2s}' +
      '.kw-cs-frame i:nth-child(1){top:0;left:0;border-right:0;border-bottom:0;border-top-left-radius:18px}.kw-cs-frame i:nth-child(2){top:0;right:0;border-left:0;border-bottom:0;border-top-right-radius:18px}' +
      '.kw-cs-frame i:nth-child(3){bottom:0;left:0;border-right:0;border-top:0;border-bottom-left-radius:18px}.kw-cs-frame i:nth-child(4){bottom:0;right:0;border-left:0;border-top:0;border-bottom-right-radius:18px}' +
      '@media (prefers-reduced-motion:no-preference){.kw-cs-frame{animation:kw-cs-breathe 2.4s ease-in-out infinite}}' +
      '@keyframes kw-cs-breathe{50%{transform:scale(.965)}}' +
      '.kw-cs-cam.is-hit .kw-cs-frame i{border-color:var(--mint,#7DF2B0)}.kw-cs-cam.is-hit::after{content:"";position:absolute;inset:0;background:rgba(125,242,176,.22)}' +
      '.kw-cs-st{position:absolute;left:12px;right:12px;bottom:12px;padding:10px 14px;border-radius:14px;background:rgba(10,15,13,.62);color:#F7F5F0;font-size:14px;font-weight:600;line-height:1.3;text-align:center}' +
      '.kw-cs-st:empty{display:none}' +
      '.kw-cs-main h2{margin:6px 4px 2px;font-size:22px;font-weight:600;letter-spacing:-.01em}.kw-cs-main p{margin:0 4px;color:var(--k-ink-2,#5B635F);font-size:14px;line-height:1.4}' +
      '.kw-cs-side{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px 16px;border-radius:20px;background:var(--riad,#053B2C);color:#F7F5F0;text-align:center}' +
      '.kw-cs-side b{font-size:18px;font-weight:600}.kw-cs-side p{margin:0;font-size:14px;line-height:1.4;color:rgba(247,245,240,.78)}' +
      '.kw-cs-qr{width:min(220px,100%);padding:12px;border-radius:16px;background:#FFFFFF}.kw-cs-qr svg{display:block;width:100%;height:auto}' +
      '.kw-cs-tools{position:absolute;top:10px;right:10px;display:flex;gap:8px}' +
      '.kw-cs-btn{width:44px;height:44px;border:0;border-radius:14px;display:grid;place-items:center;background:rgba(10,15,13,.55);color:#F7F5F0;cursor:pointer}' +
      '.kw-cs-btn span{width:22px;height:22px;background:currentColor;-webkit-mask:var(--i) center/contain no-repeat;mask:var(--i) center/contain no-repeat}' +
      '.kw-cs-x{position:absolute;top:-6px;inset-inline-end:-6px;background:var(--k-surface-1,#FBFAF6);color:var(--k-ink-1,#0A0F0D);box-shadow:0 4px 14px -6px rgba(0,0,0,.4)}' +
      '@media (max-width:700px){.kw-cs{padding:0;place-items:end stretch}.kw-cs-sheet{grid-template-columns:1fr;border-radius:28px 28px 0 0;padding:14px 14px calc(14px + env(safe-area-inset-bottom,0px));overflow:auto}' +
        '.kw-cs-tools{right:auto;left:10px}.kw-cs-side{flex-direction:row;text-align:start;padding:12px}.kw-cs-qr{flex:none;width:112px;padding:8px}.kw-cs-x{top:8px;inset-inline-end:8px}}';
    document.head.appendChild(st);
  }
  function icon(name) { var i = document.createElement('span'); i.style.setProperty('--i', 'url("/assets/icons/material/' + name + '.svg")'); i.setAttribute('aria-hidden', 'true'); return i; }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function status(text) { var s = veil && veil.querySelector('.kw-cs-st'); if (s) s.textContent = text || ''; }

  function facing() {
    var saved = '';
    try { saved = localStorage.getItem(FACING_KEY) || ''; } catch (_) {}
    if (saved === 'user' || saved === 'environment') return saved;
    return Math.min(window.innerWidth, window.innerHeight) >= 600 ? 'user' : 'environment';
  }

  /* Le registre de la caisse donne l'adresse estampillée du décodeur. */
  var decoderLoad = null;
  function loadDecoder() {
    if (window.ZXingBrowser && window.ZXingBrowser.BrowserQRCodeReader) return Promise.resolve(true);
    if (decoderLoad) return decoderLoad;
    var link = document.querySelector('[data-caisse-lazy="qr-decoder"]');
    if (!link) return Promise.resolve(false);
    decoderLoad = new Promise(function (ok) {
      var s = document.createElement('script'); s.src = link.getAttribute('href');
      s.onload = function () { ok(!!(window.ZXingBrowser && window.ZXingBrowser.BrowserQRCodeReader)); };
      s.onerror = function () { decoderLoad = null; ok(false); };
      document.head.appendChild(s);
    });
    return decoderLoad;
  }

  function hit(text) {
    if (busy || !veil) return;
    var W = window.KiwiWalletTill;
    if (!W || !W.looksLikeCard || !W.looksLikeCard(text)) {
      var now = Date.now();
      if (now - said > 1500) { said = now; status(tr('Ce code n’est pas une carte Kiwi')); setTimeout(function () { if (veil && Date.now() - said >= 1400) status(''); }, 1600); }
      return;
    }
    busy = true;
    var cam = veil.querySelector('.kw-cs-cam'); if (cam) cam.classList.add('is-hit');
    setTimeout(function () { close(); W.take(text); }, 260);
  }

  function stopCamera() {
    gen++;
    cancelAnimationFrame(raf); raf = 0;
    try { if (controls) controls.stop(); } catch (_) {}
    controls = null; reader = null;
    try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {}
    stream = null;
    if (video) { try { video.srcObject = null; } catch (_) {} }
  }

  function startCamera() {
    stopCamera();
    var mine = gen, want = facing();
    var cam = veil.querySelector('.kw-cs-cam');
    cam.classList.toggle('is-user', want === 'user');
    status(tr('Caméra en préparation…'));
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { status(tr('Pas de caméra sur cet appareil.')); return; }
    var constraints = { audio: false, video: { facingMode: { ideal: want }, width: { ideal: 1280 }, height: { ideal: 720 } } };
    var native = typeof window.BarcodeDetector === 'function';
    var go = native
      ? navigator.mediaDevices.getUserMedia(constraints).then(function (s) {
          if (mine !== gen) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
          stream = s; video.srcObject = s; return video.play().catch(function () {}).then(function () {
            var det = new window.BarcodeDetector({ formats: ['qr_code'] }), last = 0;
            var tick = function (ts) {
              if (mine !== gen) return;
              if (ts - last > 120 && video.readyState >= 2) {
                last = ts;
                det.detect(video).then(function (r) { if (mine === gen && r && r[0] && r[0].rawValue) hit(r[0].rawValue); }, function () {});
              }
              raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
          });
        })
      : loadDecoder().then(function (ok) {
          if (mine !== gen) return;
          if (!ok) { var e = new Error('decoder'); e.name = 'DecoderUnavailable'; throw e; }
          reader = new window.ZXingBrowser.BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 150, delayBetweenScanSuccess: 900 });
          return reader.decodeFromConstraints(constraints, video, function (result) {
            if (mine !== gen || !result) return;
            var v = typeof result.getText === 'function' ? result.getText() : result.text;
            if (v) hit(v);
          }).then(function (c) { if (mine !== gen) { try { c.stop(); } catch (_) {} return; } controls = c; stream = video.srcObject || null; });
        });
    go.then(function () { if (mine === gen) status(''); }, function (err) {
      if (mine !== gen) return;
      var n = err && err.name;
      status(n === 'NotAllowedError' || n === 'SecurityError' ? tr('Autorisez la caméra dans les réglages de l’appareil.')
        : n === 'NotFoundError' || n === 'OverconstrainedError' ? tr('Pas de caméra sur cet appareil.')
        : tr('Vérifiez la connexion puis réessayez.'));
    });
  }

  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }

  function current() { try { var S = window.KiwiCaisseSaleClient; return (S && S.current && S.current()) || null; } catch (_) { return null; } }
  function close() {
    clearInterval(watch); watch = 0;
    stopCamera();
    document.removeEventListener('keydown', onKey, true);
    if (veil) veil.remove();
    veil = null; video = null; busy = false;
  }

  function open() {
    if (veil) return;
    var W = window.KiwiWalletTill;
    if (!W) return;
    css();
    busy = false;
    veil = el('div', 'kw-cs');
    var sheet = el('div', 'kw-cs-sheet'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
    var main = el('div', 'kw-cs-main');
    var cam = el('div', 'kw-cs-cam');
    video = document.createElement('video'); video.muted = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.setAttribute('aria-hidden', 'true');
    var frame = el('div', 'kw-cs-frame'); for (var i = 0; i < 4; i++) frame.appendChild(document.createElement('i'));
    var st = el('div', 'kw-cs-st'); st.setAttribute('role', 'status');
    var tools = el('div', 'kw-cs-tools');
    var flip = el('button', 'kw-cs-btn'); flip.type = 'button'; flip.setAttribute('aria-label', tr('Changer de caméra')); flip.title = tr('Changer de caméra'); flip.appendChild(icon('flip_camera_ios'));
    flip.onclick = function () {
      var next = facing() === 'user' ? 'environment' : 'user';
      try { localStorage.setItem(FACING_KEY, next); } catch (_) {}
      startCamera();
    };
    tools.appendChild(flip);
    [video, frame, st, tools].forEach(function (n) { cam.appendChild(n); });
    var h = el('h2', '', tr('Scannez la carte du client'));
    var p = el('p', '', tr('Le QR de sa carte Kiwi, dans Wallet ou sur son téléphone.'));
    [cam, h, p].forEach(function (n) { main.appendChild(n); });

    var side = el('div', 'kw-cs-side');
    var qr = el('div', 'kw-cs-qr'); qr.hidden = true;
    var words = el('div');
    words.appendChild(el('b', '', tr('Pas encore de carte ?')));
    words.appendChild(el('p', '', tr('Il scanne ce code avec son téléphone : sa carte arrive en quelques secondes.')));
    side.appendChild(qr); side.appendChild(words);
    var url = W.enrollUrl ? W.enrollUrl() : '';
    if (url && W.loadQr) W.loadQr().then(function () {
      if (!veil || !window.KiwiQR) return;
      qr.innerHTML = window.KiwiQR.svg(url, { size: 196, margin: 2, ecl: 'M', dark: '#0A0F0D', light: '#FFFFFF' });
      qr.hidden = false;
    }, function () {});

    var x = el('button', 'kw-cs-btn kw-cs-x'); x.type = 'button'; x.setAttribute('aria-label', tr('Fermer')); x.appendChild(icon('close'));
    x.onclick = close;
    [main, side, x].forEach(function (n) { sheet.appendChild(n); });
    veil.appendChild(sheet);
    veil.addEventListener('click', function (e) { if (e.target === veil) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(veil);
    startCamera();
    /* A USB scanner read the card meanwhile (wallet-till.js): the note has its customer, the screen goes. */
    var before = current();
    watch = setInterval(function () { var now = current(); if (now && now !== before) close(); }, 400);
    setTimeout(function () { try { x.focus({ preventScroll: true }); } catch (_) {} }, 0);
  }

  window.KiwiCardScan = { open: open, close: close, _hit: hit };
})();
