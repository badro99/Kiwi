/* Transports imprimante. Enregistrement inerte, initialisation par le noyau. */
(function () {
  'use strict';
  window.__kiwiPrinterTransports = function (core) {
  var getConfig = core.getConfig;
  var setConfig = core.setConfig;
  var currentMerchantKey = core.currentMerchantKey;
  var ls = core.ls;
  var set = core.set;
  var fallbackNotice = core.fallbackNotice;
  var noteBridgeState = core.noteBridgeState;
  /* transport-part:0 */
  /* The bridge's own port. 9110 is the default, but on a Windows till it is not
   * guaranteed free · and the bridge exits when the port is taken, which on
   * Windows means a console flash the owner never sees, then "pont non détecté"
   * with no way forward. So the shop can start it on another port
   * (KIWI_BRIDGE_PORT, see the .cmd on /printer) and we FIND it instead of
   * insisting on 9110. The winning port is remembered so later loads go straight
   * to it and we never scan again. */
  var BRIDGE_PORTS = [9110, 9111, 9112, 9113, 9114];
  var PORT_KEY = 'kiwiBridgePort';
  var bridgePort = 0;
  var bridgeCapability = '';
  var bridgeMode = 'unknown';
  var secureBridgeSeen = false;
  var SECURE_BRIDGE_KEY = 'kiwiBridgeCapabilityRequired';
  function bridgeBase(p) { return 'http://127.0.0.1:' + (p || bridgePort || BRIDGE_PORTS[0]); }
  var BRIDGE_URL = bridgeBase();   // kept for compatibility; prefer bridgeBase()
  /* /transport-part:0 */
  /* transport-part:1 */
  var lastTiming = null;
  var lastWakeAt = 0;
  var nativeFailureCount = 0;
  var nativeDiscoveryPending = false;
  var nativeDiscoveryRunning = false;

  /* /transport-part:1 */
  /* transport-part:2 */
  // ── bridge transport ───────────────────────────────────────────────────────
  function withTimeout(promise, ms) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, ms);
    return { signal: ctrl.signal, done: function () { clearTimeout(t); } };
  }

  function bridgeHeaders(extra) {
    var headers = Object.assign({}, extra || {});
    if (bridgeCapability) headers['X-Kiwi-Bridge-Capability'] = bridgeCapability;
    return headers;
  }

  function bridgeTarget(target) {
    var cfg = getConfig();
    if (target && target.osPrinter) return { osPrinter: String(target.osPrinter) };
    if (target && target.ip) return { ip: String(target.ip), port: Number(target.port) || 9100 };
    if (cfg.osPrinter) return { osPrinter: cfg.osPrinter };
    return cfg.ip ? { ip: cfg.ip, port: Number(cfg.port) || 9100 } : null;
  }

  function saveBridgeTarget(target) {
    var t = bridgeTarget(target);
    // Transition release: keep known, pre-capability installations printing.
    // This does not secure those old servers: upgrade them after these clients
    // are loaded. Never downgrade a bridge that advertised secure commands.
    if (t && bridgePort && bridgeMode === 'legacy') return Promise.resolve({ ok: true, legacy: true });
    if (!t || !bridgeCapability || !bridgePort) return Promise.resolve({ ok: false, error: 'bridge-capability-required' });
    var to = withTimeout(null, 6000);
    return fetch(bridgeBase() + '/kiwi/targets', {
      method: 'POST', headers: bridgeHeaders({ 'Content-Type': 'application/json' }), signal: to.signal,
      body: JSON.stringify({ action: 'save', target: t }),
    }).then(function (r) {
      to.done();
      return r.json().catch(function () { return {}; }).then(function (j) {
        return r.ok && j && j.ok ? j : { ok: false, error: j && j.error || 'bridge-capability-required' };
      });
    }).catch(function () { to.done(); return { ok: false, error: 'bridge-unreachable' }; });
  }

  function pairLocalBridge(code) {
    return ping().then(function (j) {
      if (!j) return { ok: false, error: 'bridge-unreachable' };
      if (bridgeMode !== 'legacy' && !bridgeCapability) return { ok: false, error: 'bridge-capability-required' };
      var to = withTimeout(null, 15000);
      return fetch(bridgeBase() + '/kiwi/relay/pair', {
        method: 'POST', headers: bridgeHeaders({ 'Content-Type': 'application/json' }),
        signal: to.signal, body: JSON.stringify({ code: code }),
      }).then(function (r) {
        to.done();
        return r.json().then(function (body) { return r.ok ? body : { ok: false, error: body && body.error || 'bridge-capability-required' }; });
      }).catch(function () { to.done(); return { ok: false, error: 'bridge-unreachable' }; });
    });
  }

  function pingPort(p, ms) {
    var to = withTimeout(null, ms || 1400);
    return fetch(bridgeBase(p) + '/kiwi/ping', { signal: to.signal, cache: 'no-store' })
      .then(function (r) { to.done(); return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.lastTiming) lastTiming = j.lastTiming;
        return (j && j.ok) ? j : null;
      })
      .catch(function () { to.done(); return null; });
  }

  /* Try the remembered port, then the rest of the range. Each miss is a refused
   * connection on loopback, which fails in about a millisecond, so a full scan
   * is imperceptible · and it only ever happens once per browser. */
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
      if (i >= order.length) { bridgePort = 0; bridgeCapability = ''; bridgeMode = 'unknown'; noteBridgeState(); return null; }
      var p = order[i++];
      return pingPort(p, i === 1 ? 1400 : 600).then(function (j) {
        if (!j) return step();
        // Bind the handshake to the selected bridge, never a previous port.
        bridgeCapability = /^kbc_[0-9a-f]{64}$/.test(j.capability || '') ? String(j.capability) : '';
        secureBridgeSeen = secureBridgeSeen || ls(SECURE_BRIDGE_KEY) === '1';
        var knownLegacy = j.name === 'kiwi-printer-bridge'
          && /^1\.(?:[0-3]\.\d+|4\.[0-4])$/.test(String(j.version || ''))
          && !Object.prototype.hasOwnProperty.call(j, 'capability') && !j.capabilityRequired;
        if (bridgeCapability || j.capabilityRequired) {
          secureBridgeSeen = true;
          set(SECURE_BRIDGE_KEY, '1');
        }
        bridgeMode = knownLegacy && !secureBridgeSeen ? 'legacy' : 'secure';
        noteBridgeState();
        bridgePort = p;
        BRIDGE_URL = bridgeBase(p);
        try { set(PORT_KEY, String(p)); } catch (_) {}
        return j;
      });
    }
    return step();
  }

  // ── transport A: Web Bluetooth (preferred · appless, no IP) ──────────────────
  // Cheap ESC/POS BLE printers expose varied GATT services, so we request broadly
  // and discover a writable characteristic after connecting. The browser shows its
  // own device picker (needs a user gesture). Chrome / Android / desktop Chrome ·
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
  // USB printers expose interface class 7 (printer) with a bulk OUT endpoint ·
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
   * cashier had to re-pick the printer every single morning · the permission was
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
        usb.device.releaseInterface(usb.iface).catch(function (err) {
          if (window.KiwiReportError) window.KiwiReportError(err, 'hardware:printer_usb_release_interface_failed');
        }).then(function () {
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

  /* ── transport E: socket TCP natif Capacitor ─────────────────────────────
   * Dans l'app, l'iPad et Android ouvrent directement le port ESC/POS de
   * l'imprimante. L'absence du plugin ou tout échec rend immédiatement la main
   * à la chaîne web existante, sans modifier son comportement. */
  function nativeSocket() {
    try {
      var cap = window.Capacitor;
      if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
      if (typeof cap.isPluginAvailable === 'function' && !cap.isPluginAvailable('KiwiPrinterSocket')) return null;
      var plugin = cap.Plugins && cap.Plugins.KiwiPrinterSocket;
      return plugin && typeof plugin.send === 'function' ? plugin : null;
    } catch (_) { return null; }
  }
  function nativeSocketTarget(target) {
    var cfg = getConfig();
    var t = target && target.ip ? target : (!target && cfg.ip ? cfg : null);
    return t ? { host: t.ip, port: Number(t.port) || 9100 } : null;
  }
  function printQueueIdle() {
    try { var q = window.KiwiKitchenPrint; return !(q && q.status && q.status().running); } catch (_) { return true; }
  }
  function discoveryNotice(detail) {
    try { window.dispatchEvent(new CustomEvent('kiwi:printer-discovery', { detail: detail || {} })); } catch (_) {}
  }
  function maybeDiscoverNativePrinter() {
    var plugin = nativeSocket(), cfg = getConfig();
    if (!nativeDiscoveryPending || nativeDiscoveryRunning || !printQueueIdle() || !plugin || !cfg.ip) return Promise.resolve(null);
    nativeDiscoveryRunning = true;
    return plugin.probe({ host: cfg.ip, port: Number(cfg.port) || 9100, timeoutMs: 1800 }).then(function (probe) {
      if (probe && probe.ok) {
        nativeFailureCount = 0; nativeDiscoveryPending = false;
        discoveryNotice({ ok: true, unchanged: true, ip: cfg.ip });
        return null;
      }
      if (probe && probe.code === 'local-network-denied') {
        nativeDiscoveryPending = false;
        discoveryNotice({ ok: false, reason: 'local-network-denied', probeOnly: true });
        return null;
      }
      return plugin.scan({ port: Number(cfg.port) || 9100, timeoutMs: 600 }).then(function (scan) {
        var hosts = scan && scan.ok && Array.isArray(scan.hosts) ? scan.hosts : [];
        nativeDiscoveryPending = false;
        if (hosts.length === 1) {
          setConfig({ ip: hosts[0].host, port: Number(cfg.port) || 9100 });
          nativeFailureCount = 0;
          discoveryNotice({ ok: true, changed: hosts[0].host !== cfg.ip, ip: hosts[0].host });
        } else if (hosts.length > 1) discoveryNotice({ ok: false, reason: 'multiple-printers', hosts: hosts });
        else discoveryNotice({ ok: false, reason: (scan && scan.code) || 'not-found', hosts: [] });
        return hosts;
      });
    }).catch(function () { nativeDiscoveryPending = false; discoveryNotice({ ok: false, reason: 'unreachable' }); return null; })
      .then(function (value) { nativeDiscoveryRunning = false; return value; }, function () { nativeDiscoveryRunning = false; return null; });
  }
  function noteNativeFailure(reason) {
    if (reason === 'local-network-denied') {
      discoveryNotice({ ok: false, reason: reason, probeOnly: true });
      return;
    }
    nativeFailureCount += 1;
    if (nativeFailureCount < 3) return;
    nativeDiscoveryPending = true;
    setTimeout(maybeDiscoverNativePrinter, 0);
  }
  function nativeSocketSend(bytes, target) {
    var plugin = nativeSocket();
    var t = nativeSocketTarget(target);
    if (!plugin || !t) return Promise.resolve({ ok: false, reason: 'socket-unavailable' });
    return plugin.send({
      host: t.host, port: t.port, data: window.KiwiEscPos.toB64(bytes), timeoutMs: 4000,
    }).then(function (r) {
      if (r && r.ok) { nativeFailureCount = 0; return { ok: true, via: 'socket', bytes: Number(r.bytes) || bytes.length }; }
      var reason = (r && r.code) || 'socket-unreachable'; noteNativeFailure(reason);
      return { ok: false, reason: reason };
    }, function (e) {
      var reason = (e && (e.code || e.message)) || 'socket-unreachable'; noteNativeFailure(reason);
      return { ok: false, reason: reason };
    });
  }
  function nativeSocketFirst(bytes, target, next) {
    if (!nativeSocket() || !nativeSocketTarget(target)) return next();
    return nativeSocketSend(bytes, target).then(function (r) { return r.ok ? r : next(); }, next);
  }

  /* ── transport C: the bridge · to a TCP printer, or to one the OS already has ──
   * Same helper, two targets. `osPrinter` wins when both are set: it is the
   * deliberate choice made in the panel, while an `ip` can survive in saved
   * config from an earlier setup and would otherwise silently outrank it. */
  /* `target` (optionnel) force la cible : { ip, port } imprime en TCP même si
   * un nom d'imprimante OS est enregistré. Sans lui, un « ticket test réseau »
   * partait vers l'imprimante système et validait une IP jamais essayée. */
  function bridgePrintBytes(bytes, target, ref) {
    var cfg = getConfig();
    if (!(target && (target.ip || target.osPrinter)) && !cfg.ip && !cfg.osPrinter) return Promise.resolve({ ok: false, reason: 'not-configured' });
    // Locate the bridge before the first job if we haven't yet (or if it moved
    // ports since · a restart on a busy 9110 lands somewhere else).
    if (!bridgePort || bridgeMode !== 'secure' || !bridgeCapability) {
      return ping().then(function (j) {
        return j ? bridgePrintNow(bytes, target) : viaRelayOrFail(bytes, target, ref);
      });
    }
    return bridgePrintNow(bytes, target).then(function (res) {
      // Le pont local a disparu entre deux tickets : on oublie son port et on
      // tente le relais · la prochaine impression re-sondera 127.0.0.1 d'abord.
      if (res && res.reason === 'bridge-unreachable') { bridgePort = 0; return viaRelayOrFail(bytes, target, ref); }
      return res;
    });
  }
  function viaRelayOrFail(bytes, target, ref) {
    /* POST /jobs already performs the authoritative "bridge seen recently"
       check.  Probing /bridges first was a redundant round-trip on the exact
       path used by tablets and remote caisses, and could add six seconds before
       the ticket even existed. */
    return relayEnqueue(bytes, target, relayKind(bytes), ref);
  }
  /* Un pont LENT n'est pas un pont ABSENT. Quand le délai de 9 s tombe après
     l'envoi du ticket, le pont l'a peut-être reçu et l'imprime encore : le
     compter « injoignable » envoyait le même ticket au relais, puis la file
     cuisine le réessayait, et la cliente repartait avec deux reçus. Après
     l'envoi, un délai dépassé est donc INCERTAIN (`uncertain: true`) : ni relais,
     ni repli sur une autre imprimante, ni nouvelle tentative automatique. */
  function bridgePrintNow(bytes, target) {
    var cfg = getConfig();
    var to = withTimeout(null, 9000);
    var t = bridgeTarget(target);
    var sent = false;
    if (!t) return Promise.resolve({ ok: false, reason: 'not-configured' });
    return saveBridgeTarget(t).then(function (saved) {
      if (!saved || !saved.ok) return { ok: false, reason: saved && saved.error || 'bridge-capability-required' };
      sent = true;
      return fetch(bridgeBase() + '/kiwi/print', {
        method: 'POST', headers: bridgeHeaders({ 'Content-Type': 'application/json' }), signal: to.signal,
        body: JSON.stringify(t.osPrinter
          ? { printerName: t.osPrinter, dataB64: window.KiwiEscPos.toB64(bytes) }
          : { printerIp: t.ip, port: t.port, dataB64: window.KiwiEscPos.toB64(bytes) }),
      });
    }).then(function (r) {
      if (!r || typeof r.json !== 'function') { to.done(); return { ok: false, reason: r && r.reason || 'print-failed' }; }
      to.done();
      return r.json().then(function (j) {
        if (j && j.timing) lastTiming = j.timing;
        return (r.ok && j && j.ok) ? { ok: true, via: 'bridge', bytes: j.bytes, timing: j.timing } : { ok: false, reason: (j && j.error) || 'print-failed' };
      },
        function () { return { ok: false, reason: 'bad-response' }; });
      }).catch(function (e) {
        to.done();
        if (sent && e && e.name === 'AbortError') return { ok: false, reason: 'bridge-timeout', uncertain: true };
        return { ok: false, reason: 'bridge-unreachable' };
      });
  }

  // ── transport D: le relais cloud (l'iPad, la tablette, tout appareil sans pont) ──
  // Un iPad n'a ni pont local (127.0.0.1), ni Web Bluetooth, ni WebUSB. La caisse
  // DÉPOSE donc le ticket ESC/POS sur kiwi-os.com (/api/print/jobs) et le Kiwi
  // Printer Bridge du comptoir, appairé une fois avec un code, vient le chercher
  // et le pousse à l'imprimante réseau · sortant uniquement, rien à ouvrir, pas
  // d'IP de PC à taper, pas de certificat. Même cible (ip:port / imprimante
  // système) que le pont local ; seul le chemin change. Fail-soft partout :
  // { ok:false, reason } et l'appelant retombe sur l'aperçu à l'écran.
  var RELAY_API = '/api/print';
  var RELAY_PROBE_TTL = 20000;
  var relayState = { at: 0, online: false, bridges: [], provisioned: true, pending: null };
  function relayMerchantQS() {
    var m = '';
    try { m = currentMerchantKey() || ''; } catch (_) {}
    return (m && m !== 'unpaired') ? ('?merchant=' + encodeURIComponent(m)) : '';
  }
  function relayFetch(path, opts, ms) {
    var to = withTimeout(null, ms || 8000);
    var o = Object.assign({ credentials: 'same-origin', cache: 'no-store', signal: to.signal }, opts || {});
    return fetch(RELAY_API + path, o).then(function (r) {
      to.done();
      return r.json().then(function (j) { return { status: r.status, j: j }; }, function () { return { status: r.status, j: null }; });
    }).catch(function () { to.done(); return { status: 0, j: null }; });
  }
  /* Y a-t-il un pont appairé EN LIGNE pour ce commerce ? Mis en cache 20 s :
   * chaque impression ne doit pas coûter un aller-retour de plus. */
  function relayProbe(force) {
    var now = Date.now();
    if (!force && relayState.at && (now - relayState.at) < RELAY_PROBE_TTL) return Promise.resolve(relayState);
    if (relayState.pending) return relayState.pending;
    relayState.pending = relayFetch('/bridges' + relayMerchantQS(), { method: 'GET' }, 6000).then(function (r) {
      relayState.pending = null;
      relayState.at = Date.now();
      relayState.provisioned = !(r.j && r.j.error === 'relay-not-provisioned');
      relayState.online = !!(r.j && r.j.ok && r.j.online);
      relayState.bridges = (r.j && Array.isArray(r.j.bridges)) ? r.j.bridges : [];
      relayState.authed = r.status !== 401;
      return relayState;
    });
    return relayState.pending;
  }
  /* Le serveur n'accepte qu'un jeu de caractères restreint, de 8 à 80 signes
     (functions/api/print/jobs.js). Une clé hors format ferait refuser le dépôt
     tout entier : mieux vaut alors déposer sans clé que ne pas imprimer. */
  function relayClientRef(ref) {
    var clean = String(ref || '').replace(/[^A-Za-z0-9_:.-]/g, '-').slice(0, 80);
    return clean.length >= 8 ? clean : '';
  }
  function relayTargetOf(target) {
    var cfg = getConfig();
    if (target && target.ip) return { ip: target.ip, port: Number(target.port) || 9100 };
    if (target && target.osPrinter) return { osPrinter: target.osPrinter };
    if (cfg.osPrinter) return { osPrinter: cfg.osPrinter };
    if (cfg.ip) return { ip: cfg.ip, port: Number(cfg.port) || 9100 };
    return null;
  }
  /* Observe an accepted relay job without holding the local durable queue.
   * The server owns that job for ten minutes once POST /jobs succeeds. Waiting
   * here for its acknowledgement used to serialize every station ticket for up
   * to twelve seconds: cuisine behind bar behind pass could therefore start
   * printing 30–40 seconds after the caisse receipt. Monitoring remains useful
   * for a concrete printer failure, but it must be a background concern. */
  function watchRelayJob(id, qs, bytesLength) {
    var started = Date.now();
    (function tick() {
      relayFetch('/jobs' + (qs ? qs + '&' : '?') + 'id=' + encodeURIComponent(id), { method: 'GET' }, 5000).then(function (st) {
        var job = st.j && st.j.ok && st.j.job;
        if (job && job.status === 'done') {
          try { window.dispatchEvent(new CustomEvent('kiwi:printer-relay-status', { detail: { ok: true, id: id, bytes: job.bytes || bytesLength } })); } catch (_) {}
          return;
        }
        if (job && (job.status === 'failed' || job.status === 'expired')) {
          var reason = job.error || job.status;
          try { window.dispatchEvent(new CustomEvent('kiwi:printer-relay-status', { detail: { ok: false, id: id, reason: reason } })); } catch (_) {}
          fallbackNotice('Impression distante échouée · ' + frReason(reason));
          return;
        }
        if (job && job.status === 'uncertain') {
          var uncertainReason = job.error || 'output-unknown-ack-timeout';
          try { window.dispatchEvent(new CustomEvent('kiwi:printer-relay-status', { detail: { ok: false, uncertain: true, id: id, reason: uncertainReason } })); } catch (_) {}
          fallbackNotice('Impression distante incertaine · ' + frReason(uncertainReason));
          return;
        }
        if (Date.now() - started <= 12000) setTimeout(tick, 700);
      });
    })();
  }

  /* Dépose le ticket. Dès que le serveur l'a accepté, rendre la main : le pont
   * le réclame de façon atomique et le job reste durable côté serveur. */
  /* `ref` · la clé d'idempotence du dépôt. Un ticket cuisine qui repart après
     un verdict incertain, une reprise de file au rechargement, un double clic
     sur « réimprimer » : le serveur reconnaît la même clé et ne fabrique pas
     un second travail. Sans elle, chaque reprise était un nouveau job, donc un
     nouveau bout de papier. La file donne l'identifiant stable du travail ;
     c'est exactement ce que cette clé doit être. */
  function relayEnqueue(bytes, target, kind, ref) {
    /* Caisse réappairée en plein service (assets/till-tenant.js) : le relais
       est celui du NOUVEAU commerce, son pont imprimerait le ticket de l'autre. */
    try {
      if (window.KiwiTillTenant && window.KiwiTillTenant.mismatch()) return Promise.resolve({ ok: false, reason: 'tenant-mismatch' });
    } catch (_) {}
    var t = relayTargetOf(target);
    if (!t) return Promise.resolve({ ok: false, reason: 'not-configured' });
    var qs = relayMerchantQS();
    return relayFetch('/jobs' + qs, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign(
        { target: t, dataB64: window.KiwiEscPos.toB64(bytes), kind: kind || 'other' },
        relayClientRef(ref) ? { clientRef: relayClientRef(ref) } : {}
      )),
    }, 10000).then(function (r) {
      if (!r.j || !r.j.ok) {
        var why = (r.j && r.j.error) || (r.status === 401 ? 'unauthorized' : 'relay-unreachable');
        if (why === 'relay-offline') { relayState.online = false; relayState.at = Date.now(); }
        return { ok: false, reason: why };
      }
      var id = r.j.id;
      watchRelayJob(id, qs, bytes.length);
      return { ok: true, via: 'relay', queued: true, id: id };
    });
  }
  /* Génère le code à taper sur le pont (ou à lui passer directement quand il
   * tourne sur CETTE machine). { ok, code, expires_ts } */
  function relayPairCode() {
    return relayFetch('/bridges' + relayMerchantQS(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pair-code' }),
    }).then(function (r) { return (r.j && r.j.ok) ? r.j : { ok: false, reason: (r.j && r.j.error) || (r.status === 401 ? 'unauthorized' : 'relay-unreachable') }; });
  }
  function relayRevoke(id) {
    return relayFetch('/bridges' + relayMerchantQS(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revoke', id: id }),
    }).then(function (r) { relayState.at = 0; return !!(r.j && r.j.ok); });
  }
  function relayKind(bytes) {
    // Le relais range les tickets par genre pour le journal du pont ; rien de plus.
    return 'other';
  }

  function wakeViaRelay(t) {
    var qs = relayMerchantQS();
    return relayFetch('/jobs' + qs, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: t, dataB64: 'EAE=', kind: 'wake' }),
    }, 6000).then(function (r) {
      return (r.j && r.j.ok) ? { ok: true, via: 'relay', id: r.j.id } : { ok: false, reason: (r.j && r.j.error) || 'relay-offline' };
    }).catch(function () { return { ok: false, reason: 'relay-unreachable' }; });
  }

  function wakePrinter(target) {
    var now = Date.now();
    if (now - lastWakeAt < 10000) return Promise.resolve({ ok: true, throttled: true });
    lastWakeAt = now;
    var t = relayTargetOf(target);
    if (!t || !t.ip) return Promise.resolve({ ok: false, reason: 'not-configured' });
    if (bridgePort && bridgeMode === 'secure') {
      return saveBridgeTarget(t).then(function (saved) {
        if (!saved || !saved.ok) return { ok: false, reason: saved && saved.error || 'bridge-capability-required' };
        return fetch(bridgeBase() + '/kiwi/wake', {
          method: 'POST', headers: bridgeHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ printerIp: t.ip, port: t.port || 9100 }),
        });
      }).then(function (r) {
        if (!r || typeof r.json !== 'function') return r;
        return r.json().then(function (j) {
          if (j && j.timing) lastTiming = j.timing;
          return (j && j.ok) ? { ok: true, via: 'bridge', waking: true } : { ok: false, reason: (j && j.error) || 'wake-failed' };
        }).catch(function () { return { ok: false, reason: 'bad-response' }; });
      }).catch(function () {
        bridgePort = 0;
        return wakeViaRelay(t);
      });
    }
    return ping().then(function (j) {
      if (j) {
        return saveBridgeTarget(t).then(function (saved) {
          if (!saved || !saved.ok) return { ok: false, reason: saved && saved.error || 'bridge-capability-required' };
          return fetch(bridgeBase() + '/kiwi/wake', {
            method: 'POST', headers: bridgeHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ printerIp: t.ip, port: t.port || 9100 }),
          });
        }).then(function (r) {
          if (!r || typeof r.json !== 'function') return r;
          return r.json().then(function (res) {
            if (res && res.timing) lastTiming = res.timing;
            return (res && res.ok) ? { ok: true, via: 'bridge', waking: true } : { ok: false, reason: (res && res.error) || 'wake-failed' };
          }).catch(function () { return { ok: false, reason: 'bad-response' }; });
        }).catch(function () { return wakeViaRelay(t); });
      }
      return wakeViaRelay(t);
    });
  }

  /* /transport-part:2 */
  return {
    bridgeBase: bridgeBase,
    withTimeout: withTimeout,
    bridgeHeaders: bridgeHeaders,
    bridgeTarget: bridgeTarget,
    saveBridgeTarget: saveBridgeTarget,
    pairLocalBridge: pairLocalBridge,
    pingPort: pingPort,
    ping: ping,
    btConnected: btConnected,
    connectBluetooth: connectBluetooth,
    disconnectBluetooth: disconnectBluetooth,
    btWrite: btWrite,
    usbSupported: usbSupported,
    usbConnected: usbConnected,
    usbPickEndpoint: usbPickEndpoint,
    connectUsb: connectUsb,
    reconnectUsb: reconnectUsb,
    disconnectUsb: disconnectUsb,
    usbWrite: usbWrite,
    nativeSocket: nativeSocket,
    nativeSocketTarget: nativeSocketTarget,
    printQueueIdle: printQueueIdle,
    discoveryNotice: discoveryNotice,
    maybeDiscoverNativePrinter: maybeDiscoverNativePrinter,
    noteNativeFailure: noteNativeFailure,
    nativeSocketSend: nativeSocketSend,
    nativeSocketFirst: nativeSocketFirst,
    bridgePrintBytes: bridgePrintBytes,
    viaRelayOrFail: viaRelayOrFail,
    bridgePrintNow: bridgePrintNow,
    relayMerchantQS: relayMerchantQS,
    relayFetch: relayFetch,
    relayProbe: relayProbe,
    relayClientRef: relayClientRef,
    relayTargetOf: relayTargetOf,
    watchRelayJob: watchRelayJob,
    relayEnqueue: relayEnqueue,
    relayPairCode: relayPairCode,
    relayRevoke: relayRevoke,
    relayKind: relayKind,
    wakeViaRelay: wakeViaRelay,
    wakePrinter: wakePrinter,
    BRIDGE_PORTS: BRIDGE_PORTS,
    bt: bt,
    usb: usb,
    get bridgeMode() { return bridgeMode; },
    get bridgeCapability() { return bridgeCapability; },
    get lastTiming() { return lastTiming; },
  };
  };
})();
