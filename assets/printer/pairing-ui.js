/* Pairing UI, loaded on demand by assets/printer-bridge.js. The core hands
 * over its helpers on one private object; the two values bridge discovery
 * changes later (mode, capability) arrive through onBridgeState. The split is
 * proven in tools/printer-split-test.mjs (bodies sealed at split time). */
(function (core) {
  'use strict';
  var BRIDGE_DOWNLOAD = core.BRIDGE_DOWNLOAD,
    MODELS = core.MODELS,
    bridgeBase = core.bridgeBase,
    bridgeHeaders = core.bridgeHeaders,
    bridgePrintBytes = core.bridgePrintBytes,
    bt = core.bt,
    btConnected = core.btConnected,
    connectBluetooth = core.connectBluetooth,
    connectUsb = core.connectUsb,
    esc = core.esc,
    fallbackNotice = core.fallbackNotice,
    getConfig = core.getConfig,
    getPrepStations = core.getPrepStations,
    getStationConfig = core.getStationConfig,
    labelOptions = core.labelOptions,
    modelDriver = core.modelDriver,
    modelNote = core.modelNote,
    nativeSocket = core.nativeSocket,
    nativeSocketSend = core.nativeSocketSend,
    pairLocalBridge = core.pairLocalBridge,
    paperOptions = core.paperOptions,
    ping = core.ping,
    printBytes = core.printBytes,
    printBytesToTarget = core.printBytesToTarget,
    printQueueIdle = core.printQueueIdle,
    reconnectUsb = core.reconnectUsb,
    relayFetch = core.relayFetch,
    relayMerchantQS = core.relayMerchantQS,
    relayPairCode = core.relayPairCode,
    relayProbe = core.relayProbe,
    relayRevoke = core.relayRevoke,
    saveBridgeTarget = core.saveBridgeTarget,
    say = core.say,
    setConfig = core.setConfig,
    setStationConfig = core.setStationConfig,
    usb = core.usb,
    usbConnected = core.usbConnected,
    usbSupported = core.usbSupported,
    withTimeout = core.withTimeout;
  var initial = core.bridgeState();
  var bridgeMode = initial.mode, bridgeCapability = initial.capability;
  core.onBridgeState(function (mode, capability) { bridgeMode = mode; bridgeCapability = capability; });
  /* Même mécanisme que core.say : les phrases passent par le dictionnaire de
   * la caisse, ou par assets/printer/pairing-lang.js hors caisse (tableau de
   * bord). Le français reste la source ; EN/AR viennent du dictionnaire. */
  var tr = say;

  // ── the pairing modal ───────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById('kpr-style')) return;
    var cssEl = document.createElement('style'); cssEl.id = 'kpr-style';
    cssEl.textContent =
      '#kpr-ov{position:fixed;inset:0;z-index:9998;display:grid;place-items:center;background:rgba(10,15,13,.5);padding:max(20px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(20px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));}' +
      '.kpr-code{margin:10px 0 4px;padding:14px 16px;border:1px dashed #0B6E4F;border-radius:12px;background:rgba(11,110,79,.06);}' +
      '.kpr-code-num{font:600 34px/1.1 "JetBrains Mono",ui-monospace,Menlo,monospace;letter-spacing:.18em;color:#0B6E4F;text-align:center;}' +
      '.kpr-relay-row{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid rgba(10,15,13,.08);}' +
      '.kpr-relay-row:first-child{border-top:0;} .kpr-relay-row small{color:#5b6660;flex:1;} .kpr-relay-row .kpr-d.on{background:#0B6E4F;}' +
      '.kpr-ask{margin:2px 0 8px;padding:12px 14px;border:1px solid #f2cdc8;border-radius:12px;background:#fbeceb;color:#8f2c1e;}' +
      '.kpr-ask p{margin:0 0 10px;font-size:.86rem;line-height:1.45;}' +
      '.kpr-ask-btns{display:flex;gap:8px;}.kpr-ask-btns .kpr-btn{padding:10px;}' +
      '.kpr-ask-yes{background:#c0392b;color:#fff;}.kpr-ask-yes:disabled{opacity:.6;cursor:default;}' +
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
      '.kpr-status button.kpr-recheck{background:none;border:0;color:inherit;font:inherit;font-weight:700;cursor:pointer;text-decoration:underline;text-underline-offset:3px;padding:0;margin-inline-start:2px;}' +
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
      '.kpr-hub{display:flex;align-items:flex-start;gap:12px;padding:13px 14px;border:1px solid rgba(11,110,79,.22);border-radius:12px;background:var(--surface,#fff);cursor:pointer;}' +
      '.kpr-hub input{width:19px;height:19px;margin:1px 0 0;accent-color:var(--atlas,#0B6E4F);flex:none;}' +
      '.kpr-hub span{display:grid;gap:3px;line-height:1.35;}.kpr-hub b{font-size:.88rem;}.kpr-hub small{font-size:.76rem;opacity:.68;}' +
      '.kpr-btc{width:100%;font:inherit;font-weight:700;padding:13px;border-radius:12px;cursor:pointer;border:0;background:var(--atlas,#0B6E4F);color:#fff;}' +
      '.kpr-btc:hover{filter:brightness(1.06);}.kpr-btc:disabled{opacity:.5;cursor:default;}' +
      '.kpr-adv{margin-top:8px;border-top:1px solid rgba(0,0,0,.08);padding-top:12px;}' +
      '.kpr-adv>summary{cursor:pointer;font-size:.84rem;font-weight:700;color:var(--riad,#053B2C);opacity:.82;}' +
      '.kpr-adv[open]>summary{margin-bottom:14px;}' +
      '.kpr-x{float:right;background:none;border:0;font-size:1.3rem;line-height:1;cursor:pointer;color:var(--ink,#0A0F0D);opacity:.5;}' +
      '.kpr-note{margin:14px 0 0;font-size:.78rem;opacity:.6;line-height:1.5;}' +
      '.kpr-note a{color:var(--atlas,#0B6E4F);font-weight:600;text-decoration:underline;}' +
      '.kpr-st-hdr{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;}' +
      '.kpr-st-hdr>div{flex:1 1 220px;min-width:0;}' +
      '.kpr-st-sub{font-size:.84rem;color:var(--ink,#0A0F0D);opacity:.68;margin:2px 0 0;line-height:1.4;}' +
      '.kpr-st-add-btn{background:var(--atlas,#0B6E4F);color:#fff;padding:8px 14px;border-radius:10px;font-size:.82rem;font-weight:600;white-space:nowrap;border:0;cursor:pointer;flex:none;}' +
      '.kpr-st-add-btn:hover{filter:brightness(1.06);}' +
      '.kpr-profile-card{background:rgba(11,110,79,.06);border:1.5px solid rgba(11,110,79,.22);border-radius:14px;padding:16px;margin:12px 0 16px;}' +
      '.kpr-profile-card h4{margin:0 0 12px;font-size:.95rem;font-weight:700;color:var(--ink,#0A0F0D);}' +
      '.kpr-profiles-chip-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;}' +
      '.kpr-prof-chip{display:inline-flex;align-items:center;gap:7px;background:var(--surface,#fff);border:1px solid rgba(0,0,0,.15);padding:5px 10px;border-radius:9px;font-size:.82rem;color:var(--ink,#0A0F0D);}' +
      '.kpr-prof-chip b{font-weight:600;}' +
      '.kpr-prof-del{background:none;border:none;color:#9ca3af;cursor:pointer;font-size:15px;line-height:1;padding:0 2px;margin-inline-start:2px;}' +
      '.kpr-prof-del:hover{color:#dc2626;}' +
      '.kpr-st-cards{display:grid;gap:10px;margin-top:10px;}' +
      '.kpr-st-card{background:var(--surface,#fff);border:1px solid rgba(0,0,0,.1);border-radius:12px;padding:14px;display:grid;gap:10px;}' +
      '.kpr-st-top{display:flex;align-items:center;justify-content:space-between;gap:10px;}' +
      '.kpr-st-top b{font-size:.9rem;letter-spacing:-.01em;}' +
      '.kpr-st-actions{display:flex;gap:8px;}' +
      '.kpr-st-actions .kpr-btn{flex:1;padding:9px 10px;font-size:.8rem;border-radius:9px;white-space:nowrap;}' +
      '.kpr-st-badge{display:inline-block;padding:2px 7px;border-radius:6px;font-size:.75rem;font-weight:600;background:rgba(0,0,0,.06);color:var(--ink,#0A0F0D);}' +
      '.kpr-st-badge.receipt{background:#e0f2fe;color:#0369a1;}' +
      '.kpr-st-badge.production{background:#fef3c7;color:#92400e;}' +
      '.kpr-st-sel{width:100%;padding:10px 12px;border:1.5px solid rgba(0,0,0,.12);border-radius:10px;background:var(--surface,#fff);color:var(--ink,#0A0F0D);font-size:.85rem;}' +
      '.kpr-st-sel:focus{outline:none;border-color:var(--atlas,#0B6E4F);box-shadow:0 0 0 4px rgba(11,110,79,.13);}' +
      /* En arabe (caisse-lang.js pose dir="rtl") : la croix de fermeture passe à
         gauche avec le reste, et l'espacement des lettres saute · il casse la
         liaison des lettres arabes. Une adresse IP reste une suite latine. */
      '[dir="rtl"] .kpr-x{float:left;}' +
      '[dir="rtl"] #kpr-card .kpr-field label,[dir="rtl"] #kpr-card h2{letter-spacing:0;}' +
      '[dir="rtl"] #kpr-ip,[dir="rtl"] #kpr-port,[dir="rtl"] #kpr-prof-ip,[dir="rtl"] #kpr-prof-port{direction:ltr;text-align:right;}';
    document.head.appendChild(cssEl);
  }

  function openSetup(context) {
    context = context || {};
    injectCss();
    var cfg = getConfig();
    var ov = document.createElement('div'); ov.id = 'kpr-ov';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', tr('Connecter une imprimante'));
    var opts = MODELS.map(function (m) { return '<option value="' + m.id + '"' + (m.id === cfg.model ? ' selected' : '') + '>' + esc(m.label) + '</option>'; }).join('');
    var btLive = btConnected();
    var usbLive = usbConnected();
    var socket = nativeSocket();
    var fromPrint = !!(context.onBrowserPrint || context.onSavePdf);
    var isLabel = (context.kind || 'label') === 'label';
    /* The Kiwi Pro app's web view has no Web Bluetooth (WKWebView never, the
       Android WebView neither): offering "Rechercher une imprimante Bluetooth"
       there only ended on "utilisez Chrome". In the app, the printer is the
       network one; on the web, a browser without Bluetooth keeps the block and
       its explanation. */
    var inApp = !!socket;
    var showBt = !!navigator.bluetooth || !inApp;
    ov.innerHTML =
      '<div id="kpr-card">' +
        '<button class="kpr-x" type="button" id="kpr-close" aria-label="' + esc(tr('Fermer')) + '">×</button>' +
        '<h2>' + tr(fromPrint ? (isLabel ? 'Imprimer l’étiquette' : 'Imprimer le reçu') : 'Connecter une imprimante') + '</h2>' +
        '<p class="kpr-sub">' + tr(inApp && !showBt ? (fromPrint
          ? (isLabel
            ? 'Imprimez tout de suite, ou connectez une imprimante réseau (Wi-Fi ou Ethernet) pour imprimer directement la prochaine fois.'
            : 'Aucune imprimante n’est connectée à Kiwi. Préparez le PDF du ticket tout de suite, ou connectez une imprimante réseau (Wi-Fi ou Ethernet) pour imprimer directement la prochaine fois.')
          : 'Connectez l’imprimante réseau (Wi-Fi ou Ethernet) : Kiwi lui envoie le ticket directement, sans boîte de dialogue.') : fromPrint
          ? (isLabel
            ? 'Imprimez tout de suite, ou connectez une imprimante (Bluetooth ou réseau) pour imprimer directement la prochaine fois.'
            : 'Aucune imprimante n’est connectée à Kiwi. Si l’imprimante est déjà installée sur cette caisse, imprimez par le système · ou connectez-la en Bluetooth ou en USB pour imprimer sans boîte de dialogue la prochaine fois.')
          : 'Connectez l’imprimante en Bluetooth ou en USB pour imprimer sans boîte de dialogue. Si elle est déjà installée sur cette caisse, Kiwi peut aussi l’utiliser via la boîte d’impression du système.') + '</p>' +
        (fromPrint ? '<div class="kpr-quick">' +
          (context.onBrowserPrint ? '<button data-activation=write class="kpr-btn kpr-browser" type="button" id="kpr-browser">' + tr(inApp ? 'Imprimer ou partager le PDF' : 'Imprimer') + '</button>' : '') +
          (context.onSavePdf ? '<button data-activation=write class="kpr-btn kpr-pdf" type="button" id="kpr-savepdf">' + tr('Enregistrer en PDF') + '</button>' : '') +
        '</div>' : '') +
        (showBt ? '<div class="kpr-bt">' +
          '<h3>' + tr('Imprimante Bluetooth') + '</h3>' +
          '<p>' + tr('Sans installation. Kiwi imprime le reçu directement.') + '</p>' +
          '<div class="kpr-status ' + (btLive ? 'on' : 'off') + '" id="kpr-bt-status"><span class="kpr-d"></span><span id="kpr-bt-status-t">' + (btLive ? esc(tr('Connectée · ' + bt.name)) : tr('Aucune imprimante connectée.')) + '</span></div>' +
          '<button data-activation=write class="kpr-btc" type="button" id="kpr-bt-connect">' + tr(btLive ? 'Changer d’imprimante' : 'Rechercher une imprimante Bluetooth') + '</button>' +
          '<div class="kpr-actions"><button data-activation=write class="kpr-btn kpr-test" type="button" id="kpr-bt-test"' + (btLive ? '' : ' disabled') + '>' + tr('Imprimer un ticket test') + '</button></div>' +
        '</div>' : '') +
        (usbSupported() ? '<div class="kpr-bt">' +
          '<h3>' + tr('Imprimante USB') + '</h3>' +
          '<p>' + tr('Branchée en USB sur la caisse. Sans installation, sans adresse IP.') + '</p>' +
          '<div class="kpr-status ' + (usbLive ? 'on' : 'off') + '" id="kpr-usb-status"><span class="kpr-d"></span><span id="kpr-usb-status-t">' + (usbLive ? esc(tr('Connectée · ' + usb.name)) : tr('Aucune imprimante USB connectée.')) + '</span></div>' +
          '<button data-activation=write class="kpr-btc" type="button" id="kpr-usb-connect">' + tr(usbLive ? 'Changer d’imprimante' : 'Choisir l’imprimante USB') + '</button>' +
          '<div class="kpr-actions"><button data-activation=write class="kpr-btn kpr-test" type="button" id="kpr-usb-test"' + (usbLive ? '' : ' disabled') + '>' + tr('Imprimer un ticket test') + '</button></div>' +
        '</div>' : '') +
        (window.KiwiKitchenPrint ? '<div class="kpr-bt" id="kpr-kitchen">' +
          '<h3>' + tr('Tickets de production automatiques') + '</h3>' +
          '<p>' + tr('Ce poste peut imprimer les commandes envoyées depuis la caisse, l’app employé et les autres terminaux. Activez cette option sur un seul ordinateur par établissement.') + '</p>' +
          '<label class="kpr-hub"><input type="checkbox" id="kpr-hub"' + (KiwiKitchenPrint.isHub() ? ' checked' : '') + '>' +
            '<span><b>' + tr('Faire de ce poste le hub d’impression') + '</b><small id="kpr-hub-status"></small></span></label>' +
        '</div>' : '') +
        '<div class="kpr-bt" id="kpr-os" style="display:none;">' +
          '<h3>' + tr('Imprimante déjà installée') + '</h3>' +
          '<p>' + tr('Celle que cet ordinateur utilise déjà. Kiwi lui envoie le ticket directement, sans boîte de dialogue.') + '</p>' +
          '<div class="kpr-status ' + (cfg.osPrinter ? 'on' : 'off') + '" id="kpr-os-status"><span class="kpr-d"></span><span id="kpr-os-status-t">' + (cfg.osPrinter ? esc(tr('Choisie · ' + cfg.osPrinter)) : tr('Aucune imprimante choisie.')) + '</span></div>' +
          '<div class="kpr-field"><label for="kpr-os-sel">' + tr('Imprimante') + '</label><select id="kpr-os-sel"></select></div>' +
          '<div class="kpr-actions">' +
            '<button data-activation=write class="kpr-btn kpr-test" type="button" id="kpr-os-test">' + tr('Imprimer un ticket test') + '</button>' +
            '<button data-activation=write class="kpr-btn kpr-save" type="button" id="kpr-os-save">' + tr('Utiliser cette imprimante') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="kpr-bt" id="kpr-stations-box">' +
          '<div class="kpr-st-hdr">' +
            '<div>' +
              '<h3>' + tr('Imprimantes par poste') + '</h3>' +
              '<p class="kpr-st-sub">' + tr('Associez chaque poste (caisse, cuisine, bar…) à son imprimante physique.') + '</p>' +
            '</div>' +
            '<button data-activation=write type="button" class="kpr-st-add-btn" id="kpr-add-prof-btn">' + tr('+ Nouvelle imprimante') + '</button>' +
          '</div>' +
          '<div id="kpr-profile-form" class="kpr-profile-card" style="display:none;">' +
            '<h4 id="kpr-prof-form-title">' + tr('Ajouter une imprimante') + '</h4>' +
            '<div class="kpr-field"><label for="kpr-prof-name">' + tr('Nom de l’imprimante') + '</label><input id="kpr-prof-name" type="text" placeholder="' + esc(tr('ex. Cuisine, Bar, Fournil…')) + '"></div>' +
            '<div class="kpr-two">' +
              '<div class="kpr-field"><label for="kpr-prof-type">' + tr('Type') + '</label><select id="kpr-prof-type">' +
                '<option value="ip">' + tr('Réseau (IP · Wi-Fi / Ethernet)') + '</option>' +
                '<option value="os">' + tr('Imprimante système (installée)') + '</option>' +
                '<option value="usb">' + tr('USB direct') + '</option>' +
                (showBt ? '<option value="bt">' + tr('Bluetooth') + '</option>' : '') +
              '</select></div>' +
              '<div class="kpr-field"><label for="kpr-prof-paper">' + tr('Papier') + '</label><select id="kpr-prof-paper"><option value="80">' + tr('80 mm (standard)') + '</option><option value="58">' + tr('58 mm') + '</option></select></div>' +
            '</div>' +
            '<div id="kpr-prof-ip-box" class="kpr-two">' +
              '<div class="kpr-field"><label for="kpr-prof-ip">' + tr('Adresse IP') + '</label><input id="kpr-prof-ip" type="text" placeholder="192.168.1.50" inputmode="decimal"></div>' +
              '<div class="kpr-field"><label for="kpr-prof-port">' + tr('Port') + '</label><input id="kpr-prof-port" type="text" value="9100" inputmode="numeric"></div>' +
            '</div>' +
            '<div id="kpr-prof-os-box" class="kpr-field" style="display:none;">' +
              '<label for="kpr-prof-os-sel">' + tr('Imprimante du système') + '</label><select id="kpr-prof-os-sel"></select>' +
            '</div>' +
            '<div class="kpr-actions" style="margin-top:12px;">' +
              '<button class="kpr-btn kpr-test" type="button" id="kpr-prof-test-btn">' + tr('Tester') + '</button>' +
              '<button data-activation=write class="kpr-btn kpr-save" type="button" id="kpr-prof-save-btn">' + tr('Enregistrer') + '</button>' +
              '<button class="kpr-btn" type="button" id="kpr-prof-cancel-btn" style="background:#e5e7eb;color:#1f2937;">' + tr('Annuler') + '</button>' +
            '</div>' +
          '</div>' +
          '<div id="kpr-profiles-list" class="kpr-profiles-chip-row"></div>' +
          '<div id="kpr-station-tbody" class="kpr-st-cards"></div>' +
          '<div class="kpr-actions" style="margin-top:12px;">' +
            '<button data-activation=write class="kpr-btn kpr-save" type="button" id="kpr-save-stations-btn">' + tr('Enregistrer le routage par poste') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="kpr-bt" id="kpr-relay">' +
          '<h3>' + tr('Imprimer depuis un iPad ou une tablette · relais Kiwi') + '</h3>' +
          '<p>' + tr('Sans pont sur cet appareil, Kiwi envoie les tickets au pont de l’ordinateur du comptoir, qui les imprime sur votre imprimante réseau. Une association suffit, puis tout est automatique.') + '</p>' +
          '<div class="kpr-status off" id="kpr-relay-status"><span class="kpr-d"></span><span id="kpr-relay-status-t">' + tr('Vérification du relais…') + '</span></div>' +
          '<div id="kpr-relay-list" class="kpr-note"></div>' +
          '<div id="kpr-relay-code" class="kpr-code" style="display:none;"></div>' +
          '<div class="kpr-actions">' +
            '<button class="kpr-btc" type="button" id="kpr-relay-pair">' + tr('Associer un pont') + '</button>' +
            '<button class="kpr-btc" type="button" id="kpr-relay-pair-local" style="display:none;">' + tr('Associer ce pont maintenant') + '</button>' +
          '</div>' +
        '</div>' +
        '<details class="kpr-adv"' + (cfg.ip ? ' open' : '') + '>' +
          '<summary>' + tr('Option avancée · imprimante réseau globale (Wi-Fi / Ethernet)') + '</summary>' +
          '<div class="kpr-status off" id="kpr-status"><span class="kpr-d"></span><span id="kpr-status-t">' + tr(socket ? 'Impression directe disponible dans l’app Kiwi.' : 'Vérification du pont…') + '</span></div>' +
          '<p class="kpr-note" id="kpr-target"></p>' +
          '<div class="kpr-field"><label for="kpr-ip">' + tr('Adresse IP de l’imprimante') + '</label><input id="kpr-ip" type="text" inputmode="decimal" placeholder="192.168.1.50" value="' + esc(cfg.ip) + '"></div>' +
          '<button data-activation=write class="kpr-btc" type="button" id="kpr-scan"' + (socket ? '' : ' disabled') + '>' + tr(socket ? 'Rechercher sur le réseau' : 'Détecter les imprimantes du réseau') + '</button>' +
          '<div id="kpr-scan-out" class="kpr-note" style="display:none;"></div>' +
          '<button data-activation=money class="kpr-btc" type="button" id="kpr-diagnostics">' + tr('Exporter le diagnostic d’impression') + '</button>' +
          '<div class="kpr-two">' +
            '<div class="kpr-field"><label for="kpr-port">' + tr('Port') + '</label><input id="kpr-port" type="text" inputmode="numeric" value="' + esc(cfg.port) + '"></div>' +
            '<div class="kpr-field"><label for="kpr-paper">' + tr('Largeur papier') + '</label><select id="kpr-paper">' + paperOptions(cfg.paper) + '</select></div>' +
            '<div class="kpr-field"><label for="kpr-label">' + tr('Format d\'étiquette') + '</label><select id="kpr-label">' + labelOptions(cfg.label) + '</select></div>' +
          '</div>' +
          '<div class="kpr-field"><label for="kpr-model">' + tr('Modèle') + '</label><select id="kpr-model">' + opts + '</select>' +
            '<p class="kpr-note" id="kpr-model-note" style="margin-top:8px;' + (modelNote(cfg.model) ? '' : 'display:none;') + '">' + esc(modelNote(cfg.model)) + '</p>' +
            '<p class="kpr-note" id="kpr-model-driver" style="margin-top:6px;' + (modelDriver(cfg.model) ? '' : 'display:none;') + '">' +
              tr('Pilote Windows (utile seulement pour les étiquettes ou si l\'USB est refusé) :') + ' ' +
              '<a data-activation=money id="kpr-model-driver-a" href="' + esc(modelDriver(cfg.model)) + '" target="_blank" rel="noopener noreferrer">' + tr('page de téléchargement') + '</a>' +
            '</p></div>' +
          '<div class="kpr-actions">' +
            '<button data-activation=write class="kpr-btn kpr-test" type="button" id="kpr-test"' + (socket ? '' : ' disabled') + '>' + tr(socket ? 'Tester' : 'Imprimer un ticket test') + '</button>' +
            '<button data-activation=write class="kpr-btn kpr-save" type="button" id="kpr-save">' + tr('Enregistrer') + '</button>' +
          '</div>' +
          '<p class="kpr-note">' + tr('Le pont tourne sur l’ordinateur de la caisse et ne communique qu’avec votre imprimante locale.') + ' <a data-activation=money href="' + esc(BRIDGE_DOWNLOAD) + '" target="_blank" rel="noopener">' + tr('Télécharger le pont') + '</a></p>' +
        '</details>' +
      '</div>';
    document.body.appendChild(ov);
    /* Traduit tout de suite, pas au prochain balayage : sinon le dialogue peint
       une image en français avant de passer dans la langue de la caisse. */
    try { if (window.KiwiCaisseLang && window.KiwiCaisseLang.apply) window.KiwiCaisseLang.apply(ov); } catch (_) {}

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
    /* La caisse n'a pas window.Kiwi.toast : sans repli, chaque « Tester » du
       modal serait muet au comptoir · la surface qui s'en sert vraiment. */
    function toast(msg) { try { if (window.Kiwi && Kiwi.toast) Kiwi.toast(msg); else fallbackNotice(msg); } catch (_) {} }

    function validIp(s) {
      if (!s) return true;
      var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
      if (m) return [m[1], m[2], m[3], m[4]].every(function (o) { return Number(o) <= 255; });
      return /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?)+$/i.test(s);
    }
    function validPort(s) { var n = Number(s); return Number.isInteger(n) && n >= 1 && n <= 65535; }

    function frReason(reason) {
      var r = String(reason || '');
      if (r === 'bridge-unreachable') return 'Pont introuvable · lancez Kiwi Printer Bridge sur cet ordinateur, ou associez un pont au relais Kiwi pour imprimer depuis une tablette';
      if (r === 'bridge-capability-required') return 'Ce pont doit être mis à jour · installez la dernière version de Kiwi Printer Bridge puis revérifiez';
      if (r === 'printer-target-not-saved') return 'Cette imprimante doit être enregistrée dans le pont · relancez le test depuis ce poste';
      if (r === 'printer-target-not-local') return 'Le pont refuse cette cible réseau · utilisez une imprimante locale au poste du comptoir';
      if (r === 'output-unknown-ack-timeout' || r === 'output-unknown-after-bridge-restart') return 'Le ticket a peut-être déjà été imprimé · vérifiez le papier avant toute reprise manuelle';
      if (r === 'relay-offline') return 'Aucun pont en ligne pour le relais Kiwi · vérifiez que Kiwi Printer Bridge tourne sur l’ordinateur du comptoir';
      if (r === 'relay-not-provisioned') return 'Relais d’impression pas encore activé côté serveur';
      if (r === 'unauthorized') return 'Caisse non reconnue · appairez-la ou reconnectez-vous';
      if (r === 'expired') return 'Le pont n’a pas récupéré le ticket à temps';
      if (r === 'not-configured') return 'Aucune imprimante configurée';
      if (r === 'local-network-denied') return 'Accès au réseau local refusé. Ouvrez Réglages > Kiwi Pro > Réseau local';
      if (r === 'refused') return 'Connexion refusée. Vérifiez le port de l’imprimante';
      if (r === 'unreachable') return 'Imprimante introuvable sur ce réseau';
      if (/timeout/i.test(r)) return 'Imprimante injoignable · vérifiez l’adresse IP et qu’elle est allumée';
      if (/ECONNREFUSED/i.test(r)) return 'Connexion refusée à cette adresse · ce n’est pas le port d’une imprimante réseau';
      if (/ENOTFOUND|EHOSTUNREACH|ENETUNREACH|EINVAL|EHOSTDOWN/i.test(r)) return 'Adresse introuvable sur le réseau · vérifiez l’IP';
      return r || 'inconnu';
    }

    function paintTarget() {
      var el = $('#kpr-target'); if (!el) return;
      var c = getConfig();
      el.textContent = tr(c.osPrinter
        ? 'Cible actuelle : imprimante système « ' + c.osPrinter + ' ». Enregistrer une IP ici la remplacera.'
        : (c.ip ? 'Cible actuelle : réseau · ' + c.ip + ':' + (c.port || 9100) : 'Aucune cible réseau enregistrée.'));
    }
    function paintHubStatus() {
      var el = $('#kpr-hub-status');
      if (!el || !window.KiwiKitchenPrint) return;
      var s = KiwiKitchenPrint.status();
      el.textContent = tr(s.pending
        ? (s.pending > 1 ? s.pending + ' tickets en attente · nouvelle tentative automatique' : s.pending + ' ticket en attente · nouvelle tentative automatique')
        : (s.hub ? (s.printerReady ? 'Prêt · aucune impression en attente' : 'Hub actif · connectez une imprimante') : 'Les commandes de ce poste continuent à s’imprimer localement.'));
    }
    var hub = $('#kpr-hub');
    if (hub) hub.addEventListener('change', function () {
      KiwiKitchenPrint.setHub(this.checked);
      paintHubStatus();
      toast(tr(this.checked ? 'Hub d’impression cuisine activé' : 'Hub d’impression désactivé'));
    });
    paintHubStatus();

    // ── Station Routing UI Logic ──
    var stConfig = getStationConfig();
    var prepStations = (context.stations && Array.isArray(context.stations)) ? context.stations : getPrepStations();

    function renderProfilesChips() {
      var chipRow = $('#kpr-profiles-list');
      if (!chipRow) return;
      if (!stConfig.profiles.length) {
        chipRow.innerHTML = '<span class="kpr-note" style="margin:0 0 6px;display:block;">' + tr('Aucune imprimante additionnelle enregistrée. Ajoutez-en une pour router par poste.') + '</span>';
        return;
      }
      chipRow.innerHTML = stConfig.profiles.map(function (p) {
        var desc = p.type === 'ip' ? (p.ip + ':' + (p.port || 9100)) : p.type === 'os' ? p.osPrinter : p.type.toUpperCase();
        return '<span class="kpr-prof-chip" data-prof-id="' + esc(p.id) + '">' +
          '<b>' + esc(p.name) + '</b> <small>(' + esc(desc) + ')</small>' +
          '<button data-activation=write type="button" class="kpr-prof-del" data-del-prof="' + esc(p.id) + '" aria-label="Supprimer">×</button>' +
          '</span>';
      }).join('');

      chipRow.querySelectorAll('[data-del-prof]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var pid = this.getAttribute('data-del-prof');
          stConfig.profiles = stConfig.profiles.filter(function (p) { return p.id !== pid; });
          Object.keys(stConfig.bindings).forEach(function (k) {
            if (stConfig.bindings[k] === pid) delete stConfig.bindings[k];
          });
          setStationConfig(stConfig);
          renderProfilesChips();
          renderStationRows();
          toast(tr('Imprimante retirée'));
        });
      });
    }

    function renderStationRows() {
      var tbody = $('#kpr-station-tbody');
      if (!tbody) return;
      var rows = [];

      var caisseCur = stConfig.bindings.caisse || '';
      var caisseOpts = '<option value="">· Imprimante par défaut (actuelle) ·</option>' +
        stConfig.profiles.map(function (p) {
          return '<option value="' + esc(p.id) + '"' + (p.id === caisseCur ? ' selected' : '') + '>' + esc(p.name) + ' (' + esc(p.type === 'ip' ? p.ip : p.type) + ')</option>';
        }).join('');
      rows.push('<div class="kpr-st-card">' +
        '<div class="kpr-st-top"><b>Caisse (comptoir)</b><span class="kpr-st-badge receipt">Reçus clients</span></div>' +
        '<select class="kpr-st-sel" data-station-id="caisse" aria-label="Imprimante de la caisse">' + caisseOpts + '</select>' +
        '<div class="kpr-st-actions">' +
          '<button type="button" class="kpr-btn kpr-test kpr-st-test" data-test-station="caisse" data-station-title="Caisse">Ticket test</button>' +
          '<button type="button" class="kpr-btn kpr-test" id="kpr-drawer-test">Tester le tiroir</button>' +
        '</div>' +
        '</div>');

      prepStations.forEach(function (st) {
        var cur = stConfig.bindings[st.id] || '';
        var opts = '<option value="">· Même imprimante que la caisse ·</option>' +
          stConfig.profiles.map(function (p) {
            return '<option value="' + esc(p.id) + '"' + (p.id === cur ? ' selected' : '') + '>' + esc(p.name) + ' (' + esc(p.type === 'ip' ? p.ip : p.type) + ')</option>';
          }).join('');
        rows.push('<div class="kpr-st-card">' +
          '<div class="kpr-st-top"><b>' + esc(st.name || st.id) + '</b><span class="kpr-st-badge production">Production</span></div>' +
          '<select class="kpr-st-sel" data-station-id="' + esc(st.id) + '" aria-label="Imprimante du poste ' + esc(st.name || st.id) + '">' + opts + '</select>' +
          '<div class="kpr-st-actions">' +
            '<button type="button" class="kpr-btn kpr-test kpr-st-test" data-test-station="' + esc(st.id) + '" data-station-title="' + esc(st.name || st.id) + '">Ticket test</button>' +
          '</div>' +
          '</div>');
      });

      tbody.innerHTML = rows.join('');

      tbody.querySelectorAll('.kpr-st-test').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var sid = this.getAttribute('data-test-station');
          var stTitle = this.getAttribute('data-station-title') || 'Poste';
          var rowSel = tbody.querySelector('.kpr-st-sel[data-station-id="' + sid + '"]');
          var profId = rowSel ? rowSel.value : '';
          var prof = profId ? stConfig.profiles.find(function (p) { return p.id === profId; }) : null;
          var paper = (prof && prof.paper) || getConfig().paper || '80';
          var bTest = this;
          bTest.disabled = true; var origText = bTest.textContent; bTest.textContent = tr('Impression…');
          var slipBytes = (sid === 'caisse')
            ? window.KiwiEscPos.receipt({ shop: 'TEST CAISSE', lines: [{ name: 'Test reçu client', price: '0.00' }], total: '0.00', paper: paper })
            : window.KiwiEscPos.kitchenTicket({ title: 'TEST ' + stTitle.toUpperCase(), order: '#TEST', time: '12:00', items: [{ name: 'Article test ' + stTitle, qty: 1 }], paper: paper });
          (prof ? printBytesToTarget(slipBytes, prof) : printBytes(slipBytes)).then(function (res) {
            bTest.textContent = origText; bTest.disabled = false;
            toast(tr(res.ok ? ('Ticket test envoyé (' + stTitle + ')') : ('Échec · ' + frReason(res.reason))));
          }, function () {
            bTest.textContent = origText; bTest.disabled = false;
            toast(tr('Échec d’impression'));
          });
        });
      });

      /* Le test du tiroir : une impulsion ESC/POS (sans papier) vers l'imprimante
         du comptoir. L'électronique ne sait pas confirmer l'ouverture physique,
         donc le toast dit quoi vérifier si le tiroir reste fermé. */
      var drawerBtn = tbody.querySelector('#kpr-drawer-test');
      if (drawerBtn) drawerBtn.addEventListener('click', function () {
        var rowSel = tbody.querySelector('.kpr-st-sel[data-station-id="caisse"]');
        var profId = rowSel ? rowSel.value : '';
        var prof = profId ? stConfig.profiles.find(function (p) { return p.id === profId; }) : null;
        var bd = this; bd.disabled = true; var orig = bd.textContent; bd.textContent = tr('Envoi…');
        var kick = window.KiwiEscPos.builder().init().drawer().bytes();
        (prof ? printBytesToTarget(kick, prof) : printBytes(kick)).then(function (res) {
          bd.textContent = orig; bd.disabled = false;
          toast(tr(res.ok
            ? 'Impulsion envoyée · tiroir fermé ? Vérifiez le câble RJ11 sur le port DK de l\'imprimante et la clé en position verticale'
            : ('Échec · ' + frReason(res.reason))));
        }, function () {
          bd.textContent = orig; bd.disabled = false;
          toast(tr('Échec de l\'impulsion tiroir'));
        });
      });
    }

    var addProfBtn = $('#kpr-add-prof-btn');
    var profForm = $('#kpr-profile-form');
    var profTypeSel = $('#kpr-prof-type');
    var profIpBox = $('#kpr-prof-ip-box');
    var profOsBox = $('#kpr-prof-os-box');

    if (addProfBtn && profForm) {
      addProfBtn.addEventListener('click', function () {
        profForm.style.display = profForm.style.display === 'none' ? 'block' : 'none';
        if (profForm.style.display === 'block') {
          $('#kpr-prof-name').value = '';
          $('#kpr-prof-ip').value = '';
          $('#kpr-prof-name').focus();
        }
      });
    }
    if ($('#kpr-prof-cancel-btn')) {
      $('#kpr-prof-cancel-btn').addEventListener('click', function () {
        if (profForm) profForm.style.display = 'none';
      });
    }
    if (profTypeSel) {
      profTypeSel.addEventListener('change', function () {
        if (profIpBox) profIpBox.style.display = this.value === 'ip' ? 'flex' : 'none';
        if (profOsBox) profOsBox.style.display = this.value === 'os' ? 'block' : 'none';
      });
    }

    if ($('#kpr-prof-test-btn')) {
      $('#kpr-prof-test-btn').addEventListener('click', function () {
        var type = $('#kpr-prof-type').value;
        var name = ($('#kpr-prof-name').value || 'Test').trim();
        var ip = ($('#kpr-prof-ip').value || '').trim();
        var port = Number($('#kpr-prof-port').value) || 9100;
        var osPrinter = $('#kpr-prof-os-sel') ? $('#kpr-prof-os-sel').value : '';
        var paper = $('#kpr-prof-paper').value || '80';
        if (type === 'ip') {
          if (!ip) { toast(tr('Saisissez une adresse IP')); return; }
          if (!validIp(ip)) { toast(tr('Adresse IP invalide')); return; }
          if (!validPort(port)) { toast(tr('Port invalide')); return; }
        }
        var target = { type: type, name: name, ip: ip, port: port, osPrinter: osPrinter, paper: paper };
        var btn = this; btn.disabled = true; var origText = btn.textContent; btn.textContent = tr('Impression…');
        var slipBytes = window.KiwiEscPos.testSlip({ title: 'TEST ' + name.toUpperCase(), ip: ip, paper: paper });
        printBytesToTarget(slipBytes, target).then(function (res) {
          btn.textContent = origText; btn.disabled = false;
          toast(tr(res.ok ? ('Ticket test envoyé à ' + name) : ('Échec · ' + frReason(res.reason))));
        }, function () {
          btn.textContent = origText; btn.disabled = false;
          toast(tr('Échec d’impression'));
        });
      });
    }

    if ($('#kpr-prof-save-btn')) {
      $('#kpr-prof-save-btn').addEventListener('click', function () {
        var name = ($('#kpr-prof-name').value || '').trim();
        var type = $('#kpr-prof-type').value;
        var ip = ($('#kpr-prof-ip').value || '').trim();
        var port = Number($('#kpr-prof-port').value) || 9100;
        var osPrinter = $('#kpr-prof-os-sel') ? $('#kpr-prof-os-sel').value : '';
        var paper = $('#kpr-prof-paper').value || '80';

        if (!name) { toast(tr('Donnez un nom à cette imprimante (ex. Cuisine, Bar)')); $('#kpr-prof-name').focus(); return; }
        if (type === 'ip') {
          if (!ip) { toast(tr('Saisissez une adresse IP')); $('#kpr-prof-ip').focus(); return; }
          if (!validIp(ip)) { toast(tr('Adresse IP invalide')); $('#kpr-prof-ip').focus(); return; }
          if (!validPort(port)) { toast(tr('Port invalide')); $('#kpr-prof-port').focus(); return; }
        }
        if (type === 'os' && !osPrinter) {
          toast(tr('Sélectionnez une imprimante système')); return;
        }

        var newProf = {
          id: 'prof_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: name,
          type: type,
          ip: ip,
          port: port,
          osPrinter: osPrinter,
          paper: paper
        };
        stConfig.profiles.push(newProf);
        setStationConfig(stConfig);
        renderProfilesChips();
        renderStationRows();
        if (profForm) profForm.style.display = 'none';
        toast(tr('Imprimante « ' + name + ' » enregistrée'));
      });
    }

    if ($('#kpr-save-stations-btn')) {
      $('#kpr-save-stations-btn').addEventListener('click', function () {
        var selects = ov.querySelectorAll('.kpr-st-sel');
        var newBindings = {};
        selects.forEach(function (sel) {
          var sid = sel.getAttribute('data-station-id');
          if (sid && sel.value) newBindings[sid] = sel.value;
        });
        stConfig.bindings = newBindings;
        setStationConfig(stConfig);
        toast(tr('Routage des imprimantes par poste enregistré'));
      });
    }

    renderProfilesChips();
    renderStationRows();

    function loadOsPrinters() {
      var box = $('#kpr-os'), sel = $('#kpr-os-sel'), profSel = $('#kpr-prof-os-sel');
      if (!box || !sel) return Promise.resolve();
      var to = withTimeout(null, 6000);
      return fetch(bridgeBase() + '/kiwi/printers', { headers: bridgeHeaders(), signal: to.signal })
        .then(function (r) { to.done(); return r.ok ? r.json() : null; })
        .catch(function () { to.done(); return null; })
        .then(function (j) {
          var list = (j && j.ok && Array.isArray(j.printers)) ? j.printers : [];
          if (!list.length) { box.style.display = 'none'; return; }
          var cur = getConfig().osPrinter || j.default || '';
          var optionsHtml = list.map(function (n) {
            return '<option value="' + esc(n) + '"' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>';
          }).join('');
          sel.innerHTML = optionsHtml;
          if (profSel) profSel.innerHTML = optionsHtml;
          box.style.display = '';
        });
    }

    var bridgeUp = false;
    var localPing = null;   // la réponse du pont local (pour savoir s'il est déjà relais)
    function refreshStatus() {
      var st = $('#kpr-status'), t = $('#kpr-status-t'), test = $('#kpr-test'), scan = $('#kpr-scan');
      if (socket) {
        bridgeUp = true;
        st.className = 'kpr-status on';
        t.textContent = tr('Connexion directe à l’imprimante depuis l’app Kiwi.');
        test.disabled = false;
        if (scan) scan.disabled = false;
        paintRelay();
        return Promise.resolve({ ok: true, via: 'socket' });
      }
      t.textContent = tr('Vérification du pont…'); st.className = 'kpr-status off';
      return ping().then(function (j) {
        localPing = j;
        bridgeUp = !!j;
        if (scan) scan.disabled = !j;
        if (j) {
          if (!bridgeCapability && bridgeMode !== 'legacy') {
            st.className = 'kpr-status off';
            t.textContent = tr('Pont détecté · mettez à jour Kiwi Printer Bridge pour sécuriser cette caisse.');
            test.disabled = true;
            if (scan) scan.disabled = true;
            return { ok: false, reason: 'bridge-capability-required' };
          }
          st.className = 'kpr-status on';
          t.textContent = tr('Pont connecté · v' + (j.version || '?')
            + (bridgeMode === 'legacy' ? ' · impression maintenue, mise à jour de sécurité recommandée' : ''));
          test.disabled = false;
          loadOsPrinters();
          paintRelay();
          return;
        }
        var box = $('#kpr-os'); if (box) box.style.display = 'none';
        st.className = 'kpr-status off';
        t.innerHTML = 'Kiwi Printer Bridge non détecté sur cet appareil. <a data-activation=money href="' + esc(BRIDGE_DOWNLOAD) + '" target="_blank" rel="noopener">Télécharger le pont</a> · <button type="button" class="kpr-recheck" id="kpr-recheck">Revérifier</button>';
        var rc = $('#kpr-recheck'); if (rc) rc.addEventListener('click', refreshStatus);
        test.disabled = true;
        /* Pas de pont ici (iPad, tablette, PC sans pont) : un pont EN LIGNE via
         * le relais suffit · l'imprimante réseau ci-dessous passe par lui. */
        return paintRelay().then(function (rs) {
          if (!ov.isConnected || !rs || !rs.online) return;
          var names = rs.bridges.filter(function (b) { return b.online; }).map(function (b) { return b.name || 'pont'; });
          st.className = 'kpr-status on';
          t.textContent = tr('Relais Kiwi · ' + (names.length > 1 ? names.length + ' ponts en ligne' : 'pont « ' + names[0] + ' » en ligne') + ' · l’imprimante réseau s’imprime via ce pont');
          test.disabled = false; bridgeUp = true;
        });
      });
    }
    /* ── Le panneau du relais ─────────────────────────────────────────────── */
    /* Ce que raconte un ticket non imprimé : son genre dans la langue de
       l'écran, la table ou la commande quand CE poste l'a déposé (le serveur ne
       les connaît pas), l'heure dans le format de la langue et non celui de
       l'appareil. Avant : « kitchen · 10/27/2026, 2:14:03 PM ». */
    var KIND_FR = { kitchen: 'Bon de cuisine', receipt: 'Ticket de caisse', label: 'Étiquette', other: 'Impression' };
    function unprintedWhat(job) {
      var lang = 'fr', label = '', when = '';
      try { lang = (window.KiwiCaisseLang && window.KiwiCaisseLang.get && window.KiwiCaisseLang.get()) || (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr'; } catch (_) {}
      try { label = (window.KiwiKitchenPrint && window.KiwiKitchenPrint.relayLabel && window.KiwiKitchenPrint.relayLabel(job.id)) || ''; } catch (_) {}
      try { when = new Date(job.created_ts).toLocaleString(lang === 'ar' ? 'ar-MA-u-nu-latn' : lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (_) {}
      return [say(KIND_FR[job.kind] || KIND_FR.other), label, when].filter(Boolean).join(' · ');
    }
    function fmtAgo(ts) {
      if (!ts) return 'jamais vu';
      var sec = Math.round((Date.now() - ts) / 1000);
      return sec < 60 ? 'vu à l’instant' : sec < 3600 ? 'vu il y a ' + Math.round(sec / 60) + ' min' : 'vu il y a ' + Math.round(sec / 3600) + ' h';
    }
    function paintRelay() {
      var st = $('#kpr-relay-status'), t = $('#kpr-relay-status-t'), list = $('#kpr-relay-list'), local = $('#kpr-relay-pair-local');
      if (!st) return Promise.resolve(null);
      return relayProbe(true).then(function (rs) {
        if (!ov.isConnected) return rs;
        if (!rs.provisioned) { st.className = 'kpr-status off'; t.textContent = tr('Relais pas encore activé côté serveur.'); return rs; }
        if (rs.authed === false) { st.className = 'kpr-status off'; t.textContent = tr('Cet appareil n’est pas reconnu comme la caisse d’un commerce · appairez-le d’abord.'); return rs; }
        var on = rs.bridges.filter(function (b) { return b.online; }).length;
        st.className = 'kpr-status ' + (on ? 'on' : 'off');
        t.textContent = tr(!rs.bridges.length ? 'Aucun pont associé à ce commerce.'
          : on ? (on + ' pont' + (on > 1 ? 's' : '') + ' en ligne') : 'Pont associé mais hors ligne · lancez Kiwi Printer Bridge sur l’ordinateur du comptoir.');
        list.innerHTML = rs.bridges.map(function (b) {
          return '<div class="kpr-relay-row"><span class="kpr-d ' + (b.online ? 'on' : '') + '"></span><b>' + esc(b.name || 'Pont') + '</b> <small>' + esc((b.platform ? b.platform + ' · ' : '') + (b.online ? 'en ligne' : fmtAgo(b.last_seen_ts))) + '</small>' +
            '<button type="button" class="kpr-prof-del" data-relay-revoke="' + esc(b.id) + '" aria-label="Dissocier">×</button></div>';
        }).join('');
        list.querySelectorAll('[data-relay-revoke]').forEach(function (b) {
          b.addEventListener('click', function () { askRevoke(this); });
        });
        relayFetch('/jobs' + relayMerchantQS()).then(function (r) {
          if (!ov.isConnected || !r.j || !r.j.ok) return;
          (r.j.jobs || []).forEach(function (job) {
            var row = document.createElement('div'); row.className = 'kpr-relay-row';
            var i18n = window.KiwiI18n, dict = i18n && i18n.T[i18n.getLang()];
            var unsure = job.status === 'uncertain';
            var words = dict ? [dict[unsure ? 'print.uncertain' : 'print.notPrinted'], dict['print.reprint'], dict['print.recoveryFailed']] : [say(unsure ? 'Impression incertaine' : 'Non imprimé'), say('Réimprimer'), say('Réimpression non confirmée. Vérifiez la connexion et le pont, puis réessayez.')];
            row.innerHTML = '<span>' + esc(words[0] + ' · ' + unprintedWhat(job)) + '</span><button type="button">' + words[1] + '</button>';
            row.querySelector('button').onclick = function () {
              var btn = this; btn.disabled = true;
              function failed() {
                btn.disabled = false;
                var error = row.querySelector('[role="alert"]');
                if (!error) { error = document.createElement('small'); error.setAttribute('role', 'alert'); row.appendChild(error); }
                error.textContent = words[2];
              }
              relayFetch('/jobs' + relayMerchantQS(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reprint-expired', id: job.id }) }).then(function (answer) {
                if (answer.j && answer.j.ok) row.remove(); else failed();
              }).catch(failed);
            };
            list.appendChild(row);
          });
        });
        // Le pont local n'est pas encore relais : on peut l'associer d'un clic, sans code à taper.
        if (local) local.style.display = (localPing && localPing.relay && !localPing.relay.paired) ? '' : 'none';
        return rs;
      });
    }
    /* Dissocier un pont : la question s'ouvre sous la ligne, DANS ce panneau.
       Plus de boîte native (confirm) : elle sortait de la langue de la caisse
       et de son focus. Pas Kiwi.modal non plus : la caisse ne l'a pas, et sur
       le tableau de bord il peindrait sous ce panneau (z-index 9990 < 9998).
       Le focus part sur Annuler (le choix sûr), Échap ou Annuler referment
       sans rien faire et rendent le focus au × d'origine ; seul « Dissocier »
       appelle le relais. Les textes passent par say(), comme le reste. */
    var askSeq = 0;
    function askRevoke(btn) {
      var row = btn.closest('.kpr-relay-row');
      if (!row || (row.nextElementSibling && row.nextElementSibling.classList.contains('kpr-ask'))) return;
      var id = btn.getAttribute('data-relay-revoke');
      var qid = 'kpr-ask-q' + (++askSeq);
      var box = document.createElement('div');
      box.className = 'kpr-ask';
      box.setAttribute('role', 'alertdialog');
      box.setAttribute('aria-labelledby', qid);
      box.innerHTML = '<p id="' + qid + '">' + esc(say('Dissocier ce pont ? Il ne recevra plus les tickets de vos tablettes.')) + '</p>' +
        '<div class="kpr-ask-btns"><button type="button" class="kpr-btn kpr-test" data-relay-keep>' + esc(say('Annuler')) + '</button>' +
        '<button type="button" class="kpr-btn kpr-ask-yes" data-relay-confirm>' + esc(say('Dissocier')) + '</button></div>';
      row.parentNode.insertBefore(box, row.nextSibling);
      btn.setAttribute('aria-expanded', 'true');
      function end() {
        if (box.parentNode) box.parentNode.removeChild(box);
        btn.setAttribute('aria-expanded', 'false');
        try { btn.focus(); } catch (_) {}
      }
      box.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        e.preventDefault(); e.stopPropagation(); end();
      });
      box.querySelector('[data-relay-keep]').addEventListener('click', end);
      var yes = box.querySelector('[data-relay-confirm]');
      yes.addEventListener('click', function () {
        yes.disabled = true;
        relayRevoke(id).then(function (ok) { toast(tr(ok ? 'Pont dissocié' : 'Échec')); paintRelay(); refreshStatus(); });
      });
      try { box.querySelector('[data-relay-keep]').focus(); } catch (_) {}
    }
    function showPairCode(j) {
      var box = $('#kpr-relay-code'); if (!box) return;
      box.style.display = '';
      var mins = Math.max(1, Math.round((j.expires_ts - Date.now()) / 60000));
      box.innerHTML = '<div class="kpr-code-num">' + esc(String(j.code)) + '</div>' +
        '<p class="kpr-note">Sur l’ordinateur du comptoir, lancez Kiwi Printer Bridge puis ouvrez <b>http://127.0.0.1:9110</b> et tapez ce code. Valable ' + mins + ' min · une seule fois.</p>';
    }
    var pairBtn = $('#kpr-relay-pair');
    if (pairBtn) pairBtn.addEventListener('click', function () {
      var b = this; b.disabled = true;
      relayPairCode().then(function (j) {
        b.disabled = false;
        if (!j.ok) { toast(tr('Impossible de générer le code · ' + frReason(j.reason))); return; }
        showPairCode(j);
      });
    });
    var pairLocal = $('#kpr-relay-pair-local');
    if (pairLocal) pairLocal.addEventListener('click', function () {
      var b = this; b.disabled = true; var orig = b.textContent; b.textContent = tr('Association…');
      relayPairCode().then(function (j) {
        if (!j.ok) { b.disabled = false; b.textContent = orig; toast(tr('Impossible de générer le code · ' + frReason(j.reason))); return null; }
        return pairLocalBridge(j.code);
      }).then(function (r) {
        b.disabled = false; b.textContent = orig;
        if (r === null) return;
        toast(tr(r && r.ok ? 'Ce pont imprime désormais les tickets de vos tablettes' : ('Échec · ' + ((r && r.error) || 'pont injoignable'))));
        setTimeout(function () { ping().then(function (j) { localPing = j; paintRelay(); }); }, 800);
      });
    });

    $('#kpr-close').addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    $('#kpr-save').addEventListener('click', function () {
      var f = readForm();
      if (!validIp(f.ip)) { toast(tr('Adresse invalide · attendu : 192.168.1.50 (ou un nom comme EPSON.local)')); $('#kpr-ip').focus(); return; }
      if (!validPort(f.port)) { toast(tr('Port invalide · un nombre entre 1 et 65535 (9100 en général)')); $('#kpr-port').focus(); return; }
      setConfig(Object.assign(f, { osPrinter: '' }));
      paintTarget();
      toast(tr('Imprimante enregistrée'));
      close();
    });

    $('#kpr-os-save').addEventListener('click', function () {
      var sel = $('#kpr-os-sel'); if (!sel || !sel.value) return;
      setConfig({ osPrinter: sel.value, ip: '' });
      var t = $('#kpr-os-status-t'), st = $('#kpr-os-status');
      if (t) t.textContent = tr('Choisie · ' + sel.value);
      if (st) st.className = 'kpr-status on';
      toast(tr('Imprimante enregistrée'));
      close();
    });

    $('#kpr-os-test').addEventListener('click', function () {
      var sel = $('#kpr-os-sel'); if (!sel || !sel.value) return;
      var btn = this, orig = btn.textContent;
      btn.disabled = true; btn.textContent = tr('Impression…');
      var cfg2 = getConfig();
      var to = withTimeout(null, 12000);
      saveBridgeTarget({ osPrinter: sel.value }).then(function (saved) {
        if (!saved || !saved.ok) return { ok: false, error: saved && saved.error || 'bridge-capability-required' };
        return fetch(bridgeBase() + '/kiwi/print', {
          method: 'POST', headers: bridgeHeaders({ 'Content-Type': 'application/json' }), signal: to.signal,
          body: JSON.stringify({ printerName: sel.value,
            dataB64: window.KiwiEscPos.toB64(window.KiwiEscPos.testSlip({ paper: cfg2.paper })) }),
        }).then(function (r) { to.done(); return r.json().catch(function () { return null; }); });
      })
        .then(function (j) {
          btn.textContent = orig; btn.disabled = false;
          toast(tr(j && j.ok ? 'Ticket test envoyé' : ('Échec · ' + ((j && j.error) || 'inconnu'))));
        })
        .catch(function () {
          to.done(); btn.textContent = orig; btn.disabled = false;
          toast(tr('Échec · pont injoignable'));
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

    if ($('#kpr-bt-connect')) $('#kpr-bt-connect').addEventListener('click', function () {
      var st = $('#kpr-bt-status'), t = $('#kpr-bt-status-t'), btn = this;
      if (!navigator.bluetooth) { st.className = 'kpr-status off'; t.textContent = tr('Bluetooth indisponible sur ce navigateur. Utilisez Chrome (ordinateur ou Android).'); return; }
      btn.disabled = true; var orig = btn.textContent; btn.textContent = tr('Recherche…');
      connectBluetooth().then(function (r) {
        btn.disabled = false; btn.textContent = tr('Changer d’imprimante');
        st.className = 'kpr-status on'; t.textContent = tr('Connectée · ' + (r.name || 'Imprimante'));
        $('#kpr-bt-test').disabled = false;
        toast(tr('Imprimante Bluetooth connectée'));
      }, function (e) {
        btn.disabled = false; btn.textContent = orig; st.className = 'kpr-status off';
        var m = (e && e.message) || '';
        if (/no-web-bluetooth/.test(m)) t.textContent = tr('Bluetooth indisponible sur ce navigateur. Utilisez Chrome (ordinateur ou Android).');
        else if (/cancel|NotFound|User|chooser/i.test(m)) t.textContent = tr('Aucune imprimante sélectionnée.');
        else if (/no-writable/.test(m)) t.textContent = tr('Imprimante trouvée mais non compatible (aucun canal d’écriture).');
        else t.textContent = tr('Connexion impossible · ' + m);
      });
    });
    if ($('#kpr-bt-test')) $('#kpr-bt-test').addEventListener('click', function () {
      var btn = this; btn.disabled = true; var orig = btn.textContent; btn.textContent = tr('Impression…');
      printBytes(window.KiwiEscPos.testSlip({ paper: getConfig().paper })).then(function (res) {
        btn.textContent = orig; btn.disabled = !btConnected();
        toast(tr(res.ok ? 'Ticket test envoyé' : ('Échec · ' + (res.reason || 'inconnu'))));
      });
    });

    if ($('#kpr-usb-connect')) {
      $('#kpr-usb-connect').addEventListener('click', function () {
        var st = $('#kpr-usb-status'), t = $('#kpr-usb-status-t'), btn = this;
        btn.disabled = true; var orig = btn.textContent; btn.textContent = tr('Recherche…');
        connectUsb().then(function (r) {
          btn.disabled = false; btn.textContent = tr('Changer d’imprimante');
          st.className = 'kpr-status on'; t.textContent = tr('Connectée · ' + (r.name || 'Imprimante USB'));
          $('#kpr-usb-test').disabled = false;
          toast(tr('Imprimante USB connectée'));
        }, function (e) {
          btn.disabled = false; btn.textContent = orig; st.className = 'kpr-status off';
          var m = (e && e.message) || '';
          if (/no-webusb/.test(m)) t.textContent = tr('USB indisponible sur ce navigateur. Utilisez Chrome (ordinateur ou Android).');
          else if (/cancel|NotFound|chooser|No device selected/i.test(m)) t.textContent = tr('Aucune imprimante sélectionnée.');
          else if (/no-bulk-out/.test(m)) t.textContent = tr('Appareil trouvé mais ce n’est pas une imprimante USB standard.');
          else if (/SecurityError|NotAllowed/i.test(m)) t.textContent = tr('Accès USB refusé par le navigateur.');
          else if (/access denied|claim|busy|InvalidState/i.test(m)) t.textContent = tr('Imprimante déjà utilisée par le système. Retirez-la des imprimantes installées (ou utilisez le port réseau), puis réessayez.');
          else t.textContent = tr('Connexion impossible · ' + m);
        });
      });
      $('#kpr-usb-test').addEventListener('click', function () {
        var btn = this; btn.disabled = true; var orig = btn.textContent; btn.textContent = tr('Impression…');
        printBytes(window.KiwiEscPos.testSlip({ paper: getConfig().paper })).then(function (res) {
          btn.textContent = orig; btn.disabled = !usbConnected();
          toast(tr(res.ok ? 'Ticket test envoyé' : ('Échec · ' + (res.reason || 'inconnu'))));
        });
      });
    }

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
        if (d) da.setAttribute('href', d);
        dp.style.display = d ? '' : 'none';
      }
    });

    $('#kpr-test').addEventListener('click', function () {
      var f = readForm();
      if (!f.ip) { toast(tr('Saisissez d’abord l’adresse IP de l’imprimante')); $('#kpr-ip').focus(); return; }
      if (!validIp(f.ip)) { toast(tr('Adresse invalide · attendu : 192.168.1.50 (ou un nom comme EPSON.local)')); $('#kpr-ip').focus(); return; }
      if (!validPort(f.port)) { toast(tr('Port invalide · un nombre entre 1 et 65535 (9100 en général)')); $('#kpr-port').focus(); return; }
      var btn = this; btn.disabled = true; var orig = btn.textContent; btn.textContent = tr('Impression…');
      var target = { ip: f.ip, port: Number(f.port) || 9100 };
      var slip = window.KiwiEscPos.testSlip({ ip: f.ip, paper: f.paper });
      var attempt = socket
        ? socket.probe({ host: target.ip, port: target.port, timeoutMs: 4000 }).then(function (probe) {
            return probe && probe.ok ? nativeSocketSend(slip, target) : { ok: false, reason: (probe && probe.code) || 'unreachable' };
          }, function () { return { ok: false, reason: 'unreachable' }; })
        : bridgePrintBytes(slip, target);
      attempt.then(function (res) {
        btn.textContent = orig; btn.disabled = !(socket || bridgeUp);
        toast(tr(res.ok ? 'Ticket test envoyé' : ('Échec · ' + frReason(res.reason))));
      });
    });

    var scanBtn = $('#kpr-scan');
    if (scanBtn) scanBtn.addEventListener('click', function () {
      var out = $('#kpr-scan-out');
      if (!printQueueIdle()) { if (out) { out.style.display = ''; out.textContent = tr('Une impression est en cours. La recherche démarrera une fois la file au repos.'); } return; }
      scanBtn.disabled = true; var orig = scanBtn.textContent; scanBtn.textContent = tr('Recherche en cours…');
      if (out) { out.style.display = ''; out.textContent = ''; }
      var scanAttempt;
      if (socket) {
        scanAttempt = socket.scan({ port: Number($('#kpr-port').value) || 9100, timeoutMs: 600 }).then(function (r) {
          if (!r || !r.ok) return { ok: false, error: (r && r.code) || 'unreachable' };
          return { ok: true, printers: (r.hosts || []).map(function (h) { return { ip: h.host, ms: h.ms }; }) };
        }, function () { return null; });
      } else {
        var to = withTimeout(null, 30000);
        scanAttempt = fetch(bridgeBase() + '/kiwi/scan', { headers: bridgeHeaders(), signal: to.signal })
          .then(function (r) { to.done(); return r.status === 404 ? { legacy: true } : r.json(); })
          .catch(function () { to.done(); return null; });
      }
      scanAttempt
        .then(function (j) {
          scanBtn.textContent = orig; scanBtn.disabled = !(socket || bridgeUp);
          if (!out) return;
          if (!j) { out.textContent = tr('Pont injoignable · relancez Kiwi Printer Bridge puis réessayez.'); return; }
          if (j.legacy) { out.textContent = tr('Détection indisponible sur ce pont · installez la version 1.3 ou plus récente.'); return; }
          if (!j.ok) { out.textContent = tr('Recherche impossible · ' + frReason(j.error)); return; }
          if (!j.printers.length) { out.textContent = tr('Aucune imprimante réseau trouvée. Vérifiez qu’elle est allumée et sur le même réseau que cet ordinateur.'); return; }
          out.innerHTML = tr(j.printers.length > 1 ? 'Trouvées :' : 'Trouvée :') + ' ' + j.printers.map(function (p) {
            return '<button type="button" class="kpr-btc kpr-scan-pick" data-ip="' + esc(p.ip) + '">' + esc(p.ip) + '</button>';
          }).join(' ');
          out.querySelectorAll('.kpr-scan-pick').forEach(function (b) {
            b.addEventListener('click', function () {
              $('#kpr-ip').value = this.getAttribute('data-ip');
              $('#kpr-port').value = '9100';
              toast(tr('Adresse remplie · imprimez un ticket test puis enregistrez'));
            });
          });
        });
    });

    var diagnosticsBtn = $('#kpr-diagnostics');
    if (diagnosticsBtn) diagnosticsBtn.addEventListener('click', function () {
      var queue = window.KiwiKitchenPrint;
      if (!queue || typeof queue.exportDiagnostics !== 'function') { toast(tr('Diagnostic indisponible')); return; }
      try {
        var blob = new Blob([queue.exportDiagnostics()], { type: 'application/json' });
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kiwi-print-diagnostic.json'; a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        toast(tr('Diagnostic exporté'));
      } catch (_) { toast(tr('Export impossible')); }
    });

    refreshStatus();
    paintTarget();

    reconnectUsb().then(function (r) {
      if (!r || !ov.isConnected) return;
      var st = $('#kpr-usb-status'), t = $('#kpr-usb-status-t'), btn = $('#kpr-usb-connect');
      if (!st || !t) return;
      st.className = 'kpr-status on';
      t.textContent = tr('Connectée · ' + (r.name || 'Imprimante USB'));
      if (btn) btn.textContent = tr('Changer d’imprimante');
      var test = $('#kpr-usb-test'); if (test) test.disabled = false;
    });
  }

  core.install({ openSetup: openSetup });
})(window.KiwiPrinter.__core);
