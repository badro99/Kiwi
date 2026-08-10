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

  /* The bridge's own port. 9110 is the default, but on a Windows till it is not
   * guaranteed free — and the bridge exits when the port is taken, which on
   * Windows means a console flash the owner never sees, then "pont non détecté"
   * with no way forward. So the shop can start it on another port
   * (KIWI_BRIDGE_PORT, see the .cmd on /printer) and we FIND it instead of
   * insisting on 9110. The winning port is remembered so later loads go straight
   * to it and we never scan again. */
  var BRIDGE_PORTS = [9110, 9111, 9112, 9113, 9114];
  var PORT_KEY = 'kiwiBridgePort';
  var bridgePort = 0;
  function bridgeBase(p) { return 'http://127.0.0.1:' + (p || bridgePort || BRIDGE_PORTS[0]); }
  var BRIDGE_URL = bridgeBase();   // kept for compatibility; prefer bridgeBase()
  var BRIDGE_DOWNLOAD = '/printer';
  var CFG_KEY = 'kiwiPrinterCfg';

  /* Roll widths come from the encoder (window.KiwiEscPos.paperWidths) so the list
   * the owner picks from and the list the encoder can actually lay out stay the
   * same list. escpos.js loads alongside this file, but the fallback keeps the
   * settings panel usable if it ever doesn't. */
  var PAPER_FALLBACK = [
    { value: '80', label: '80 mm (standard)' },
    { value: '58', label: '58 mm' },
  ];
  function paperOptions(sel) {
    var list = (window.KiwiEscPos && window.KiwiEscPos.paperWidths) || PAPER_FALLBACK;
    var cur = String(sel || '80');
    return list.map(function (p) {
      return '<option value="' + p.value + '"' + (cur === p.value ? ' selected' : '') + '>' + p.label + '</option>';
    }).join('');
  }
  /* Label stock the shop actually loaded, in mm. This drives the printed page
   * size for BOTH the browser/Windows-driver route and the PDF (assets/barcode.js
   * labelSize()), so a 110 mm roll stops being printed as a 50 mm sticker. */
  var LABEL_SIZES = [
    { w: 50, h: 30 }, { w: 50, h: 20 }, { w: 40, h: 30 }, { w: 40, h: 25 }, { w: 30, h: 20 },
    { w: 60, h: 30 }, { w: 60, h: 40 }, { w: 58, h: 40 },
    { w: 110, h: 30 }, { w: 110, h: 50 }, { w: 100, h: 50 }, { w: 100, h: 150 },
  ];
  function labelOptions(sel) {
    var cur = (sel && sel.w ? sel.w : 50) + 'x' + (sel && sel.h ? sel.h : 20);
    return LABEL_SIZES.map(function (l) {
      var v = l.w + 'x' + l.h;
      return '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + l.w + ' × ' + l.h + ' mm</option>';
    }).join('');
  }

  /* Makes sold into Moroccan / North-African POS. All of these speak ESC/POS,
   * which is what KiwiEscPos emits — the field is a label for the owner, not a
   * driver, so an unlisted make that speaks ESC/POS works on "Générique".
   * `note` carries a real caveat shown under the picker when that make is
   * chosen.
   *
   * The model families in the labels are the ones actually on sale in Morocco,
   * taken from the catalogues of Moroccan POS vendors (fournipro.ma, iris.ma,
   * lepc.ma, posmaroc.ma) rather than from a manufacturer's world range — a
   * merchant recognises the box on their counter, not the global SKU list.
   *
   * `driver` is the make's own driver/support page, and it is a FALLBACK, not
   * the happy path: over Bluetooth, USB or the bridge, Kiwi pushes ESC/POS
   * bytes itself and no driver is involved at all. It matters in exactly two
   * places — printing labels through the browser/Windows driver route (see
   * LABEL_SIZES above), and Windows refusing a WebUSB claim until the printer
   * has a WinUSB-flavoured driver (see the usb transport below). Every URL here
   * was fetched and confirmed live; a make with no reachable official download
   * page deliberately carries no link rather than a plausible dead one. */
  var MODELS = [
    { id: 'escpos', label: 'Générique (ESC/POS)' },
    { id: 'epson', label: 'Epson (TM-T20 / TM-T88 / TM-U220)',
      driver: 'https://download-center.epson.com/' },
    { id: 'xprinter', label: 'Xprinter (XP-58 / XP-80)',
      driver: 'https://www.xprinter.net/' },
    { id: 'sunmi', label: 'Sunmi',
      note: 'Les Sunmi sont des terminaux Android à imprimante intégrée : l\'impression passe par le terminal, il n\'y a pas de pilote Windows à installer.',
      driver: 'https://www.sunmi.com/' },
    { id: 'rongta', label: 'Rongta', driver: 'https://www.rongtatech.com/download/' },
    { id: 'bixolon', label: 'Bixolon (SRP)', driver: 'https://bixolonusa.com/support/downloads/' },
    { id: 'hprt', label: 'HPRT', driver: 'https://download.hprt.com/Downloads/' },
    { id: 'citizen', label: 'Citizen (CT-E351 / CT-S851)',
      driver: 'https://www.citizen-systems.com/en/support/drivers-and-tools/' },
    /* Vendu au Maroc surtout en portable Bluetooth (MTP-3F, PT-210). Pas de
     * page de téléchargement officielle joignable — d'où l'absence de lien. */
    { id: 'goojprt', label: 'Goojprt (MTP-3F / PT-210)',
      note: 'Goojprt ne publie pas de page de téléchargement officielle joignable. Ces modèles sont de l\'ESC/POS générique : connectez-les en Bluetooth ou en USB, aucun pilote n\'est nécessaire.' },
    { id: 'munbyn', label: 'Munbyn',
      driver: 'https://support.munbyn.com/hc/en-us/articles/6092502480787-Printer-Drivers-SDK-Download' },
    { id: 'gainscha', label: 'Gainscha (GA-E200i)', driver: 'https://www.gainscha.com.tw/download' },
    { id: 'zjiang', label: 'Zjiang (ZJ)',
      note: 'Zjiang ne publie pas de page de téléchargement officielle joignable. Ces imprimantes sont de l\'ESC/POS générique : connectez-les en Bluetooth ou en USB, aucun pilote n\'est nécessaire.' },
    { id: 'snbc', label: 'SNBC (BTP)',
      note: 'SNBC ne publie pas de page de téléchargement officielle joignable depuis le Maroc. En Bluetooth ou en USB, aucun pilote n\'est nécessaire.' },
    { id: 'sprt', label: 'SPRT', driver: 'https://www.sprt-printer.com/download/' },
    { id: 'posiflex', label: 'Posiflex (Aura)', driver: 'https://download.posiflex.com/' },
    { id: 'nexa', label: 'Nexa' },
    { id: 'milestone', label: 'Milestone' },
    /* First Kiwi client's hardware — et pas un cas isolé : posmaroc.ma vend
     * toute la gamme (WD8260, WD8210, WD9800, WD980, tiroir WD0408), donc
     * c'est le distributeur à indiquer plutôt qu'un site constructeur.
     * WD8260 (reçus, 80 mm, USB + LAN) déclare "Command Support: ESC/POS" sur
     * sa plaque, donc il marche tel quel, tiroir 24 V compris. WD8210
     * (étiquettes, 110 mm, USB + Bluetooth) ne déclare PAS son langage :
     * beaucoup d'imprimantes d'étiquettes parlent TSPL et non ESC/POS.
     * À vérifier par un ticket test avant de compter dessus. */
    { id: 'wdlink', label: 'WDLink (WD8260 / WD8210)', note: 'WD8260 (reçus, 80 mm) : ESC/POS confirmé sur la plaque, rien à régler. WD8210 (étiquettes, 110 mm) : le langage n\'est pas indiqué — beaucoup d\'imprimantes d\'étiquettes parlent TSPL. Faites un ticket test avant la mise en service.',
      driver: 'https://posmaroc.ma/' },
    { id: 'star', label: 'Star', note: 'Les Star impriment en mode Star Line, pas en ESC/POS. Activez l\'émulation ESC/POS sur l\'imprimante, sinon le ticket sortira illisible.',
      driver: 'https://starmicronics.com/support/downloads/' },
    /* Listé pour DIRE qu'on ne le pilote pas. Zebra est la marque d'étiquettes
     * la plus vendue au Maroc (ZQ220 / ZQ310 / ZQ320 chez lepc.ma, posmaroc.ma,
     * fournipro.ma, iris.ma) et elle parle ZPL, pas ESC/POS. Sans cette entrée
     * le commerçant choisit « Générique » et sort une étiquette illisible sans
     * comprendre pourquoi : l'avertissement vaut mieux que le silence. */
    { id: 'zebra', label: 'Zebra (ZQ / ZD) — étiquettes', note: 'Les Zebra parlent ZPL, pas ESC/POS : Kiwi ne peut pas les piloter directement en Bluetooth ni en USB. Pour vos étiquettes, installez le pilote Zebra sur la caisse et utilisez le bouton « Imprimer » (impression navigateur).',
      driver: 'https://www.zebra.com/us/en/support-downloads/printers.html' },
  ];
  function modelNote(id) {
    for (var i = 0; i < MODELS.length; i++) if (MODELS[i].id === id) return MODELS[i].note || '';
    return '';
  }
  function modelDriver(id) {
    for (var i = 0; i < MODELS.length; i++) if (MODELS[i].id === id) return MODELS[i].driver || '';
    return '';
  }

  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  /* `osPrinter` is the name of a printer the till ALREADY has installed, printed
   * to through the bridge's spooler route. It is the answer for the commonest
   * shop setup — a USB thermal printer on a Windows caisse — where Bluetooth,
   * WebUSB and the network path all fail at once (Windows owns the USB device,
   * and a USB printer has no IP). */
  function getConfig() {
    var d = { ip: '', port: 9100, osPrinter: '', model: 'escpos', paper: '80', label: { w: 50, h: 20 } };
    try { var o = JSON.parse(ls(CFG_KEY) || '{}') || {}; return Object.assign(d, o); } catch (_) { return d; }
  }
  function setConfig(cfg) { set(CFG_KEY, JSON.stringify(Object.assign(getConfig(), cfg || {}))); }
  function isConfigured() { var c = getConfig(); return !!(c.ip || c.osPrinter); }

  // ── bridge transport ───────────────────────────────────────────────────────
  function withTimeout(promise, ms) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, ms);
    return { signal: ctrl.signal, done: function () { clearTimeout(t); } };
  }

  function pingPort(p, ms) {
    var to = withTimeout(null, ms || 1400);
    return fetch(bridgeBase(p) + '/kiwi/ping', { signal: to.signal, cache: 'no-store' })
      .then(function (r) { to.done(); return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.ok) ? j : null; })
      .catch(function () { to.done(); return null; });
  }

  /* Try the remembered port, then the rest of the range. Each miss is a refused
   * connection on loopback, which fails in about a millisecond, so a full scan
   * is imperceptible — and it only ever happens once per browser. */
  function ping() {
    var remembered = 0;
    try { remembered = Number(ls(PORT_KEY)) || 0; } catch (_) {}
    var order = BRIDGE_PORTS.slice();
    if (remembered && order.indexOf(remembered) !== -1) {
      order.splice(order.indexOf(remembered), 1);
      order.unshift(remembered);
    }
    var i = 0;
    function step() {
      if (i >= order.length) { bridgePort = 0; return null; }
      var p = order[i++];
      return pingPort(p, i === 1 ? 1400 : 600).then(function (j) {
        if (!j) return step();
        bridgePort = p;
        BRIDGE_URL = bridgeBase(p);
        try { set(PORT_KEY, String(p)); } catch (_) {}
        return j;
      });
    }
    return step();
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

  // ── transport B: WebUSB (the printer plugged straight into the till) ─────────
  // Both of the first client's printers are USB (WD8260 = USB+LAN, WD8210 =
  // USB+Bluetooth), and a USB receipt printer is the most common setup in a
  // small shop: no IP to type, no bridge to install, no pairing.
  //
  // USB printers expose interface class 7 (printer) with a bulk OUT endpoint —
  // ESC/POS bytes go straight down it. The browser shows its own device picker
  // (needs a user gesture) and remembers the grant per origin.
  //
  // Caveat worth knowing before promising this to a client: the OS may already
  // own the device. macOS/Linux hand printer-class devices to CUPS, and Windows
  // needs a WinUSB-flavoured driver. When claiming fails we say so and fall
  // through to the other transports rather than dying.
  var usb = { device: null, ep: 0, iface: 0, name: '' };
  function usbSupported() { try { return !!(navigator.usb && navigator.usb.requestDevice); } catch (_) { return false; } }
  function usbConnected() { return !!(usb.device && usb.device.opened && usb.ep); }

  // Find a claimable printer-class interface with a bulk OUT endpoint.
  function usbPickEndpoint(device) {
    var cfg = device.configuration;
    if (!cfg) return null;
    for (var i = 0; i < cfg.interfaces.length; i++) {
      var itf = cfg.interfaces[i];
      for (var a = 0; a < itf.alternates.length; a++) {
        var alt = itf.alternates[a];
        // class 7 = printer. Some cheap units mis-declare as vendor-specific (0xFF),
        // so those are accepted too when they carry a bulk OUT.
        if (alt.interfaceClass !== 7 && alt.interfaceClass !== 0xFF) continue;
        for (var e = 0; e < alt.endpoints.length; e++) {
          var ep = alt.endpoints[e];
          if (ep.direction === 'out' && ep.type === 'bulk') {
            return { iface: itf.interfaceNumber, ep: ep.endpointNumber };
          }
        }
      }
    }
    return null;
  }

  function connectUsb() {
    if (!usbSupported()) return Promise.reject(new Error('no-webusb'));
    return navigator.usb.requestDevice({ filters: [{ classCode: 7 }] })
      .then(function (device) {
        usb.device = device;
        usb.name = [device.manufacturerName, device.productName].filter(Boolean).join(' ') || 'Imprimante USB';
        return device.open();
      })
      .then(function () {
        if (!usb.device.configuration) return usb.device.selectConfiguration(1);
        return null;
      })
      .then(function () {
        var pick = usbPickEndpoint(usb.device);
        if (!pick) throw new Error('no-bulk-out');
        usb.iface = pick.iface; usb.ep = pick.ep;
        return usb.device.claimInterface(pick.iface);
      })
      .then(function () { return { ok: true, name: usb.name }; })
      .catch(function (e) {
        try { if (usb.device && usb.device.opened) usb.device.close(); } catch (_) {}
        usb.device = null; usb.ep = 0;
        throw e;
      });
  }

  /* Silent re-attach. Chrome remembers a USB grant per origin, so after the
   * owner has picked the printer once, navigator.usb.getDevices() hands it back
   * on every later load with NO picker and no user gesture. Without this the
   * cashier had to re-pick the printer every single morning — the permission was
   * still there, Kiwi just wasn't asking for it. Best-effort: any failure simply
   * leaves the panel showing "aucune imprimante", exactly as before. */
  function reconnectUsb() {
    if (!usbSupported() || !navigator.usb.getDevices) return Promise.resolve(null);
    if (usbConnected()) return Promise.resolve({ ok: true, name: usb.name });
    return navigator.usb.getDevices().then(function (list) {
      var dev = (list || [])[0];
      if (!dev) return null;
      usb.device = dev;
      usb.name = [dev.manufacturerName, dev.productName].filter(Boolean).join(' ') || 'Imprimante USB';
      return dev.open()
        .then(function () { return dev.configuration ? null : dev.selectConfiguration(1); })
        .then(function () {
          var pick = usbPickEndpoint(dev);
          if (!pick) throw new Error('no-bulk-out');
          usb.iface = pick.iface; usb.ep = pick.ep;
          return dev.claimInterface(pick.iface);
        })
        .then(function () { return { ok: true, name: usb.name }; })
        .catch(function () { usb.device = null; usb.ep = 0; return null; });
    }).catch(function () { return null; });
  }

  function disconnectUsb() {
    try {
      if (usb.device && usb.device.opened) {
        usb.device.releaseInterface(usb.iface).catch(function () {}).then(function () {
          try { usb.device.close(); } catch (_) {}
        });
      }
    } catch (_) {}
    usb.device = null; usb.ep = 0;
  }

  // Chunked so a long ticket doesn't overrun a small printer buffer.
  function usbWrite(bytes) {
    if (!usbConnected()) return Promise.reject(new Error('usb-not-connected'));
    var CH = 4096, i = 0;
    function step() {
      if (i >= bytes.length) return Promise.resolve();
      var chunk = bytes.slice(i, i + CH); i += CH;
      return usb.device.transferOut(usb.ep, chunk).then(step);
    }
    return step();
  }

  /* ── transport C: the bridge — to a TCP printer, or to one the OS already has ──
   * Same helper, two targets. `osPrinter` wins when both are set: it is the
   * deliberate choice made in the panel, while an `ip` can survive in saved
   * config from an earlier setup and would otherwise silently outrank it. */
  function bridgePrintBytes(bytes) {
    var cfg = getConfig();
    if (!cfg.ip && !cfg.osPrinter) return Promise.resolve({ ok: false, reason: 'not-configured' });
    // Locate the bridge before the first job if we haven't yet (or if it moved
    // ports since — a restart on a busy 9110 lands somewhere else).
    if (!bridgePort) {
      return ping().then(function (j) {
        return j ? bridgePrintNow(bytes) : { ok: false, reason: 'bridge-unreachable' };
      });
    }
    return bridgePrintNow(bytes);
  }
  function bridgePrintNow(bytes) {
    var cfg = getConfig();
    var to = withTimeout(null, 9000);
    return fetch(bridgeBase() + '/kiwi/print', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: to.signal,
      body: JSON.stringify(cfg.osPrinter
        ? { printerName: cfg.osPrinter, dataB64: window.KiwiEscPos.toB64(bytes) }
        : { printerIp: cfg.ip, port: Number(cfg.port) || 9100, dataB64: window.KiwiEscPos.toB64(bytes) }),
    }).then(function (r) {
      to.done();
      return r.json().then(function (j) { return (r.ok && j && j.ok) ? { ok: true, via: 'bridge', bytes: j.bytes } : { ok: false, reason: (j && j.error) || 'print-failed' }; },
        function () { return { ok: false, reason: 'bad-response' }; });
    }).catch(function () { to.done(); return { ok: false, reason: 'bridge-unreachable' }; });
  }

  // Route ESC/POS bytes to whichever printer is live: Bluetooth, then USB, then
  // the network bridge. Callers fail soft when this resolves { ok:false }.
  function printBytes(bytes) {
    if (!window.KiwiEscPos) return Promise.resolve({ ok: false, reason: 'no-encoder' });
    function viaBridge() { return bridgePrintBytes(bytes); }
    function viaUsb() {
      if (!usbConnected()) return viaBridge();
      return usbWrite(bytes).then(
        function () { return { ok: true, via: 'usb', bytes: bytes.length }; },
        /* A stale WebUSB grant must not prevent the configured network/OS
           printer from receiving the same job. */
        viaBridge);
    }
    if (!btConnected()) return viaUsb();
    return btWrite(bytes).then(
      function () { return { ok: true, via: 'bluetooth', bytes: bytes.length }; },
      /* Bluetooth can disconnect between isConnected() and the first chunk.
         Continue down the declared transport order instead of failing early. */
      viaUsb);
  }

  // A printer is "connected" if Bluetooth or USB is live, OR the bridge is set up.
  function isConnected() { return btConnected() || usbConnected() || isConfigured(); }

  function printReceipt(o) { return window.KiwiEscPos ? printBytes(window.KiwiEscPos.receipt(withPaper(o))) : Promise.resolve({ ok: false, reason: 'no-encoder' }); }
  function printKitchen(o) { return window.KiwiEscPos ? printBytes(window.KiwiEscPos.kitchenTicket(withPaper(o))) : Promise.resolve({ ok: false, reason: 'no-encoder' }); }
  function printLabels(labels) {
    if (!window.KiwiEscPos) return Promise.resolve({ ok: false, reason: 'no-encoder' });
    var list = (Array.isArray(labels) ? labels : [labels]).filter(Boolean);
    var cfg = getConfig();
    var paper = cfg.paper;
    var label = cfg.label;
    // Concatenate each label's bytes into one job.
    var chunks = list.map(function (l) { return window.KiwiEscPos.label(Object.assign({ paper: paper, label: label }, l)); });
    var total = chunks.reduce(function (n, c) { return n + c.length; }, 0);
    var all = new Uint8Array(total); var off = 0;
    chunks.forEach(function (c) { all.set(c, off); off += c.length; });
    return printBytes(all);
  }
  function withPaper(o) { o = o || {}; if (!o.paper) o.paper = getConfig().paper; return o; }

  /* ── transport D : le pilote du système, via la boîte d'impression ──────────
   * Les trois transports au-dessus (Bluetooth, USB, pont) poussent de l'ESC/POS
   * et exigent que Kiwi PARLE à l'imprimante. Sur une caisse Windows où
   * l'imprimante est déjà installée, c'est justement impossible : Windows
   * possède le périphérique, WebUSB se voit refuser le claim (« Imprimante déjà
   * utilisée par le système ») et il n'y a ni Bluetooth ni pont. L'imprimante
   * marche pourtant très bien — pour tout le reste de Windows.
   *
   * D'où cette quatrième voie : on peint le reçu en HTML et on laisse le pilote
   * du système l'imprimer. Ce n'est pas silencieux (il y a une boîte de
   * dialogue), donc ça reste le repli et non le chemin nominal, mais c'est la
   * seule chose qui imprime sur une caisse déjà équipée.
   *
   * La mise en page suit celle de KiwiEscPos.receipt() volontairement : le même
   * ticket ne doit pas changer de forme selon la voie qui l'imprime. */
  function receiptHTML(o) {
    o = withPaper(o || {});
    var rows = (o.lines || []).map(function (l) {
      var name = (l.qty ? l.qty + '× ' : '') + (l.name || '');
      return '<div class="kpr-r"><span>' + esc(name) + '</span><span>' + esc(l.price != null ? l.price : '') + '</span></div>';
    }).join('');
    return '<div class="kpr-ticket">' +
      '<div class="kpr-shop">' + esc(o.shop || 'Kiwi') + '</div>' +
      (o.address ? '<div class="kpr-c">' + esc(o.address) + '</div>' : '') +
      (o.phone ? '<div class="kpr-c">' + esc(o.phone) + '</div>' : '') +
      ((o.ref || o.date) ? '<div class="kpr-c">' + esc([o.ref, o.date].filter(Boolean).join('  ')) + '</div>' : '') +
      '<div class="kpr-rule"></div>' + rows + '<div class="kpr-rule"></div>' +
      '<div class="kpr-r kpr-tot"><span>TOTAL</span><span>' + esc(o.total != null ? o.total : '') + '</span></div>' +
      (o.method ? '<div class="kpr-r"><span>Paiement</span><span>' + esc(o.method) + '</span></div>' : '') +
      (o.footer ? '<div class="kpr-c kpr-foot">' + esc(o.footer) + '</div>' : '') +
      '<div class="kpr-c kpr-foot">Merci · Kiwi</div>' +
    '</div>';
  }

  /* ── LE RAPPORT JOURNALIER, MÊME MISE EN PAGE PAR LES DEUX VOIES ───────────
   * Le « Z » de fin de journée est une pièce comptable : le patron l'agrafe, le
   * comptable le relit. Il doit donc sortir IDENTIQUE que Kiwi parle à
   * l'imprimante en ESC/POS (KiwiEscPos.dayReport) ou que ce soit le pilote
   * Windows qui l'imprime — sinon deux exemplaires du même jour n'ont pas la
   * même tête et plus personne ne sait lequel fait foi. L'ordre des blocs,
   * les libellés et les totaux suivent donc ligne pour ligne l'encodeur. */
  function dayReportHTML(o) {
    o = withPaper(o || {});
    var r = o.report || {};
    var f = o.fmt || function (n) { return String(Math.round(+n || 0)); };
    var money = function (n) { return f(n) + ' MAD'; };
    var out = [];
    var R = function (l, v, cls) {
      out.push('<div class="kpr-r' + (cls ? ' ' + cls : '') + '"><span>' + esc(l) + '</span><span>' + esc(v) + '</span></div>');
    };
    var rule = function () { out.push('<div class="kpr-rule"></div>'); };

    out.push('<div class="kpr-shop">' + esc(o.shop || (r.store && r.store.name) || 'Kiwi') + '</div>');
    out.push('<div class="kpr-c kpr-ttl">' + esc(o.title || 'RAPPORT JOURNALIER') + '</div>');
    var addr = o.address || (r.store && r.store.location) || '';
    if (addr) out.push('<div class="kpr-c">' + esc(addr) + '</div>');
    if (o.dateLabel) out.push('<div class="kpr-c">' + esc(o.dateLabel) + '</div>');
    if (o.copy) out.push('<div class="kpr-c kpr-copy">— ' + esc(o.copy) + ' —</div>');
    rule();

    if (o.openedLabel) R('Ouverture', o.openedLabel);
    if (o.closedLabel) R('Fermeture', o.closedLabel);
    if (r.openedBy) R('Ouvert par', r.openedBy);
    if (r.closedBy) R('Fermé par', r.closedBy);
    rule();

    /* Le mode « ventes par article » suit l'encodeur ESC/POS coupe pour coupe
       (KiwiEscPos.dayReport, même drapeau) : sans ça, demander le détail article
       sur une imprimante pilotée par le système sortait un Z complet — net et
       tiroir compris — au lieu du petit ticket demandé. */
    var itemsOnly = !!o.itemsOnly;

    if (!itemsOnly) {
    R('Transactions', String(r.txns || 0));
    R('TOTAL ENCAISSÉ', money(r.gross), 'kpr-b');
    var M = o.methodLabels || {};
    Object.keys(r.methods || {}).forEach(function (k) {
      if (!r.methods[k]) return;
      R('  ' + (M[k] || k), money(r.methods[k]));
    });
    if (r.basket) R('Ticket moyen', money(r.basket));
    if (r.tips) R('Pourboires', money(r.tips));
    if (r.discounts && r.discounts.amount) R('Remises accordées', '- ' + money(r.discounts.amount));
    if (r.refunds && r.refunds.count) R('Remboursements (' + r.refunds.count + ')', '- ' + money(r.refunds.amount));
    if (r.cancels) R('Annulations', String(r.cancels));
    }

    if ((r.categories || []).length) {
      rule();
      if (!itemsOnly) out.push('<div class="kpr-c kpr-b">' + esc(o.detailTitle || 'DÉTAIL PAR CATÉGORIE') + '</div>');
      r.categories.forEach(function (c) {
        R(c.name, money(c.total), 'kpr-b');
        (c.products || []).forEach(function (p) {
          R('  ' + p.qty + '× ' + p.name, money(p.total));
        });
        R('  = ' + c.qty + ' ' + ((Math.abs(+c.qty || 0) === 1 && o.unitWordOne) ? o.unitWordOne : (o.unitWord || 'articles')), money(c.total), 'kpr-sub');
      });
      if (r.coverage != null && r.coverage < 100) {
        out.push('<div class="kpr-note">* détail portant sur ' + r.coverage + '% du chiffre</div>');
      }
      if (itemsOnly) {
        var totQ = 0, totV = 0;
        r.categories.forEach(function (c) { totQ += (+c.qty || 0); totV += (+c.total || 0); });
        rule();
        R('TOTAL ' + String(o.unitWord || 'articles').toUpperCase(), totQ + ' · ' + money(totV), 'kpr-b');
      }
    } else if (itemsOnly) {
      rule();
      out.push('<div class="kpr-c">' + esc(o.noItemsWord || 'Aucun article détaillé') + '</div>');
    }

    if (itemsOnly) {
      out.push('<div class="kpr-c kpr-foot">Kiwi · ' + esc(r.day || '') + '</div>');
      return '<div class="kpr-ticket">' + out.join('') + '</div>';
    }

    var cash = r.cash || {};
    rule();
    out.push('<div class="kpr-c kpr-b">' + esc(o.drawerTitle || 'TIROIR-CAISSE') + '</div>');
    R("Fond d'ouverture", money(cash.opening));
    R('Espèces encaissées', '+ ' + money(cash.sales));
    if (cash.tips) R('Pourboires espèces', '+ ' + money(cash.tips));
    (cash.movements || []).forEach(function (m) {
      R('  ' + (m.reason || (m.type === 'in' ? 'Entrée' : 'Sortie')),
        (m.type === 'in' ? '+ ' : '- ') + money(m.amount));
    });
    R('ATTENDU EN CAISSE', money(cash.expected), 'kpr-b');
    if (cash.counted != null) {
      R('Compté', money(cash.counted));
      var e = cash.ecart || 0;
      R('ÉCART', (e > 0 ? '+ ' : e < 0 ? '- ' : '') + money(Math.abs(e)), 'kpr-b');
    } else {
      R('Compté', o.notCounted || 'non compté');
    }

    rule();
    R(o.netLabel || 'NET DU JOUR', money(r.net), 'kpr-tot');

    if ((r.handovers || []).length) {
      rule();
      (r.handovers || []).forEach(function (h) {
        R((o.handoverWord || 'Passation') + ' ' + h.from + ' > ' + h.to, f(h.ecart));
      });
    }
    if ((r.closedCount || 0) > 1) {
      rule();
      out.push('<div class="kpr-note">' + esc(o.reopenWord || 'Clôture n°') + ' ' + (r.closedCount || 1) + '</div>');
    }
    out.push('<div class="kpr-c kpr-foot">Kiwi · ' + esc(r.day || '') + '</div>');
    return '<div class="kpr-ticket">' + out.join('') + '</div>';
  }

  /* La largeur de page suit le rouleau réglé dans les paramètres : imprimer un
   * 80 mm sur une page A4 donne un ticket minuscule perdu en haut d'une feuille,
   * ce qui est le grand classique de l'impression navigateur ratée. */
  function ensureReceiptPrintCss(paper) {
    var w = String(paper || '80') === '58' ? 58 : 80;
    var prev = document.getElementById('kpr-print-css');
    if (prev) { if (prev.getAttribute('data-w') === String(w)) return; prev.remove(); }
    var st = document.createElement('style');
    st.id = 'kpr-print-css';
    st.setAttribute('data-w', String(w));
    st.textContent =
      '#kpr-print-root{display:none;}' +
      '@media print{' +
        '@page{size:' + w + 'mm auto;margin:0;}' +
        'html,body{margin:0!important;padding:0!important;background:#fff!important;}' +
        /* Tout le reste de la caisse disparaît : sans ça la boîte d'impression
         * sort la page entière (grille produits, panneaux) au lieu du reçu. */
        'body>*:not(#kpr-print-root){display:none!important;}' +
        '#kpr-print-root{display:block!important;position:static!important;}' +
        '.kpr-ticket{width:' + (w - 6) + 'mm;margin:0 auto;padding:3mm 0;color:#000;' +
          'font-family:var(--mono,ui-monospace,"JetBrains Mono",Menlo,Consolas,monospace);font-size:9pt;line-height:1.45;}' +
        '.kpr-shop{text-align:center;font-weight:700;font-size:14pt;margin-bottom:2mm;}' +
        '.kpr-c{text-align:center;}' +
        '.kpr-rule{border-top:1px dashed #000;margin:2mm 0;}' +
        '.kpr-r{display:flex;justify-content:space-between;gap:3mm;}' +
        '.kpr-r>span:last-child{white-space:nowrap;}' +
        '.kpr-tot{font-weight:700;font-size:12pt;margin:1mm 0;}' +
        '.kpr-foot{margin-top:3mm;}' +
        /* Rapport journalier — le titre sous l'enseigne, la mention de copie,
         * les lignes en gras (catégories, totaux) et la note de couverture.
         * `white-space:pre` sur le libellé garde l'indentation de deux espaces
         * qui distingue un produit de sa catégorie ; sans elle le HTML les
         * replie et le détail perd sa hiérarchie. */
        '.kpr-ttl{letter-spacing:.08em;font-size:8pt;margin-bottom:1mm;}' +
        '.kpr-copy{font-weight:700;margin:1mm 0;}' +
        '.kpr-r>span:first-child{white-space:pre;}' +
        '.kpr-b{font-weight:700;}' +
        '.kpr-sub{opacity:.75;}' +
        '.kpr-note{font-size:7.5pt;opacity:.75;margin-top:1mm;}' +
        /* Une catégorie et ses produits ne doivent pas être coupés par un saut
         * de page au milieu — sur une imprimante à feuilles, un rayon dont le
         * total atterrit seul sur la page suivante est illisible. */
        '.kpr-r{break-inside:avoid;}' +
      '}';
    document.head.appendChild(st);
  }

  /* Repeint et ouvre la boîte d'impression. Le root est retiré après coup pour
   * ne pas laisser un reçu fantôme dans le DOM de la caisse. */
  function browserPrintHTML(html, paper) {
    var root = document.getElementById('kpr-print-root');
    if (root) root.remove();
    root = document.createElement('div');
    root.id = 'kpr-print-root';
    root.innerHTML = html;
    document.body.appendChild(root);
    ensureReceiptPrintCss(paper);
    setTimeout(function () {
      try { window.print(); } catch (_) {}
      setTimeout(function () { var r = document.getElementById('kpr-print-root'); if (r) r.remove(); }, 600);
    }, 60);
    return { ok: true, via: 'browser' };
  }
  function browserReceipt(o) {
    o = withPaper(o || {});
    return browserPrintHTML(receiptHTML(o), o.paper);
  }
  function browserDayReport(o) {
    o = withPaper(o || {});
    return browserPrintHTML(dayReportHTML(o), o.paper);
  }

  /* printDayReport — la voie nominale, avec le repli qui compte.
   *
   * Les trois transports ESC/POS ne répondent que si une imprimante est
   * réellement appairée. Une clôture ne doit PAS échouer parce que le
   * commerçant n'a pas encore branché de thermique : on retombe alors sur le
   * pilote du système, qui sort le même rapport sur ce que Windows sait
   * imprimer (y compris « Enregistrer en PDF », ce qui est un archivage tout à
   * fait valable). Le résultat dit par quelle voie c'est parti, pour que
   * l'écran de clôture puisse le nommer honnêtement au lieu d'un « envoyé à
   * l'imprimante » qui n'engage rien. */
  function printDayReport(o) {
    o = withPaper(o || {});
    if (!window.KiwiEscPos || !window.KiwiEscPos.dayReport) {
      return Promise.resolve(browserDayReport(o));
    }
    if (!isConnected()) return Promise.resolve(browserDayReport(o));
    return printBytes(window.KiwiEscPos.dayReport(o)).then(function (res) {
      if (res && res.ok) return res;
      return browserDayReport(o);
    }, function () { return browserDayReport(o); });
  }

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
      '.kpr-field input,.kpr-field select{width:100%;font:inherit;padding:11px 13px;border:1.5px solid rgba(0,0,0,.12);border-radius:11px;background:var(--surface);color:var(--ink,#0A0F0D);}' +
      '.kpr-field input:focus,.kpr-field select:focus{outline:none;border-color:var(--atlas,#0B6E4F);box-shadow:0 0 0 4px rgba(11,110,79,.13);}' +
      '.kpr-two{display:flex;gap:12px;}.kpr-two>*{flex:1;}' +
      '.kpr-actions{display:flex;gap:10px;margin-top:20px;}' +
      '.kpr-btn{flex:1;font:inherit;font-weight:700;padding:13px;border-radius:12px;cursor:pointer;border:0;}' +
      '.kpr-test{background:var(--surface);border:1.5px solid var(--atlas,#0B6E4F);color:var(--atlas,#0B6E4F);}' +
      '.kpr-test:disabled{opacity:.45;cursor:default;}' +
      '.kpr-save{background:var(--atlas,#0B6E4F);color:#fff;}' +
      '.kpr-save:hover{filter:brightness(1.06);}' +
      '.kpr-browser{width:100%;margin-top:10px;background:none;border:1.5px solid rgba(0,0,0,.14);color:var(--ink,#0A0F0D);opacity:.85;}' +
      '.kpr-browser:hover{opacity:1;border-color:rgba(0,0,0,.28);}' +
      '.kpr-quick{display:flex;gap:10px;margin:0 0 16px;}' +
      '.kpr-quick .kpr-btn{flex:1;width:auto;margin:0;}' +
      '.kpr-quick .kpr-browser{background:var(--atlas,#0B6E4F);color:#fff;border:0;opacity:1;}' +
      '.kpr-quick .kpr-browser:hover{filter:brightness(1.06);border:0;}' +
      '.kpr-quick .kpr-pdf{background:var(--surface);border:1.5px solid var(--atlas,#0B6E4F);color:var(--atlas,#0B6E4F);}' +
      '.kpr-bt{border:1.5px solid rgba(11,110,79,.25);border-radius:14px;padding:15px 16px;margin:0 0 14px;background:rgba(11,110,79,.045);}' +
      '.kpr-bt h3{margin:0 0 3px;font-size:1rem;}' +
      '.kpr-bt>p{margin:0 0 12px;font-size:.82rem;opacity:.7;line-height:1.45;}' +
      '.kpr-btc{width:100%;font:inherit;font-weight:700;padding:13px;border-radius:12px;cursor:pointer;border:0;background:var(--atlas,#0B6E4F);color:#fff;}' +
      '.kpr-btc:hover{filter:brightness(1.06);}.kpr-btc:disabled{opacity:.5;cursor:default;}' +
      '.kpr-adv{margin-top:8px;border-top:1px solid rgba(0,0,0,.08);padding-top:12px;}' +
      '.kpr-adv>summary{cursor:pointer;font-size:.84rem;font-weight:700;color:var(--riad,#053B2C);opacity:.82;}' +
      '.kpr-adv[open]>summary{margin-bottom:14px;}' +
      '.kpr-x{float:right;background:none;border:0;font-size:1.3rem;line-height:1;cursor:pointer;color:var(--ink,#0A0F0D);opacity:.5;}' +
      '.kpr-note{margin:14px 0 0;font-size:.78rem;opacity:.6;line-height:1.5;}' +
      /* Sans ça les liens d'une note (« Télécharger le pont », la page de pilote)
       * sortent du même gris que le texte autour et ne se lisent pas comme des
       * liens — le commerçant ne clique pas ce qu'il ne voit pas. */
      '.kpr-note a{color:var(--atlas,#0B6E4F);font-weight:600;text-decoration:underline;}';
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
    var usbLive = usbConnected();
    var fromPrint = !!(context.onBrowserPrint || context.onSavePdf);
    /* Le modal servait les étiquettes uniquement, donc le titre les nommait en
     * dur. Le reçu emprunte le même chemin depuis que l'impression système est
     * un repli : `kind` évite de proposer « Imprimer l'étiquette » à une
     * caissière qui encaisse une vente. */
    var isLabel = (context.kind || 'label') === 'label';
    ov.innerHTML =
      '<div id="kpr-card">' +
        '<button class="kpr-x" type="button" id="kpr-close" aria-label="Fermer">×</button>' +
        '<h2>' + (fromPrint ? (isLabel ? 'Imprimer l’étiquette' : 'Imprimer le reçu') : 'Connecter une imprimante') + '</h2>' +
        '<p class="kpr-sub">' + (fromPrint
          ? (isLabel
            ? 'Imprimez tout de suite, ou connectez une imprimante (Bluetooth ou réseau) pour imprimer directement la prochaine fois.'
            : 'Aucune imprimante n’est connectée à Kiwi. Si l’imprimante est déjà installée sur cette caisse, imprimez par le système — ou connectez-la en Bluetooth ou en USB pour imprimer sans boîte de dialogue la prochaine fois.')
          /* Cette phrase renvoyait vers un bouton « Imprimer » qui n'existe que
           * lorsqu'on ouvre le modal DEPUIS une impression (fromPrint). Ouvert
           * par « connecter une imprimante », elle envoyait le commerçant
           * chercher un bouton absent de l'écran. */
          : 'Connectez l’imprimante en Bluetooth ou en USB pour imprimer sans boîte de dialogue. Si elle est déjà installée sur cette caisse, Kiwi peut aussi l’utiliser via la boîte d’impression du système.') + '</p>' +
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
        (usbSupported() ? '<div class="kpr-bt">' +
          '<h3>Imprimante USB</h3>' +
          '<p>Branchée en USB sur la caisse. Sans installation, sans adresse IP.</p>' +
          '<div class="kpr-status ' + (usbLive ? 'on' : 'off') + '" id="kpr-usb-status"><span class="kpr-d"></span><span id="kpr-usb-status-t">' + (usbLive ? esc('Connectée · ' + usb.name) : 'Aucune imprimante USB connectée.') + '</span></div>' +
          '<button class="kpr-btc" type="button" id="kpr-usb-connect">' + (usbLive ? 'Changer d’imprimante' : 'Choisir l’imprimante USB') + '</button>' +
          '<div class="kpr-actions"><button class="kpr-btn kpr-test" type="button" id="kpr-usb-test"' + (usbLive ? '' : ' disabled') + '>Imprimer un ticket test</button></div>' +
        '</div>' : '') +
        /* Printers the till already has. Hidden until the bridge answers with a
         * non-empty list — on a tablet, or with no bridge, an empty box that
         * never fills is worse than no box. Populated in the ping handler. */
        '<div class="kpr-bt" id="kpr-os" style="display:none;">' +
          '<h3>Imprimante déjà installée</h3>' +
          '<p>Celle que cet ordinateur utilise déjà. Kiwi lui envoie le ticket directement, sans boîte de dialogue.</p>' +
          '<div class="kpr-status ' + (cfg.osPrinter ? 'on' : 'off') + '" id="kpr-os-status"><span class="kpr-d"></span><span id="kpr-os-status-t">' + (cfg.osPrinter ? esc('Choisie · ' + cfg.osPrinter) : 'Aucune imprimante choisie.') + '</span></div>' +
          '<div class="kpr-field"><label for="kpr-os-sel">Imprimante</label><select id="kpr-os-sel"></select></div>' +
          '<div class="kpr-actions">' +
            '<button class="kpr-btn kpr-test" type="button" id="kpr-os-test">Imprimer un ticket test</button>' +
            '<button class="kpr-btn kpr-save" type="button" id="kpr-os-save">Utiliser cette imprimante</button>' +
          '</div>' +
        '</div>' +
        '<details class="kpr-adv"' + (cfg.ip ? ' open' : '') + '>' +
          '<summary>Option avancée · imprimante réseau (Wi-Fi / Ethernet)</summary>' +
          '<div class="kpr-status off" id="kpr-status"><span class="kpr-d"></span><span id="kpr-status-t">Vérification du pont…</span></div>' +
          '<div class="kpr-field"><label for="kpr-ip">Adresse IP de l’imprimante</label><input id="kpr-ip" type="text" inputmode="decimal" placeholder="192.168.1.50" value="' + esc(cfg.ip) + '"></div>' +
          '<div class="kpr-two">' +
            '<div class="kpr-field"><label for="kpr-port">Port</label><input id="kpr-port" type="text" inputmode="numeric" value="' + esc(cfg.port) + '"></div>' +
            '<div class="kpr-field"><label for="kpr-paper">Largeur papier</label><select id="kpr-paper">' + paperOptions(cfg.paper) + '</select></div>' +
            '<div class="kpr-field"><label for="kpr-label">Format d\'étiquette</label><select id="kpr-label">' + labelOptions(cfg.label) + '</select></div>' +
          '</div>' +
          '<div class="kpr-field"><label for="kpr-model">Modèle</label><select id="kpr-model">' + opts + '</select>' +
            '<p class="kpr-note" id="kpr-model-note" style="margin-top:8px;' + (modelNote(cfg.model) ? '' : 'display:none;') + '">' + esc(modelNote(cfg.model)) + '</p>' +
            /* Le pilote ne sert PAS aux trois transports de Kiwi (Bluetooth, USB,
             * pont) : il sert à imprimer les étiquettes via le pilote Windows, et
             * à débloquer un refus de claim WebUSB. Le libellé le dit, pour ne pas
             * envoyer le commerçant installer un pilote dont il n'a pas besoin. */
            '<p class="kpr-note" id="kpr-model-driver" style="margin-top:6px;' + (modelDriver(cfg.model) ? '' : 'display:none;') + '">' +
              'Pilote Windows (utile seulement pour les étiquettes ou si l\'USB est refusé) : ' +
              '<a id="kpr-model-driver-a" href="' + esc(modelDriver(cfg.model)) + '" target="_blank" rel="noopener noreferrer">page de téléchargement</a>' +
            '</p></div>' +
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
      var lv = ($('#kpr-label') ? $('#kpr-label').value : '50x20').split('x');
      return {
        ip: $('#kpr-ip').value.trim(), port: $('#kpr-port').value.trim() || '9100',
        model: $('#kpr-model').value, paper: $('#kpr-paper').value,
        label: { w: Number(lv[0]) || 50, h: Number(lv[1]) || 20 },
      };
    }
    function close() { ov.remove(); }
    function toast(msg) { try { if (window.Kiwi && Kiwi.toast) Kiwi.toast(msg); } catch (_) {} }

    /* Fill the "already installed" picker from the bridge. Older bridges (< 1.2)
     * have no /kiwi/printers and 404 — the section simply stays hidden, so an
     * un-updated till degrades to exactly today's behaviour instead of showing a
     * control that can never work. */
    function loadOsPrinters() {
      var box = $('#kpr-os'), sel = $('#kpr-os-sel');
      if (!box || !sel) return Promise.resolve();
      var to = withTimeout(null, 6000);
      return fetch(bridgeBase() + '/kiwi/printers', { signal: to.signal })
        .then(function (r) { to.done(); return r.ok ? r.json() : null; })
        .catch(function () { to.done(); return null; })
        .then(function (j) {
          var list = (j && j.ok && Array.isArray(j.printers)) ? j.printers : [];
          if (!list.length) { box.style.display = 'none'; return; }
          var cur = getConfig().osPrinter || j.default || '';
          sel.innerHTML = list.map(function (n) {
            return '<option value="' + esc(n) + '"' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>';
          }).join('');
          box.style.display = '';
        });
    }

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
          loadOsPrinters();
        } else {
          var box = $('#kpr-os'); if (box) box.style.display = 'none';
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

    /* Choosing an installed printer clears any saved IP. Leaving both set would
     * be ambiguous to read back later, even though the bridge prefers the name. */
    $('#kpr-os-save').addEventListener('click', function () {
      var sel = $('#kpr-os-sel'); if (!sel || !sel.value) return;
      setConfig({ osPrinter: sel.value, ip: '' });
      var t = $('#kpr-os-status-t'), st = $('#kpr-os-status');
      if (t) t.textContent = 'Choisie · ' + sel.value;
      if (st) st.className = 'kpr-status on';
      toast('Imprimante enregistrée');
      close();
    });

    /* Test prints to the printer highlighted right now, not to the saved one —
     * the owner is trying candidates, and a test that ignores the picker would
     * report success for a printer they didn't select. */
    $('#kpr-os-test').addEventListener('click', function () {
      var sel = $('#kpr-os-sel'); if (!sel || !sel.value) return;
      var btn = this, orig = btn.textContent;
      btn.disabled = true; btn.textContent = 'Impression…';
      var cfg2 = getConfig();
      var to = withTimeout(null, 12000);
      fetch(bridgeBase() + '/kiwi/print', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: to.signal,
        body: JSON.stringify({ printerName: sel.value,
          dataB64: window.KiwiEscPos.toB64(window.KiwiEscPos.testSlip({ paper: cfg2.paper })) }),
      }).then(function (r) { to.done(); return r.json().catch(function () { return null; }); })
        .then(function (j) {
          btn.textContent = orig; btn.disabled = false;
          toast(j && j.ok ? 'Ticket test envoyé' : ('Échec : ' + ((j && j.error) || 'inconnu')));
        })
        .catch(function () {
          to.done(); btn.textContent = orig; btn.disabled = false;
          toast('Échec : pont injoignable');
        });
    });
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

    // ── USB (WebUSB): same shape as Bluetooth, different transport ──
    if ($('#kpr-usb-connect')) {
      $('#kpr-usb-connect').addEventListener('click', function () {
        var st = $('#kpr-usb-status'), t = $('#kpr-usb-status-t'), btn = this;
        btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Recherche…';
        connectUsb().then(function (r) {
          btn.disabled = false; btn.textContent = 'Changer d’imprimante';
          st.className = 'kpr-status on'; t.textContent = 'Connectée · ' + (r.name || 'Imprimante USB');
          $('#kpr-usb-test').disabled = false;
          toast('Imprimante USB connectée');
        }, function (e) {
          btn.disabled = false; btn.textContent = orig; st.className = 'kpr-status off';
          var m = (e && e.message) || '';
          /* The honest failure here is "the operating system already owns this
             printer" — macOS/Linux hand printer-class devices to CUPS and Windows
             wants a WinUSB driver. Say that instead of a raw DOMException. */
          if (/no-webusb/.test(m)) t.textContent = 'USB indisponible sur ce navigateur. Utilisez Chrome (ordinateur ou Android).';
          else if (/cancel|NotFound|chooser|No device selected/i.test(m)) t.textContent = 'Aucune imprimante sélectionnée.';
          else if (/no-bulk-out/.test(m)) t.textContent = 'Appareil trouvé mais ce n’est pas une imprimante USB standard.';
          else if (/SecurityError|NotAllowed/i.test(m)) t.textContent = 'Accès USB refusé par le navigateur.';
          else if (/access denied|claim|busy|InvalidState/i.test(m)) t.textContent = 'Imprimante déjà utilisée par le système. Retirez-la des imprimantes installées (ou utilisez le port réseau), puis réessayez.';
          else t.textContent = 'Connexion impossible : ' + m;
        });
      });
      $('#kpr-usb-test').addEventListener('click', function () {
        var btn = this; btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Impression…';
        printBytes(window.KiwiEscPos.testSlip({ paper: getConfig().paper })).then(function (res) {
          btn.textContent = orig; btn.disabled = !usbConnected();
          toast(res.ok ? 'Ticket test envoyé' : ('Échec : ' + (res.reason || 'inconnu')));
        });
      });
    }

    // Model caveats (Star emulation, WD8210 language, Zebra = ZPL) and the make's
    // driver page surface as they're picked.
    $('#kpr-model').addEventListener('change', function () {
      var el = $('#kpr-model-note');
      if (el) {
        var n = modelNote(this.value);
        el.textContent = n;
        el.style.display = n ? '' : 'none';
      }
      var dp = $('#kpr-model-driver'), da = $('#kpr-model-driver-a');
      if (dp && da) {
        var d = modelDriver(this.value);
        // href, jamais innerHTML : l'URL vient de MODELS, mais on garde le même
        // réflexe que partout ailleurs dans ce fichier.
        if (d) da.setAttribute('href', d);
        dp.style.display = d ? '' : 'none';
      }
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

    /* A printer granted on an earlier visit is re-attached silently; reflect it
     * here so the panel never claims "aucune imprimante" for one that is in fact
     * connected and ready to print. */
    reconnectUsb().then(function (r) {
      if (!r || !ov.isConnected) return;
      var st = $('#kpr-usb-status'), t = $('#kpr-usb-status-t'), btn = $('#kpr-usb-connect');
      if (!st || !t) return;
      st.className = 'kpr-status on';
      t.textContent = 'Connectée · ' + (r.name || 'Imprimante USB');
      if (btn) btn.textContent = 'Changer d’imprimante';
      var test = $('#kpr-usb-test'); if (test) test.disabled = false;
    });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-action="printer-connect"]');
    if (t) { e.preventDefault(); openSetup(); }
  });

  /* Re-attach an already-granted USB printer as soon as the till loads, so the
   * first receipt of the day prints without anyone opening this panel. */
  try { reconnectUsb(); } catch (_) {}

  window.KiwiPrinter = {
    getConfig: getConfig, setConfig: setConfig, isConfigured: isConfigured, isConnected: isConnected,
    ping: ping, printBytes: printBytes,
    connectBluetooth: connectBluetooth, disconnectBluetooth: disconnectBluetooth, btConnected: btConnected,
    connectUsb: connectUsb, disconnectUsb: disconnectUsb, usbConnected: usbConnected, usbSupported: usbSupported,
    reconnectUsb: reconnectUsb,
    printReceipt: printReceipt, printKitchen: printKitchen, printLabels: printLabels,
    // Le rapport de clôture. Contrairement aux trois au-dessus, celui-ci porte
    // son propre repli : une journée doit pouvoir se clôturer sans thermique.
    printDayReport: printDayReport, dayReportHTML: dayReportHTML,
    // Le repli « pilote du système » — même objet reçu que printReceipt.
    browserReceipt: browserReceipt, browserDayReport: browserDayReport,
    /* Le repli brut, pour un module qui peint SON propre ticket : le reçu de
     * caisse (assets/receipt.js) a sa mise en page et n'a besoin d'ici que la
     * mécanique — isoler le ticket dans la page, poser la largeur du rouleau,
     * ouvrir la boîte d'impression, nettoyer derrière. */
    browserPrintHTML: browserPrintHTML,
    // A function, not a snapshot: the port is only known after discovery.
    openSetup: openSetup, bridgeUrl: function () { return bridgeBase(); }, bridgePorts: BRIDGE_PORTS,
  };
})();
