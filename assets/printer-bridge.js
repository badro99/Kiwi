/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · PRINTER BRIDGE CLIENT — window.KiwiPrinter
 * ---------------------------------------------------------------------------
 * The web half of real thermal printing. Detects the Kiwi Printer Bridge running
 * on the counter machine (bridge/server.js), lets the owner pair a printer
 * (IP · port · model · paper width · test slip), and relays ESC/POS jobs built by
 * assets/escpos.js to it. If the bridge isn't running, every print call returns
 * { ok:false, reason:'bridge-*' } so callers fail soft (KiwiHardware falls back
 * to its on-screen preview) — the exact pattern the caisse pairing uses.
 *
 * Config (localStorage `kiwiPrinterCfg`): { ip, port, model, paper }.
 * Bridge URL: http://127.0.0.1:9110 (loopback; a secure context, so an HTTPS page
 * may call it). Vanilla, no deps, no innerHTML for dynamic values.
 *
 * API
 *   KiwiPrinter.getConfig() / setConfig(cfg)
 *   KiwiPrinter.isConfigured()               → has an IP
 *   KiwiPrinter.ping()                        → Promise<{ok,version}|null>
 *   KiwiPrinter.printReceipt(o) / printKitchen(o) / printLabels(labels)
 *                                             → Promise<{ok, reason?}>
 *   KiwiPrinter.openSetup()                   → the pairing modal
 *   [data-action="printer-connect"]           → opens the modal (delegated)
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var BRIDGE_URL = 'http://127.0.0.1:9110';
  var BRIDGE_DOWNLOAD = 'https://github.com/badro99/Kiwi/releases/latest';
  var CFG_KEY = 'kiwiPrinterCfg';
  // Thermal-printer brands common with Moroccan merchants. All are ESC/POS-
  // compatible, so they share the generic encoder — the choice is for the owner's
  // confidence (and future per-brand tuning). "Générique" stays the safe default.
  var MODELS = [
    { id: 'escpos', label: 'Générique (ESC/POS)' },
    { id: 'epson', label: 'Epson' },
    { id: 'xprinter', label: 'Xprinter' },
    { id: 'sunmi', label: 'Sunmi' },
    { id: 'rongta', label: 'Rongta' },
    { id: 'bixolon', label: 'Bixolon' },
    { id: 'hprt', label: 'HPRT' },
    { id: 'citizen', label: 'Citizen' },
    { id: 'star', label: 'Star' },
  ];

  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  function getConfig() {
    var d = { ip: '', port: 9100, model: 'escpos', paper: '80' };
    try { var o = JSON.parse(ls(CFG_KEY) || '{}') || {}; return Object.assign(d, o); } catch (_) { return d; }
  }
  function setConfig(cfg) { set(CFG_KEY, JSON.stringify(Object.assign(getConfig(), cfg || {}))); }
  function isConfigured() { return !!getConfig().ip; }

  // ── bridge transport ───────────────────────────────────────────────────────
  function withTimeout(promise, ms) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, ms);
    return { signal: ctrl.signal, done: function () { clearTimeout(t); } };
  }

  function ping() {
    var to = withTimeout(null, 1400);
    return fetch(BRIDGE_URL + '/kiwi/ping', { signal: to.signal, cache: 'no-store' })
      .then(function (r) { to.done(); return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.ok) ? j : null; })
      .catch(function () { to.done(); return null; });
  }

  // ── transport A: Web Bluetooth (preferred — appless, no IP) ──────────────────
  // Cheap ESC/POS BLE printers expose varied GATT services, so we request broadly
  // and discover a writable characteristic after connecting. The browser shows its
  // own device picker (needs a user gesture). Chrome / Android / desktop Chrome —
  // not iOS Safari (feature-detected via navigator.bluetooth).
  var bt = { device: null, chr: null, name: '' };
  function btConnected() { return !!(bt.chr && bt.device && bt.device.gatt && bt.device.gatt.connected); }

  function connectBluetooth() {
    if (!navigator.bluetooth) return Promise.reject(new Error('no-web-bluetooth'));
    var SERVICES = [0x18F0, 0xFF00, 0xFFE0,
      '000018f0-0000-1000-8000-00805f9b34fb', '0000ff00-0000-1000-8000-00805f9b34fb',
      '0000ffe0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455',
      '6e400001-b5a3-f393-e0a9-e50e24dcca9e'];
    return navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES })
      .then(function (device) {
        bt.device = device; bt.name = device.name || 'Imprimante';
        device.addEventListener('gattserverdisconnected', function () { bt.chr = null; });
        return device.gatt.connect();
      })
      .then(function (server) { return server.getPrimaryServices(); })
      .then(function (services) {
        var chain = Promise.resolve(null);
        services.forEach(function (svc) {
          chain = chain.then(function (found) {
            if (found) return found;
            return svc.getCharacteristics().then(function (chars) {
              for (var i = 0; i < chars.length; i++) {
                var p = chars[i].properties;
                if (p.write || p.writeWithoutResponse) return chars[i];
              }
              return null;
            }, function () { return null; });
          });
        });
        return chain;
      })
      .then(function (chr) {
        if (!chr) throw new Error('no-writable-characteristic');
        bt.chr = chr;
        return { ok: true, name: bt.name };
      });
  }

  function disconnectBluetooth() {
    try { if (bt.device && bt.device.gatt && bt.device.gatt.connected) bt.device.gatt.disconnect(); } catch (_) {}
    bt.chr = null;
  }

  // BLE writes must be chunked under the negotiated MTU; 180 B is safe on cheap printers.
  function btWrite(bytes) {
    if (!btConnected()) return Promise.reject(new Error('bt-not-connected'));
    var chr = bt.chr, CH = 180, woResp = !!chr.properties.writeWithoutResponse, i = 0;
    function step() {
      if (i >= bytes.length) return Promise.resolve();
      var chunk = bytes.slice(i, i + CH); i += CH;
      var p = woResp ? chr.writeValueWithoutResponse(chunk) : chr.writeValueWithResponse(chunk);
      return p.then(function () { return new Promise(function (r) { setTimeout(r, 16); }); }).then(step);
    }
    return step();
  }

  // ── transport B: the network bridge (loopback helper → TCP printer) ──────────
  function bridgePrintBytes(bytes) {
    var cfg = getConfig();
    if (!cfg.ip) return Promise.resolve({ ok: false, reason: 'not-configured' });
    var to = withTimeout(null, 9000);
    return fetch(BRIDGE_URL + '/kiwi/print', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: to.signal,
      body: JSON.stringify({ printerIp: cfg.ip, port: Number(cfg.port) || 9100, dataB64: window.KiwiEscPos.toB64(bytes) }),
    }).then(function (r) {
      to.done();
      return r.json().then(function (j) { return (r.ok && j && j.ok) ? { ok: true, via: 'bridge', bytes: j.bytes } : { ok: false, reason: (j && j.error) || 'print-failed' }; },
        function () { return { ok: false, reason: 'bad-response' }; });
    }).catch(function () { to.done(); return { ok: false, reason: 'bridge-unreachable' }; });
  }

  // Route ESC/POS bytes to whichever printer is connected: Bluetooth first, else
  // the network bridge. Callers fail soft when this resolves { ok:false }.
  function printBytes(bytes) {
    if (!window.KiwiEscPos) return Promise.resolve({ ok: false, reason: 'no-encoder' });
    if (btConnected()) {
      return btWrite(bytes).then(function () { return { ok: true, via: 'bluetooth', bytes: bytes.length }; },
        function (e) { return { ok: false, reason: 'bt-' + ((e && e.message) || 'write-failed') }; });
    }
    return bridgePrintBytes(bytes);
  }

  // A printer is "connected" if Bluetooth is live OR the network bridge is set up.
  function isConnected() { return btConnected() || isConfigured(); }

  function printReceipt(o) { return window.KiwiEscPos ? printBytes(window.KiwiEscPos.receipt(withPaper(o))) : Promise.resolve({ ok: false, reason: 'no-encoder' }); }
  function printKitchen(o) { return window.KiwiEscPos ? printBytes(window.KiwiEscPos.kitchenTicket(withPaper(o))) : Promise.resolve({ ok: false, reason: 'no-encoder' }); }
  function printLabels(labels) {
    if (!window.KiwiEscPos) return Promise.resolve({ ok: false, reason: 'no-encoder' });
    var list = (Array.isArray(labels) ? labels : [labels]).filter(Boolean);
    var paper = getConfig().paper;
    // Concatenate each label's bytes into one job.
    var chunks = list.map(function (l) { return window.KiwiEscPos.label(Object.assign({ paper: paper }, l)); });
    var total = chunks.reduce(function (n, c) { return n + c.length; }, 0);
    var all = new Uint8Array(total); var off = 0;
    chunks.forEach(function (c) { all.set(c, off); off += c.length; });
    return printBytes(all);
  }
  function withPaper(o) { o = o || {}; if (!o.paper) o.paper = getConfig().paper; return o; }

  // ── the pairing modal ───────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById('kpr-style')) return;
    var s = document.createElement('style'); s.id = 'kpr-style';
    s.textContent =
      '#kpr-ov{position:fixed;inset:0;z-index:9998;display:grid;place-items:center;background:rgba(10,15,13,.5);padding:20px;}' +
      '#kpr-card{background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D);width:460px;max-width:94vw;max-height:92vh;overflow:auto;border-radius:18px;padding:24px;box-shadow:0 30px 70px -24px rgba(5,59,44,.5);}' +
      '#kpr-card h2{font-size:1.16rem;letter-spacing:-.01em;margin:0 0 4px;display:flex;align-items:center;gap:8px;}' +
      '.kpr-sub{margin:0 0 16px;color:var(--ink,#0A0F0D);opacity:.65;font-size:.9rem;line-height:1.5;}' +
      '.kpr-status{display:flex;align-items:flex-start;gap:11px;padding:13px 15px;border-radius:12px;margin:0 0 18px;font-size:.88rem;line-height:1.45;}' +
      '.kpr-status .kpr-d{width:9px;height:9px;border-radius:50%;flex:none;margin-top:5px;}' +
      '.kpr-status.off{background:#fbeceb;border:1px solid #f2cdc8;color:#8f2c1e;}' +
      '.kpr-status.off .kpr-d{background:#c0392b;box-shadow:0 0 0 4px rgba(192,57,43,.14);}' +
      '.kpr-status.on{background:#e7f6ee;border:1px solid #bfe6cf;color:#0B6E4F;}' +
      '.kpr-status.on .kpr-d{background:var(--atlas,#0B6E4F);box-shadow:0 0 0 4px rgba(11,110,79,.16);}' +
      '.kpr-status a{color:inherit;font-weight:700;text-underline-offset:3px;}' +
      '.kpr-status button.kpr-recheck{background:none;border:0;color:inherit;font:inherit;font-weight:700;cursor:pointer;text-decoration:underline;text-underline-offset:3px;padding:0;margin-left:2px;}' +
      '.kpr-field{margin:0 0 13px;}' +
      '.kpr-field label{display:block;font-size:.72rem;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--riad,#053B2C);margin:0 0 6px;}' +
      '.kpr-field input,.kpr-field select{width:100%;font:inherit;padding:11px 13px;border:1.5px solid rgba(0,0,0,.12);border-radius:11px;background:#fff;color:var(--ink,#0A0F0D);}' +
      '.kpr-field input:focus,.kpr-field select:focus{outline:none;border-color:var(--atlas,#0B6E4F);box-shadow:0 0 0 4px rgba(11,110,79,.13);}' +
      '.kpr-two{display:flex;gap:12px;}.kpr-two>*{flex:1;}' +
      '.kpr-actions{display:flex;gap:10px;margin-top:20px;}' +
      '.kpr-btn{flex:1;font:inherit;font-weight:700;padding:13px;border-radius:12px;cursor:pointer;border:0;}' +
      '.kpr-test{background:#fff;border:1.5px solid var(--atlas,#0B6E4F);color:var(--atlas,#0B6E4F);}' +
      '.kpr-test:disabled{opacity:.45;cursor:default;}' +
      '.kpr-save{background:var(--atlas,#0B6E4F);color:#fff;}' +
      '.kpr-save:hover{filter:brightness(1.06);}' +
      '.kpr-browser{width:100%;margin-top:10px;background:none;border:1.5px solid rgba(0,0,0,.14);color:var(--ink,#0A0F0D);opacity:.85;}' +
      '.kpr-browser:hover{opacity:1;border-color:rgba(0,0,0,.28);}' +
      '.kpr-quick{display:flex;gap:10px;margin:0 0 16px;}' +
      '.kpr-quick .kpr-btn{flex:1;width:auto;margin:0;}' +
      '.kpr-quick .kpr-browser{background:var(--atlas,#0B6E4F);color:#fff;border:0;opacity:1;}' +
      '.kpr-quick .kpr-browser:hover{filter:brightness(1.06);border:0;}' +
      '.kpr-quick .kpr-pdf{background:#fff;border:1.5px solid var(--atlas,#0B6E4F);color:var(--atlas,#0B6E4F);}' +
      '.kpr-bt{border:1.5px solid rgba(11,110,79,.25);border-radius:14px;padding:15px 16px;margin:0 0 14px;background:rgba(11,110,79,.045);}' +
      '.kpr-bt h3{margin:0 0 3px;font-size:1rem;}' +
      '.kpr-bt>p{margin:0 0 12px;font-size:.82rem;opacity:.7;line-height:1.45;}' +
      '.kpr-btc{width:100%;font:inherit;font-weight:700;padding:13px;border-radius:12px;cursor:pointer;border:0;background:var(--atlas,#0B6E4F);color:#fff;}' +
      '.kpr-btc:hover{filter:brightness(1.06);}.kpr-btc:disabled{opacity:.5;cursor:default;}' +
      '.kpr-adv{margin-top:8px;border-top:1px solid rgba(0,0,0,.08);padding-top:12px;}' +
      '.kpr-adv>summary{cursor:pointer;font-size:.84rem;font-weight:700;color:var(--riad,#053B2C);opacity:.82;}' +
      '.kpr-adv[open]>summary{margin-bottom:14px;}' +
      '.kpr-x{float:right;background:none;border:0;font-size:1.3rem;line-height:1;cursor:pointer;color:var(--ink,#0A0F0D);opacity:.5;}' +
      '.kpr-note{margin:14px 0 0;font-size:.78rem;opacity:.6;line-height:1.5;}';
    document.head.appendChild(s);
  }

  // context (optional): { onBrowserPrint } — when the modal is opened from a print
  // attempt on a machine with no bridge, we surface a "print via browser/PDF"
  // escape so a label still comes out without the Kiwi Printer Bridge.
  function openSetup(context) {
    context = context || {};
    injectCss();
    var cfg = getConfig();
    var ov = document.createElement('div'); ov.id = 'kpr-ov';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Connecter une imprimante');
    var opts = MODELS.map(function (m) { return '<option value="' + m.id + '"' + (m.id === cfg.model ? ' selected' : '') + '>' + esc(m.label) + '</option>'; }).join('');
    var btLive = btConnected();
    var fromPrint = !!(context.onBrowserPrint || context.onSavePdf);
    ov.innerHTML =
      '<div id="kpr-card">' +
        '<button class="kpr-x" type="button" id="kpr-close" aria-label="Fermer">×</button>' +
        '<h2>' + (fromPrint ? 'Imprimer l’étiquette' : 'Connecter une imprimante') + '</h2>' +
        '<p class="kpr-sub">' + (fromPrint
          ? 'Imprimez tout de suite, ou connectez une imprimante (Bluetooth ou réseau) pour imprimer directement la prochaine fois.'
          : 'Le plus simple : une imprimante déjà installée s’imprime directement via « Imprimer ». Pour imprimer sans boîte de dialogue, connectez une imprimante Bluetooth.') + '</p>' +
        (fromPrint ? '<div class="kpr-quick">' +
          (context.onBrowserPrint ? '<button class="kpr-btn kpr-browser" type="button" id="kpr-browser">Imprimer</button>' : '') +
          (context.onSavePdf ? '<button class="kpr-btn kpr-pdf" type="button" id="kpr-savepdf">Enregistrer en PDF</button>' : '') +
        '</div>' : '') +
        '<div class="kpr-bt">' +
          '<h3>Imprimante Bluetooth</h3>' +
          '<p>Sans installation. Kiwi imprime le reçu directement.</p>' +
          '<div class="kpr-status ' + (btLive ? 'on' : 'off') + '" id="kpr-bt-status"><span class="kpr-d"></span><span id="kpr-bt-status-t">' + (btLive ? esc('Connectée · ' + bt.name) : 'Aucune imprimante connectée.') + '</span></div>' +
          '<button class="kpr-btc" type="button" id="kpr-bt-connect">' + (btLive ? 'Changer d’imprimante' : 'Rechercher une imprimante Bluetooth') + '</button>' +
          '<div class="kpr-actions"><button class="kpr-btn kpr-test" type="button" id="kpr-bt-test"' + (btLive ? '' : ' disabled') + '>Imprimer un ticket test</button></div>' +
        '</div>' +
        '<details class="kpr-adv"' + (cfg.ip ? ' open' : '') + '>' +
          '<summary>Option avancée · imprimante réseau (Wi-Fi / Ethernet)</summary>' +
          '<div class="kpr-status off" id="kpr-status"><span class="kpr-d"></span><span id="kpr-status-t">Vérification du pont…</span></div>' +
          '<div class="kpr-field"><label for="kpr-ip">Adresse IP de l’imprimante</label><input id="kpr-ip" type="text" inputmode="decimal" placeholder="192.168.1.50" value="' + esc(cfg.ip) + '"></div>' +
          '<div class="kpr-two">' +
            '<div class="kpr-field"><label for="kpr-port">Port</label><input id="kpr-port" type="text" inputmode="numeric" value="' + esc(cfg.port) + '"></div>' +
            '<div class="kpr-field"><label for="kpr-paper">Largeur papier</label><select id="kpr-paper"><option value="80"' + (cfg.paper === '80' ? ' selected' : '') + '>80 mm (standard)</option><option value="58"' + (cfg.paper === '58' ? ' selected' : '') + '>58 mm</option></select></div>' +
          '</div>' +
          '<div class="kpr-field"><label for="kpr-model">Modèle</label><select id="kpr-model">' + opts + '</select></div>' +
          '<div class="kpr-actions">' +
            '<button class="kpr-btn kpr-test" type="button" id="kpr-test" disabled>Imprimer un ticket test</button>' +
            '<button class="kpr-btn kpr-save" type="button" id="kpr-save">Enregistrer</button>' +
          '</div>' +
          '<p class="kpr-note">Le pont tourne sur l’ordinateur de la caisse et ne communique qu’avec votre imprimante locale. <a href="' + esc(BRIDGE_DOWNLOAD) + '" target="_blank" rel="noopener">Télécharger le pont</a></p>' +
        '</details>' +
      '</div>';
    document.body.appendChild(ov);

    var $ = function (id) { return ov.querySelector(id); };
    function readForm() {
      return { ip: $('#kpr-ip').value.trim(), port: $('#kpr-port').value.trim() || '9100', model: $('#kpr-model').value, paper: $('#kpr-paper').value };
    }
    function close() { ov.remove(); }
    function toast(msg) { try { if (window.Kiwi && Kiwi.toast) Kiwi.toast(msg); } catch (_) {} }

    var bridgeUp = false;
    function refreshStatus() {
      var st = $('#kpr-status'), t = $('#kpr-status-t'), test = $('#kpr-test');
      t.textContent = 'Vérification du pont…'; st.className = 'kpr-status off';
      return ping().then(function (j) {
        bridgeUp = !!j;
        if (j) {
          st.className = 'kpr-status on';
          t.textContent = 'Pont connecté · v' + (j.version || '?');
          test.disabled = false;
        } else {
          st.className = 'kpr-status off';
          // Rebuild with download + re-check affordances.
          t.innerHTML = 'Kiwi Printer Bridge non détecté. <a href="' + esc(BRIDGE_DOWNLOAD) + '" target="_blank" rel="noopener">Télécharger le pont</a> · <button type="button" class="kpr-recheck" id="kpr-recheck">Revérifier</button>';
          var rc = $('#kpr-recheck'); if (rc) rc.addEventListener('click', refreshStatus);
          test.disabled = true;
        }
      });
    }

    $('#kpr-close').addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    $('#kpr-save').addEventListener('click', function () { setConfig(readForm()); toast('Imprimante enregistrée'); close(); });
    if (context.onBrowserPrint) {
      var bp = $('#kpr-browser');
      if (bp) bp.addEventListener('click', function () { close(); try { context.onBrowserPrint(); } catch (_) {} });
    }
    if (context.onSavePdf) {
      var sp = $('#kpr-savepdf');
      if (sp) sp.addEventListener('click', function () { close(); try { context.onSavePdf(); } catch (_) {} });
    }

    // ── Bluetooth: connect + test ──
    $('#kpr-bt-connect').addEventListener('click', function () {
      var st = $('#kpr-bt-status'), t = $('#kpr-bt-status-t'), btn = this;
      if (!navigator.bluetooth) { st.className = 'kpr-status off'; t.textContent = 'Bluetooth indisponible sur ce navigateur. Utilisez Chrome (ordinateur ou Android).'; return; }
      btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Recherche…';
      connectBluetooth().then(function (r) {
        btn.disabled = false; btn.textContent = 'Changer d’imprimante';
        st.className = 'kpr-status on'; t.textContent = 'Connectée · ' + (r.name || 'Imprimante');
        $('#kpr-bt-test').disabled = false;
        toast('Imprimante Bluetooth connectée');
      }, function (e) {
        btn.disabled = false; btn.textContent = orig; st.className = 'kpr-status off';
        var m = (e && e.message) || '';
        if (/no-web-bluetooth/.test(m)) t.textContent = 'Bluetooth indisponible sur ce navigateur. Utilisez Chrome (ordinateur ou Android).';
        else if (/cancel|NotFound|User|chooser/i.test(m)) t.textContent = 'Aucune imprimante sélectionnée.';
        else if (/no-writable/.test(m)) t.textContent = 'Imprimante trouvée mais non compatible (aucun canal d’écriture).';
        else t.textContent = 'Connexion impossible : ' + m;
      });
    });
    $('#kpr-bt-test').addEventListener('click', function () {
      var btn = this; btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Impression…';
      printBytes(window.KiwiEscPos.testSlip({ paper: getConfig().paper })).then(function (res) {
        btn.textContent = orig; btn.disabled = !btConnected();
        toast(res.ok ? 'Ticket test envoyé' : ('Échec : ' + (res.reason || 'inconnu')));
      });
    });

    // ── Network bridge (advanced): test targets the bridge explicitly ──
    $('#kpr-test').addEventListener('click', function () {
      setConfig(readForm());
      var cfg2 = getConfig();
      var btn = this; btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Impression…';
      bridgePrintBytes(window.KiwiEscPos.testSlip({ ip: cfg2.ip, paper: cfg2.paper })).then(function (res) {
        btn.textContent = orig; btn.disabled = !bridgeUp;
        toast(res.ok ? 'Ticket test envoyé' : ('Échec : ' + (res.reason || 'inconnu')));
      });
    });

    refreshStatus();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-action="printer-connect"]');
    if (t) { e.preventDefault(); openSetup(); }
  });

  window.KiwiPrinter = {
    getConfig: getConfig, setConfig: setConfig, isConfigured: isConfigured, isConnected: isConnected,
    ping: ping, printBytes: printBytes,
    connectBluetooth: connectBluetooth, disconnectBluetooth: disconnectBluetooth, btConnected: btConnected,
    printReceipt: printReceipt, printKitchen: printKitchen, printLabels: printLabels,
    openSetup: openSetup, BRIDGE_URL: BRIDGE_URL,
  };
})();
