/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · PRINTER BRIDGE CLIENT · window.KiwiPrinter
 * ---------------------------------------------------------------------------
 * The web half of real thermal printing. Detects the Kiwi Printer Bridge running
 * on the counter machine (bridge/server.js), lets the owner pair a printer
 * (IP · port · model · paper width · test slip), and relays ESC/POS jobs built by
 * assets/escpos.js to it. If the bridge isn't running, every print call returns
 * { ok:false, reason:'bridge-*' } so callers fail soft (KiwiHardware falls back
 * to its on-screen preview) · the exact pattern the caisse pairing uses.
 *
 * Transports, dans l'ordre : socket TCP natif · Web Bluetooth · WebUSB · pont
 * local 127.0.0.1 · RELAIS CLOUD (/api/print · l'iPad et les tablettes : la caisse dépose le
 * ticket, le pont du comptoir le récupère). Voir « transport D » plus bas.
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

  /* printer-transport:0 */
  var transports = window.__kiwiPrinterTransports({ getConfig: getConfig, setConfig: setConfig, currentMerchantKey: currentMerchantKey, ls: ls, set: set, fallbackNotice: fallbackNotice, noteBridgeState: noteBridgeState });
  var bridgeBase = transports.bridgeBase;
  var withTimeout = transports.withTimeout;
  var bridgeHeaders = transports.bridgeHeaders;
  var bridgeTarget = transports.bridgeTarget;
  var saveBridgeTarget = transports.saveBridgeTarget;
  var pairLocalBridge = transports.pairLocalBridge;
  var pingPort = transports.pingPort;
  var ping = transports.ping;
  var btConnected = transports.btConnected;
  var connectBluetooth = transports.connectBluetooth;
  var disconnectBluetooth = transports.disconnectBluetooth;
  var btWrite = transports.btWrite;
  var usbSupported = transports.usbSupported;
  var usbConnected = transports.usbConnected;
  var usbPickEndpoint = transports.usbPickEndpoint;
  var connectUsb = transports.connectUsb;
  var reconnectUsb = transports.reconnectUsb;
  var disconnectUsb = transports.disconnectUsb;
  var usbWrite = transports.usbWrite;
  var nativeSocket = transports.nativeSocket;
  var nativeSocketTarget = transports.nativeSocketTarget;
  var printQueueIdle = transports.printQueueIdle;
  var discoveryNotice = transports.discoveryNotice;
  var maybeDiscoverNativePrinter = transports.maybeDiscoverNativePrinter;
  var noteNativeFailure = transports.noteNativeFailure;
  var nativeSocketSend = transports.nativeSocketSend;
  var nativeSocketFirst = transports.nativeSocketFirst;
  var bridgePrintBytes = transports.bridgePrintBytes;
  var viaRelayOrFail = transports.viaRelayOrFail;
  var bridgePrintNow = transports.bridgePrintNow;
  var relayMerchantQS = transports.relayMerchantQS;
  var relayFetch = transports.relayFetch;
  var relayProbe = transports.relayProbe;
  var relayClientRef = transports.relayClientRef;
  var relayTargetOf = transports.relayTargetOf;
  var watchRelayJob = transports.watchRelayJob;
  var relayEnqueue = transports.relayEnqueue;
  var relayPairCode = transports.relayPairCode;
  var relayRevoke = transports.relayRevoke;
  var relayKind = transports.relayKind;
  var wakeViaRelay = transports.wakeViaRelay;
  var wakePrinter = transports.wakePrinter;
  var BRIDGE_PORTS = transports.BRIDGE_PORTS;
  var bt = transports.bt;
  var usb = transports.usb;
  var BRIDGE_DOWNLOAD = '/printer';
  var CFG_KEY = 'kiwiPrinterCfg';
  /* printer-transport:1 */
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
   * which is what KiwiEscPos emits · the field is a label for the owner, not a
   * driver, so an unlisted make that speaks ESC/POS works on "Générique".
   * `note` carries a real caveat shown under the picker when that make is
   * chosen.
   *
   * The model families in the labels are the ones actually on sale in Morocco,
   * taken from the catalogues of Moroccan POS vendors (fournipro.ma, iris.ma,
   * lepc.ma, posmaroc.ma) rather than from a manufacturer's world range · a
   * merchant recognises the box on their counter, not the global SKU list.
   *
   * `driver` is the make's own driver/support page, and it is a FALLBACK, not
   * the happy path: over Bluetooth, USB or the bridge, Kiwi pushes ESC/POS
   * bytes itself and no driver is involved at all. It matters in exactly two
   * places · printing labels through the browser/Windows driver route (see
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
     * page de téléchargement officielle joignable · d'où l'absence de lien. */
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
    /* First Kiwi client's hardware · et pas un cas isolé : posmaroc.ma vend
     * toute la gamme (WD8260, WD8210, WD9800, WD980, tiroir WD0408), donc
     * c'est le distributeur à indiquer plutôt qu'un site constructeur.
     * WD8260 (reçus, 80 mm, USB + LAN) déclare "Command Support: ESC/POS" sur
     * sa plaque, donc il marche tel quel, tiroir 24 V compris. WD8210
     * (étiquettes, 110 mm, USB + Bluetooth) ne déclare PAS son langage :
     * beaucoup d'imprimantes d'étiquettes parlent TSPL et non ESC/POS.
     * À vérifier par un ticket test avant de compter dessus. */
    { id: 'wdlink', label: 'WDLink (WD8260 / WD8210)', note: 'WD8260 (reçus, 80 mm) : ESC/POS confirmé sur la plaque, rien à régler. WD8210 (étiquettes, 110 mm) : le langage n\'est pas indiqué · beaucoup d\'imprimantes d\'étiquettes parlent TSPL. Faites un ticket test avant la mise en service.',
      driver: 'https://posmaroc.ma/' },
    { id: 'star', label: 'Star', note: 'Les Star impriment en mode Star Line, pas en ESC/POS. Activez l\'émulation ESC/POS sur l\'imprimante, sinon le ticket sortira illisible.',
      driver: 'https://starmicronics.com/support/downloads/' },
    /* Listé pour DIRE qu'on ne le pilote pas. Zebra est la marque d'étiquettes
     * la plus vendue au Maroc (ZQ220 / ZQ310 / ZQ320 chez lepc.ma, posmaroc.ma,
     * fournipro.ma, iris.ma) et elle parle ZPL, pas ESC/POS. Sans cette entrée
     * le commerçant choisit « Générique » et sort une étiquette illisible sans
     * comprendre pourquoi : l'avertissement vaut mieux que le silence. */
    { id: 'zebra', label: 'Zebra (ZQ / ZD) · étiquettes', note: 'Les Zebra parlent ZPL, pas ESC/POS : Kiwi ne peut pas les piloter directement en Bluetooth ni en USB. Pour vos étiquettes, installez le pilote Zebra sur la caisse et utilisez le bouton « Imprimer » (impression navigateur).',
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

  /* ── Station-based printer routing (per-tenant) ────────────────────────────
   * Enables the cashier app to bind physical printers to specific stations
   * (Caisse for client receipts, Cuisine, Bar, etc. for production tickets). */
  var STATION_PRINTERS_PREFIX = 'kiwiStationPrinters:';

  function currentMerchantKey() {
    var m = '';
    try {
      if (window.KiwiKitchenRelay && typeof KiwiKitchenRelay.merchant === 'function') {
        m = KiwiKitchenRelay.merchant() || '';
      }
      if (!m) {
        var pv = JSON.parse(ls('kiwiPairedVenue') || 'null');
        if (pv && (pv.merchant || pv.venueId)) m = pv.merchant || pv.venueId;
      }
      if (!m && ls('kiwiPaired') === '1') {
        m = ls('kiwiLiveMerchant') || '';
      }
    } catch (_) {}
    return m || 'unpaired';
  }

  function stationStorageKey(merchant) {
    return STATION_PRINTERS_PREFIX + (merchant || currentMerchantKey());
  }

  function getStationConfig(merchant) {
    var d = { profiles: [], bindings: {} };
    try {
      var raw = ls(stationStorageKey(merchant));
      if (!raw && (!merchant || merchant === currentMerchantKey())) {
        raw = ls('kiwiStationPrinters');
      }
      var o = JSON.parse(raw || '{}');
      if (o && typeof o === 'object') {
        d.profiles = Array.isArray(o.profiles) ? o.profiles : [];
        d.bindings = (o.bindings && typeof o.bindings === 'object') ? o.bindings : {};
      }
      return d;
    } catch (_) {
      return d;
    }
  }

  function setStationConfig(cfg, merchant) {
    cfg = cfg || {};
    var profiles = Array.isArray(cfg.profiles) ? cfg.profiles : [];
    var bindings = (cfg.bindings && typeof cfg.bindings === 'object') ? cfg.bindings : {};
    var data = { profiles: profiles, bindings: bindings, updatedAt: Date.now() };
    set(stationStorageKey(merchant), JSON.stringify(data));
    try { window.dispatchEvent(new CustomEvent('kiwi:station-printers-config', { detail: data })); } catch (_) {}
    return data;
  }

  function getPrepStations() {
    try {
      if (typeof window.KiwiCaisseStations === 'function') {
        var cs = window.KiwiCaisseStations();
        if (Array.isArray(cs) && cs.length) return cs;
      }
      if (typeof window.kdsStations === 'function') {
        var ks = window.kdsStations();
        if (Array.isArray(ks) && ks.length) return ks;
      }
      if (window.KiwiMenuStore && typeof window.KiwiMenuStore.stations === 'function') {
        var ms = window.KiwiMenuStore.stations();
        if (Array.isArray(ms) && ms.length) return ms;
      }
      var m = currentMerchantKey();
      if (m && m !== 'unpaired') {
        var raw = ls('kiwi:menuMirror:v1:' + m);
        if (raw) {
          var doc = JSON.parse(raw);
          if (doc && Array.isArray(doc.stations) && doc.stations.length) return doc.stations;
        }
      }
    } catch (_) {}
    return [
      { id: 'cuisson', name: 'Cuisine' },
      { id: 'bar', name: 'Bar cocktails' },
    ];
  }

  /* The comparison key of a station or profile name: lower-case letters and
     digits of ANY script. Stripping to [a-z0-9] turned an Arabic name into the
     empty string, and an empty key is "contained" in every other key, so one
     Arabic-named printer profile caught every station of the till. A name with
     no letter or digit at all keeps its trimmed text as its key. */
  function stationKey(name) {
    var norm = String(name == null ? '' : name).toLowerCase().trim();
    var clean;
    try { clean = norm.replace(/[^\p{L}\p{N}]/gu, ''); } catch (_) { clean = norm.replace(/[^a-z0-9\u0600-\u06ff]/g, ''); }
    return { norm: norm, clean: clean || norm };
  }
  function resolveStationTarget(stationId, merchant) {
    var sc = getStationConfig(merchant);
    var profId = (sc.bindings && sc.bindings[stationId]) || '';
    if (!profId && stationId) {
      var want = stationKey(stationId);
      var norm = want.norm, normClean = want.clean;
      var bKeys = Object.keys(sc.bindings || {});
      for (var i = 0; i < bKeys.length; i++) {
        var k = bKeys[i];
        var kKey = stationKey(k);
        if (kKey.norm === norm || kKey.clean === normClean) {
          profId = sc.bindings[k];
          break;
        }
      }
      if (!profId && Array.isArray(sc.profiles)) {
        var pMatch = sc.profiles.find(function (p) {
          if (!p || !p.name) return false;
          var pKey = stationKey(p.name);
          var pClean = pKey.clean;
          return pKey.norm === norm || pClean === normClean
            || (!!pClean && !!normClean && (normClean.indexOf(pClean) >= 0 || pClean.indexOf(normClean) >= 0));
        });
        if (pMatch) return pMatch;
      }
    }
    if (!profId && stationId !== 'caisse') {
      profId = (sc.bindings && sc.bindings.caisse) || '';
    }
    if (!profId) return null;
    var prof = (sc.profiles || []).find(function (p) { return p && p.id === profId; });
    return prof || null;
  }

  function hasStationBindings(merchant) {
    var sc = getStationConfig(merchant);
    return !!((sc.profiles && sc.profiles.length) || Object.keys(sc.bindings || {}).length);
  }

  /* `osPrinter` is the name of a printer the till ALREADY has installed, printed
   * to through the bridge's spooler route. It is the answer for the commonest
   * shop setup · a USB thermal printer on a Windows caisse · where Bluetooth,
   * WebUSB and the network path all fail at once (Windows owns the USB device,
   * and a USB printer has no IP). */
  function getConfig() {
    var d = { ip: '', port: 9100, osPrinter: '', model: 'escpos', paper: '80', label: { w: 50, h: 20 } };
    try { var o = JSON.parse(ls(CFG_KEY) || '{}') || {}; return Object.assign(d, o); } catch (_) { return d; }
  }
  function setConfig(cfg) {
    set(CFG_KEY, JSON.stringify(Object.assign(getConfig(), cfg || {})));
    try { window.dispatchEvent(new CustomEvent('kiwi:printer-config')); } catch (_) {}
  }
  function isConfigured() { var c = getConfig(); return !!(c.ip || c.osPrinter || hasStationBindings()); }

  /* printer-transport:2 */
  /* Un ticket dont l'encodeur n'a pas pu dessiner l'arabe (pas de canvas sur
     cet appareil) sortirait en « ????? » : en cuisine, un bon illisible envoie
     un autre plat. On ne l'envoie pas. Le résultat le dit (reason), la file
     cuisine le garde en erreur visible, le reçu passe au repli système (qui,
     lui, sait écrire l'arabe), et l'avis s'affiche une seule fois. */
  var ARABIC_LOST = 'Impression arrêtée · cet appareil ne sait pas dessiner l’arabe de ce ticket. Rien n’est sorti en « ? ».';
  function refuseUnsupported(bytes) {
    var lost = window.KiwiEscPos && window.KiwiEscPos.unsupportedLines ? window.KiwiEscPos.unsupportedLines(bytes) : 0;
    if (!lost) return null;
    if (!bytes.unsupportedNoticed) {
      try { bytes.unsupportedNoticed = true; } catch (_) {}
      fallbackNotice(say(ARABIC_LOST));
    }
    return Promise.resolve({ ok: false, reason: 'text-not-drawable', lines: lost });
  }

  /* Imprime directement sur un profil ou une cible donnée ({ type, ip, port, osPrinter }). */
  function printBytesToTarget(bytes, target, ref) {
    var refused = refuseUnsupported(bytes);
    if (refused) return refused;
    if (!target) return printBytes(bytes);
    var type = target.type || (target.ip ? 'ip' : target.osPrinter ? 'os' : '');
    if (type === 'bt') {
      if (!btConnected()) return Promise.resolve({ ok: false, reason: 'bt-not-connected' });
      return btWrite(bytes).then(function () { return { ok: true, via: 'bluetooth', bytes: bytes.length }; });
    }
    if (type === 'usb') {
      if (!usbConnected()) return Promise.resolve({ ok: false, reason: 'usb-not-connected' });
      return usbWrite(bytes).then(function () { return { ok: true, via: 'usb', bytes: bytes.length }; });
    }
    if (type === 'os' || target.osPrinter) {
      return bridgePrintBytes(bytes, { osPrinter: target.osPrinter || target.name }, ref);
    }
    if (type === 'ip' || target.ip) {
      var networkTarget = { ip: target.ip, port: Number(target.port) || 9100 };
      return nativeSocketFirst(bytes, networkTarget, function () { return bridgePrintBytes(bytes, networkTarget, ref); });
    }
    return printBytes(bytes);
  }

  // Route ESC/POS bytes to whichever printer is live: Bluetooth, then USB, then
  // the network bridge. Callers fail soft when this resolves { ok:false }.
  function printBytes(bytes, targetOrStation) {
    if (!window.KiwiEscPos) return Promise.resolve({ ok: false, reason: 'no-encoder' });
    var refused = refuseUnsupported(bytes);
    if (refused) return refused;
    if (typeof targetOrStation === 'string') {
      var t = resolveStationTarget(targetOrStation);
      if (t) return printBytesToTarget(bytes, t);
    } else if (targetOrStation && typeof targetOrStation === 'object') {
      if (targetOrStation.station) {
        var t2 = resolveStationTarget(targetOrStation.station, targetOrStation.merchant);
        if (t2) return printBytesToTarget(bytes, t2);
      } else if (targetOrStation.ip || targetOrStation.osPrinter || targetOrStation.type) {
        return printBytesToTarget(bytes, targetOrStation);
      }
    }
    function viaBridge() { return bridgePrintBytes(bytes); }
    function viaUsb() {
      if (!usbConnected()) return viaBridge();
      return usbWrite(bytes).then(
        function () { return { ok: true, via: 'usb', bytes: bytes.length }; },
        /* A stale WebUSB grant must not prevent the configured network/OS
           printer from receiving the same job. */
        viaBridge);
    }
    function viaWebTransports() {
      if (!btConnected()) return viaUsb();
      return btWrite(bytes).then(
        function () { return { ok: true, via: 'bluetooth', bytes: bytes.length }; },
        /* Bluetooth can disconnect between isConnected() and the first chunk.
           Continue down the declared transport order instead of failing early. */
        viaUsb);
    }
    return nativeSocketFirst(bytes, null, viaWebTransports);
  }

  // A printer is "connected" if Bluetooth or USB is live, OR the bridge is set up, OR a station is bound.
  function isConnected() { return btConnected() || usbConnected() || isConfigured() || hasStationBindings(); }

  function printReceipt(o, options) {
    if (!window.KiwiEscPos) return Promise.resolve({ ok: false, reason: 'no-encoder' });
    var target = resolveStationTarget('caisse', options && options.merchant);
    var paper = (target && target.paper) || withPaper(o).paper;
    var bytes = window.KiwiEscPos.receipt(Object.assign({}, o, { paper: paper }));
    var refused = refuseUnsupported(bytes);
    if (refused) return refused;
    if (target) {
      return printBytesToTarget(bytes, target).then(function (res) {
        if (res && (res.ok || res.uncertain)) return res;
        return printBytes(bytes);
      }, function () {
        return printBytes(bytes);
      });
    }
    return printBytes(bytes);
  }

  /* La caisse n'a PAS window.Kiwi.toast (vérifié sur prod) : l'avis de repli
   * doit se suffire à lui-même, sinon il est muet sur la seule surface où il
   * compte · le comptoir qui doit savoir qu'un bon cuisine est sorti chez lui. */
  /* Ce module écrit en français et laisse la caisse traduire : son balayage
   * (assets/caisse-lang.js) relit tout ce qui entre dans la page, mais après
   * coup. Une question peinte à la volée (« Dissocier ce pont ? ») passe donc
   * au même dictionnaire nous-mêmes, pour ne jamais s'afficher d'abord en
   * français. Sans caisse-lang.js, le français reste. */
  function say(fr) {
    try {
      if (window.KiwiCaisseLang && window.KiwiCaisseLang.tr) return window.KiwiCaisseLang.tr(fr);
      /* Le tableau de bord n'a pas caisse-lang.js : la fenêtre y prend ses mots
       * dans assets/printer/pairing-lang.js, la même traduction en petit. */
      return window.KiwiPrinterLang ? window.KiwiPrinterLang.tr(fr) : fr;
    } catch (_) { return fr; }
  }

  function fallbackNotice(msg) {
    try {
      if (window.Kiwi && window.Kiwi.toast) { window.Kiwi.toast(msg); return; }
      var el = document.createElement('div');
      el.textContent = msg;
      el.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#0A0F0D;color:#F7F5F0;padding:10px 18px;border-radius:10px;z-index:99999;font-size:14px;box-shadow:0 6px 24px rgba(0,0,0,.35);';
      document.body.appendChild(el);
      setTimeout(function () { try { el.remove(); } catch (_) {} }, 4500);
    } catch (_) {}
  }

  function printKitchen(o, options) {
    if (!window.KiwiEscPos) return Promise.resolve({ ok: false, reason: 'no-encoder' });
    var stationId = (options && options.station) || (o && o.station) || '';
    var target = stationId ? resolveStationTarget(stationId, options && options.merchant) : resolveStationTarget('cuisson', options && options.merchant);
    var paper = (target && target.paper) || withPaper(o).paper;
    var bytes = window.KiwiEscPos.kitchenTicket(Object.assign({}, o, { paper: paper }));
    var refusedK = refuseUnsupported(bytes);
    if (refusedK) return refusedK;
    /* La file durable nous donne l'identifiant stable du travail : il devient la
       clé d'idempotence du relais. Le repli caisse imprime un AUTRE papier sur
       une AUTRE imprimante — il porte donc sa propre clé, sinon le serveur le
       confondrait avec le dépôt qui vient d'échouer. */
    var ref = (options && options.clientRef) || '';
    if (target) {
      return printBytesToTarget(bytes, target, ref).then(function (res) {
        if (res && (res.ok || res.uncertain)) return res;
        // Fail-soft fallback: attempt printing to caisse target or default printer
        var caisseTarget = resolveStationTarget('caisse', options && options.merchant);
        var stName = (o && o.title) || stationId || 'cuisine';
        fallbackNotice('Imprimante ' + stName + ' indisponible · ticket imprimé à la caisse');
        return printBytesToTarget(bytes, caisseTarget || null, ref ? ref + '.fb' : '').then(function (cRes) {
          if (cRes && cRes.ok) return Object.assign({}, cRes, { fallback: true, originalReason: res && res.reason });
          return printBytes(bytes);
        }, function () {
          return printBytes(bytes);
        });
      }, function (err) {
        var caisseTarget = resolveStationTarget('caisse', options && options.merchant);
        var stName = (o && o.title) || stationId || 'cuisine';
        fallbackNotice('Imprimante ' + stName + ' indisponible · ticket imprimé à la caisse');
        return printBytesToTarget(bytes, caisseTarget || null, ref ? ref + '.fb' : '').then(function (cRes) {
          if (cRes && cRes.ok) return Object.assign({}, cRes, { fallback: true, originalReason: err && err.message });
          return printBytes(bytes);
        }, function () {
          return printBytes(bytes);
        });
      });
    }
    return printBytes(bytes);
  }

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
    return printBytes(all, 'caisse');
  }
  function withPaper(o) { o = o || {}; if (!o.paper) o.paper = getConfig().paper; return o; }

  /* ── transport D : le pilote du système, via la boîte d'impression ──────────
   * Les trois transports au-dessus (Bluetooth, USB, pont) poussent de l'ESC/POS
   * et exigent que Kiwi PARLE à l'imprimante. Sur une caisse Windows où
   * l'imprimante est déjà installée, c'est justement impossible : Windows
   * possède le périphérique, WebUSB se voit refuser le claim (« Imprimante déjà
   * utilisée par le système ») et il n'y a ni Bluetooth ni pont. L'imprimante
   * marche pourtant très bien · pour tout le reste de Windows.
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
   * Windows qui l'imprime · sinon deux exemplaires du même jour n'ont pas la
   * même tête et plus personne ne sait lequel fait foi. L'ordre des blocs,
   * les libellés et les totaux suivent donc ligne pour ligne l'encodeur. */
  function dayReportHTML(o) {
    o = withPaper(o || {});
    var r = o.report || {};
    var f = o.fmt || function (n) { return (Math.sign((+n || 0)) * Math.round(Number(Math.abs((+n || 0)).toExponential().replace(/e(.+)$/, (_, e) => 'e' + (+e + 2)))) / 100).toFixed(2); };
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
    if (o.copy) out.push('<div class="kpr-c kpr-copy">· ' + esc(o.copy) + ' ·</div>');
    rule();

    if (o.openedLabel) R('Ouverture', o.openedLabel);
    if (o.closedLabel) R('Fermeture', o.closedLabel);
    if (r.openedBy) R('Ouvert par', r.openedBy);
    if (r.closedBy) R('Fermé par', r.closedBy);
    rule();

    /* Le mode « ventes par article » suit l'encodeur ESC/POS coupe pour coupe
       (KiwiEscPos.dayReport, même drapeau) : sans ça, demander le détail article
       sur une imprimante pilotée par le système sortait un Z complet · net et
       tiroir compris · au lieu du petit ticket demandé. */
    var itemsOnly = !!o.itemsOnly;

    if (!itemsOnly) {
    R('Transactions', String(r.txns || 0));
    /* Le titre suit ce que le chiffre contient. Dès qu'une créance pèse dedans
       · une livraison partie en compte, un règlement à crédit ·, « ENCAISSÉ »
       est faux : l'écran de clôture les exclut déjà de son propre total, et le
       Z imprimait un nombre plus grand sous le même intitulé. Deux documents du
       même service, deux totaux. On annonce donc FACTURÉ, on retranche la
       créance, on redonne l'encaissé réel. Sans créance, pas un octet ne change
       · les autres métiers impriment à l'identique. */
    var recv = +r.receivable || 0;
    /* Le remboursement remonte AU-DESSUS du total · voir KiwiEscPos.dayReport :
       listé après, il laissait le total contredire son propre détail du montant
       exact des remboursements. Les deux encodeurs impriment le même Z. */
    var refundAmt = (r.refunds && r.refunds.count) ? (+r.refunds.amount || 0) : 0;
    var collected = Math.round((r.gross - refundAmt) * 100) / 100;
    if (refundAmt) {
      R('Ventes brutes', money(r.gross));
      R('Remboursements (' + r.refunds.count + ')', '- ' + money(refundAmt));
    }
    R(recv > 0 ? 'TOTAL FACTURÉ' : 'TOTAL ENCAISSÉ', money(collected), 'kpr-b');
    var M = o.methodLabels || {};
    Object.keys(r.methods || {}).forEach(function (k) {
      if (!r.methods[k]) return;
      R('  ' + (M[k] || k), money(r.methods[k]));
    });
    if (recv > 0) {
      R('dont à recevoir', '- ' + money(recv));
      R('NET ENCAISSÉ', money(Math.round((collected - recv) * 100) / 100), 'kpr-b');
    }
    if (r.basket) R('Ticket moyen', money(r.basket));
    if (r.tips) R('Pourboires', money(r.tips));
    if (r.discounts && r.discounts.amount) R('Remises accordées', '- ' + money(r.discounts.amount));
    /* Ni l'un ni l'autre n'entre dans le total encaissé · ils sont imprimés
       parce qu'un avoir fait sortir de la marchandise sans faire sonner le
       tiroir, et qu'un Z muet là-dessus ne se relit pas. */
    if (r.avoirs && r.avoirs.used) R('Réglé en avoir (' + (r.avoirs.usedCount || 0) + ')', money(r.avoirs.used));
    if (r.avoirs && r.avoirs.issued) R('Avoirs émis (' + (r.avoirs.issuedCount || 0) + ')', money(r.avoirs.issued));
    if (r.acomptes && r.acomptes.received) R('Acomptes reçus', money(r.acomptes.received));
    if (r.acomptes && r.acomptes.outstanding) R('Soldes restant à régler', money(r.acomptes.outstanding));
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

    var card = r.cardReconciliation || {};
    rule();
    out.push('<div class="kpr-c kpr-b">' + esc(o.cardTitle || 'RAPPROCHEMENT CARTE') + '</div>');
    R('Kiwi', money(card.kiwi != null ? card.kiwi : (r.methods && r.methods.card)));
    if (card.terminal == null) {
      R('Z terminal', o.notEntered || 'non saisi');
    } else {
      R('Z terminal', money(card.terminal));
      var cg = +card.gap || 0;
      R('RÉSULTAT', cg === 0 ? (o.cardMatched || 'RAPPROCHÉ')
        : (cg > 0 ? 'TERMINAL + ' : 'KIWI + ') + money(Math.abs(cg)), 'kpr-b');
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
        'html,body{margin:0!important;padding:0!important;background:#fff!important;color:#000!important;color-scheme:light!important;}' +
        /* Tout le reste de la caisse disparaît : sans ça la boîte d'impression
         * sort la page entière (grille produits, panneaux) au lieu du reçu. */
        'body>*:not(#kpr-print-root){display:none!important;}' +
        '#kpr-print-root{display:block!important;position:static!important;background:#fff!important;color:#000!important;color-scheme:light!important;}' +
        /* Some verticals build their browser fallback from their on-screen
         * preview markup. Those components normally inherit the caisse theme;
         * printing must sever that inheritance at the last possible layer so
         * a stale or missing skin stylesheet can never produce a black ticket. */
        '#kpr-print-root .px-print,#kpr-print-root .px-receipt,#kpr-print-root .px-tag,' +
        '#kpr-print-root .ff-receipt,#kpr-print-root .ht-facture,#kpr-print-root .lb-receipt,' +
        '#kpr-print-root .ph-receipt,#kpr-print-root .fl-receipt,#kpr-print-root .fl-card-preview,' +
        '#kpr-print-root .bq-avoir,#kpr-print-root .ho-slip{' +
          'background:#fff!important;color:#000!important;color-scheme:light!important;box-shadow:none!important;' +
          '--paper:#fff;--paper-elev:#fff;--paper-soft:#fff;--paper-mute:#f4f6f4;--cream:#fff;--surface:#fff;' +
          '--ink:#000;--ink-2:#202020;--ink-3:#404040;--ink-4:#606060;--line:#aaa;--line-soft:#ddd;' +
        '}' +
        '#kpr-print-root .px-receipt *,#kpr-print-root .px-tag *{color:#000!important;opacity:1!important;}' +
        '#kpr-print-root .px-receipt hr{border-color:#000!important;}' +
        '#kpr-print-root .px-tag::before,#kpr-print-root .bq-avoir::before{background:#fff!important;border-color:#000!important;}' +
        '.kpr-ticket{width:' + (w - 6) + 'mm;margin:0 auto;padding:3mm 0;color:#000;' +
          'font-family:var(--mono,ui-monospace,"JetBrains Mono",Menlo,Consolas,monospace);font-size:9pt;line-height:1.45;}' +
        '.kpr-shop{text-align:center;font-weight:700;font-size:14pt;margin-bottom:2mm;}' +
        '.kpr-c{text-align:center;}' +
        '.kpr-rule{border-top:1px dashed #000;margin:2mm 0;}' +
        '.kpr-r{display:flex;justify-content:space-between;gap:3mm;}' +
        '.kpr-r>span:last-child{white-space:nowrap;}' +
        '.kpr-tot{font-weight:700;font-size:12pt;margin:1mm 0;}' +
        '.kpr-foot{margin-top:3mm;}' +
        /* Rapport journalier · le titre sous l'enseigne, la mention de copie,
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
         * de page au milieu · sur une imprimante à feuilles, un rayon dont le
         * total atterrit seul sur la page suivante est illisible. */
        '.kpr-r{break-inside:avoid;}' +
      '}';
    document.head.appendChild(st);
  }

  /* Repeint et ouvre la boîte d'impression. Le root est retiré après coup pour
   * ne pas laisser un reçu fantôme dans le DOM de la caisse. */
  function systemPrintVia() {
    return window.KiwiApiBase && window.KiwiApiBase.native ? 'pdf' : 'browser';
  }
  function browserPrintHTML(html, paper, title) {
    var root = document.getElementById('kpr-print-root');
    if (root) root.remove();
    root = document.createElement('div');
    root.id = 'kpr-print-root';
    // Names the PDF in the app (native-runtime.js) and the job on the web.
    if (title) root.setAttribute('data-print-title', title);
    root.innerHTML = html;
    document.body.appendChild(root);
    ensureReceiptPrintCss(paper);
    setTimeout(function () {
      try { window.print(); } catch (_) {}
      setTimeout(function () { var r = document.getElementById('kpr-print-root'); if (r) r.remove(); }, 600);
    }, 60);
    /* Dans l'app, window.print() rend un PDF à imprimer ou partager
     * (native-runtime.js) : pas un « envoi au pilote système ». */
    return { ok: true, via: systemPrintVia() };
  }
  function browserReceipt(o) {
    o = withPaper(o || {});
    return browserPrintHTML(receiptHTML(o), o.paper, 'Recu' + (o.ref ? ' ' + o.ref : ''));
  }
  function browserDayReport(o) {
    o = withPaper(o || {});
    return browserPrintHTML(dayReportHTML(o), o.paper, 'Rapport journalier' + (o.date ? ' ' + o.date : ''));
  }

  /* printDayReport · la voie nominale, avec le repli qui compte.
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

  // One in-flight load, shared by idle warming and every public UI entry.
  var pairingLoad = null;
  var pairingUi = null;
  var bridgeStateListeners = [];
  function noteBridgeState() {
    bridgeStateListeners.forEach(function (fn) { try { fn(transports.bridgeMode, transports.bridgeCapability); } catch (_) {} });
  }
  var pairingCore = Object.freeze({
    BRIDGE_DOWNLOAD: BRIDGE_DOWNLOAD,
    MODELS: MODELS,
    bridgeBase: bridgeBase,
    bridgeHeaders: bridgeHeaders,
    bridgePrintBytes: bridgePrintBytes,
    bt: bt,
    btConnected: btConnected,
    connectBluetooth: connectBluetooth,
    connectUsb: connectUsb,
    esc: esc,
    fallbackNotice: fallbackNotice,
    getConfig: getConfig,
    getPrepStations: getPrepStations,
    getStationConfig: getStationConfig,
    labelOptions: labelOptions,
    modelDriver: modelDriver,
    modelNote: modelNote,
    nativeSocket: nativeSocket,
    nativeSocketSend: nativeSocketSend,
    pairLocalBridge: pairLocalBridge,
    paperOptions: paperOptions,
    ping: ping,
    printBytes: printBytes,
    printBytesToTarget: printBytesToTarget,
    printQueueIdle: printQueueIdle,
    reconnectUsb: reconnectUsb,
    relayPairCode: relayPairCode,
    relayProbe: relayProbe,
    relayFetch: relayFetch, relayMerchantQS: relayMerchantQS,
    relayRevoke: relayRevoke,
    saveBridgeTarget: saveBridgeTarget,
    say: say,
    setConfig: setConfig,
    setStationConfig: setStationConfig,
    usb: usb,
    usbConnected: usbConnected,
    usbSupported: usbSupported,
    withTimeout: withTimeout,
    bridgeState: function () { return { mode: transports.bridgeMode, capability: transports.bridgeCapability }; },
    onBridgeState: function (fn) { bridgeStateListeners.push(fn); },
    install: function (ui) { pairingUi = ui; },
  });
  function loadPairingUi() {
    if (pairingUi) return Promise.resolve();
    if (pairingLoad) return pairingLoad;
    pairingLoad = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = '/assets/printer/pairing-ui.js?v=7';
      function failed() {
        pairingLoad = null;
        script.remove();
        reject(new Error('printer-pairing-ui'));
      }
      script.onload = function () { if (pairingUi) resolve(); else failed(); };
      script.onerror = failed;
      document.head.appendChild(script);
    });
    return pairingLoad;
  }
  /* Sans caisse-lang.js (le tableau de bord), les mots de la fenêtre arrivent
   * avec elle. Un échec de chargement laisse la fenêtre en français, jamais fermée. */
  var langLoad = null;
  function loadPrinterLang() {
    if (window.KiwiCaisseLang || window.KiwiPrinterLang) return Promise.resolve();
    if (langLoad) return langLoad;
    langLoad = new Promise(function (resolve) {
      var script = document.createElement('script');
      script.src = '/assets/printer/pairing-lang.js?v=2';
      script.onload = function () { resolve(); };
      script.onerror = function () { langLoad = null; script.remove(); resolve(); };
      document.head.appendChild(script);
    });
    return langLoad;
  }
  function translateSetup(result) {
    try {
      if (!window.KiwiCaisseLang && window.KiwiPrinterLang) window.KiwiPrinterLang.watch(document.getElementById('kpr-ov'));
    } catch (_) {}
    return result;
  }
  function openSetup(context) {
    if (pairingUi && (window.KiwiCaisseLang || window.KiwiPrinterLang)) return translateSetup(pairingUi.openSetup(context));
    return Promise.all([loadPairingUi(), loadPrinterLang()]).then(function () { return translateSetup(pairingUi.openSetup(context)); }, function () {
      fallbackNotice(say('Impossible de charger les réglages de l’imprimante. Réessayez.'));
    });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-action="printer-connect"]');
    if (t) { e.preventDefault(); openSetup(); }
  });
  window.addEventListener('kiwi:kitchen-print-status', maybeDiscoverNativePrinter);
  window.addEventListener('kiwi:printer-discovery', function (event) {
    var d = event.detail || {};
    if (d.reason === 'local-network-denied') fallbackNotice('Réseau local refusé. Kiwi garde la dernière adresse. Ouvrez Réglages > Kiwi Pro > Réseau local.');
    else if (d.reason === 'multiple-printers') fallbackNotice('Plusieurs imprimantes ont répondu. Ouvrez Imprimante et choisissez la bonne adresse.');
    else if (d.changed) fallbackNotice('Imprimante retrouvée sur ' + d.ip + '. La file reprend automatiquement.');
  });

  try { reconnectUsb(); } catch (_) {}

  window.KiwiPrinter = {
    getConfig: getConfig, setConfig: setConfig, isConfigured: isConfigured, isConnected: isConnected,
    ping: ping, printBytes: printBytes, printBytesToTarget: printBytesToTarget,
    getStationConfig: getStationConfig, setStationConfig: setStationConfig,
    hasStationBindings: hasStationBindings, resolveStationTarget: resolveStationTarget,
    getPrepStations: getPrepStations,
    connectBluetooth: connectBluetooth, disconnectBluetooth: disconnectBluetooth, btConnected: btConnected,
    connectUsb: connectUsb, disconnectUsb: disconnectUsb, usbConnected: usbConnected, usbSupported: usbSupported,
    reconnectUsb: reconnectUsb,
    nativeSocket: nativeSocket, nativeSocketSend: nativeSocketSend,
    discoverNativePrinter: maybeDiscoverNativePrinter,
    printReceipt: printReceipt, printKitchen: printKitchen, printLabels: printLabels,
    // son propre repli : une journée doit pouvoir se clôturer sans thermique.
    printDayReport: printDayReport, dayReportHTML: dayReportHTML,
    // Le repli « pilote du système » · même objet reçu que printReceipt.
    browserReceipt: browserReceipt, browserDayReport: browserDayReport,
    /* Le repli brut, pour un module qui peint SON propre ticket : le reçu de
     * caisse (assets/receipt.js) a sa mise en page et n'a besoin d'ici que la
     * mécanique · isoler le ticket dans la page, poser la largeur du rouleau,
     * ouvrir la boîte d'impression, nettoyer derrière. */
    browserPrintHTML: browserPrintHTML,
    // A function, not a snapshot: the port is only known after discovery.
    openSetup: openSetup, bridgeUrl: function () { return bridgeBase(); }, bridgePorts: BRIDGE_PORTS,
    // Le relais cloud · ce que l'iPad utilise à la place du pont local.
    relayProbe: relayProbe, relayEnqueue: relayEnqueue, relayPairCode: relayPairCode, relayRevoke: relayRevoke,
    relayPairLocal: pairLocalBridge,
    wake: wakePrinter, getLastTiming: function () { return transports.lastTiming; },
  };
  Object.defineProperty(window.KiwiPrinter, '__core', { value: pairingCore });
  try {
    var warmPairing = function () { try { loadPairingUi().catch(function () {}); } catch (_) {} };
    if (window.requestIdleCallback) window.requestIdleCallback(warmPairing);
    else setTimeout(warmPairing, 1500);
  } catch (_) {}
})();
