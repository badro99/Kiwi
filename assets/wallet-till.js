/* La carte fidélité Wallet, côté caisse.
 *
 * 1. LE SCAN. La carte (Apple Wallet, Google Wallet ou la carte web /carte)
 *    porte un QR « KIWI-C:<id client> ». Une douchette le tape comme un code
 *    article : ce module écoute la rafale AVANT les écouteurs de chaque caisse
 *    (window, phase de capture), et si c'est une carte, il la garde pour lui
 *    (sinon l'épicerie proposerait de créer un article « KIWI-C:… ») et pose le
 *    client sur la vente ouverte : le ticket boutique ou maison (gestionnaire
 *    enregistré par leur sales.js), la note du restaurant (KiwiCaisseSaleClient),
 *    la vente des autres comptoirs (KiwiPosSale).
 *    Une douchette réglée en clavier américain sur une caisse française tape
 *    « KIZI)CM… » : W et Z, A et Q s'échangent, « : » devient M, « - » une
 *    parenthèse. On ne lit donc pas le texte, on le RAPPROCHE du carnet : les
 *    deux côtés passent par la même forme (lettres jumelles confondues,
 *    ponctuation retirée) et seul un client unique est retenu.
 * 2. LE QR DE CAISSE. Un client déjà connu ne reçoit pas de carte en tapant son
 *    numéro (personne d'autre que lui ne doit pouvoir la prendre) : la caisse
 *    affiche un QR à usage unique (POST /api/wallet/till-token, dix minutes),
 *    il le scanne avec son téléphone et sa carte s'ouvre. Le bouton apparaît à
 *    côté du client attaché, quand le commerce a activé la carte.
 * Spec : docs/superpowers/specs/2026-11-27-wallet-loyalty-card-design.md. */
(function () {
  'use strict';
  var tr = function (s, vars) {
    var out = s; try { out = window.KiwiCaisseLang ? window.KiwiCaisseLang.tr(s) : s; } catch (_) {}
    return String(out).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? String(vars[k]) : m; });
  };

  /* ── lire une carte ── */
  function parseCardScan(code) {
    var m = /^KIWI-C:([A-Za-z0-9_.-]{1,80})$/.exec(String(code == null ? '' : code).trim());
    return m ? m[1] : null;
  }
  var TWIN = { q: 'a', z: 'w', ',': 'm', ';': 'm' };
  function canon(s) {
    /* « - » tapé par une douchette AZERTY sur un clavier américain arrive en 6. */
    return String(s == null ? '' : s).toLowerCase().replace(/./g, function (ch) { return TWIN[ch] || ch; }).replace(/[^a-z0-9]/g, '').replace(/^kiwi6c/, 'kiwic');
  }
  var looksLikeCard = function (code) { return canon(code).indexOf('kiwic') === 0 && String(code).length >= 8; };
  /* Le client du carnet que ce scan désigne, ou null (inconnu, ou ambigu). */
  function findCard(code, list) {
    var id = parseCardScan(code);
    list = list || [];
    if (id) for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    var s = canon(code), hit = null, n = 0;
    for (var j = 0; j < list.length; j++) {
      var k = list[j] && canon(list[j].id);
      if (k && (s === 'kiwic' + k || s === 'kiwicm' + k)) { hit = list[j]; n++; }
    }
    return n === 1 ? hit : null;
  }
  function book() { try { return (window.KiwiClients && window.KiwiClients.list()) || []; } catch (_) { return []; } }

  /* ── le petit message ── */
  var styled = false;
  function style() {
    if (styled) return; styled = true;
    var css = '.kw-wt-toast{position:fixed;z-index:9600;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 22px);transform:translateX(-50%);max-width:calc(100vw - 32px);padding:11px 16px;border-radius:14px;background:var(--riad,#053B2C);color:var(--paper,#F7F5F0);font:600 14px/1.3 "Inter Tight",system-ui,sans-serif;box-shadow:0 10px 26px -12px rgba(5,59,44,.6)}' +
      '.kw-wt-chip{flex:none;width:36px;height:36px;border:0;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--atlas,#0B6E4F) 12%,transparent);color:var(--atlas,#0B6E4F);cursor:pointer}' +
      '.kw-wt-chip.is-wide{width:auto;align-self:flex-start;gap:8px;padding:0 12px;font:600 13px/1 "Inter Tight",system-ui,sans-serif}' +
      '.kw-wt-chip span,.kw-wt-x span{width:20px;height:20px;background:currentColor;-webkit-mask:var(--i) center/contain no-repeat;mask:var(--i) center/contain no-repeat}' +
      '.kw-wt-veil{position:fixed;inset:0;z-index:9500;display:grid;place-items:center;padding:16px;background:rgba(10,15,13,.55)}' +
      '.kw-wt-sheet{position:relative;width:min(380px,100%);padding:22px 20px 20px;border-radius:22px;background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D);text-align:center;font-family:"Inter Tight",system-ui,sans-serif}' +
      '.kw-wt-sheet h2{margin:0 0 4px;font-size:20px;font-weight:600;letter-spacing:-.01em}.kw-wt-sheet p{margin:0;color:#5B635F;font-size:14px}' +
      '.kw-wt-qr{margin:16px auto 12px;width:232px;padding:12px;border-radius:16px;background:#FFFFFF}.kw-wt-qr svg{display:block;width:100%;height:auto}' +
      '.kw-wt-x{position:absolute;top:10px;inset-inline-end:10px;width:40px;height:40px;border:0;border-radius:12px;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer}';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  }
  var toastTimer = 0;
  function toast(text) {
    style();
    var el = document.querySelector('.kw-wt-toast');
    if (!el) { el = document.createElement('div'); el.className = 'kw-wt-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = text;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.remove(); }, 2600);
  }

  /* ── poser le client sur la vente ouverte ── */
  var handlers = Object.create(null);
  function on(kind, fn) { handlers[kind] = fn; }
  function deliver(rec) {
    var cls = document.body.className;
    for (var kind in handlers) if (new RegExp('(^|\\s)is-pos-' + kind + '(\\s|$)').test(cls)) { handlers[kind](rec); return true; }
    var S = window.KiwiCaisseSaleClient;
    if (S && S.available && S.available()) { S.attach(rec); return true; }
    var P = window.KiwiPosSale;
    if (P && P.attachClient && P.isReal && P.isReal()) { P.attachClient(rec); toast(tr('Carte de {name} sur la vente', { name: rec.name || '' })); return true; }
    toast(tr('Ouvrez une note avant de scanner la carte'));
    return true;
  }
  /* Une carte ? On la prend (true). Sinon la caisse continue (false). */
  function take(code) {
    if (!looksLikeCard(code)) return false;
    var rec = findCard(code, book());
    if (!rec) { toast(tr('Carte fidélité inconnue sur cette caisse')); return true; }
    return deliver(rec);
  }

  /* La douchette : une rafale rapide terminée par Entrée. Les chiffres se lisent
     par la touche physique, comme dans pos-boutique/checkout.js (wedgeChar). */
  var buf = '', last = 0, started = 0;
  window.addEventListener('keydown', function (e) {
    var now = Date.now();
    if (now - last > 120) buf = '';
    last = now;
    if (e.key === 'Enter') {
      var code = buf, n = code.length, span = now - started;
      buf = '';
      if (n >= 8 && span / n < 55 && looksLikeCard(code)) {
        e.preventDefault(); e.stopImmediatePropagation();
        var t = e.target, tag = (t && t.tagName) || '';
        if ((tag === 'INPUT' || tag === 'TEXTAREA') && typeof t.value === 'string' && t.value.slice(-n) === code) t.value = t.value.slice(0, -n);
        take(code);
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!buf) started = now;
    var c = e.code || '';
    buf += /^Digit[0-9]$/.test(c) ? c.slice(5) : /^Numpad[0-9]$/.test(c) ? c.slice(6) : (e.key && e.key.length === 1 ? e.key : '');
  }, true);

  /* ── le QR de caisse ── */
  var state = { on: null, at: 0, merchant: '' }, asking = Object.create(null);
  function merchant() { try { return (window.KiwiClients && window.KiwiClients.bookId && window.KiwiClients.bookId()) || ''; } catch (_) { return ''; } }
  /* La carte est-elle activée ici ? Lu une fois par quart d'heure (route publique). */
  function cardOn(done) {
    var m = merchant();
    if (!m) return done(false);
    if (state.merchant === m && state.on != null && Date.now() - state.at < 15 * 60000) return done(state.on);
    /* One question in flight per store: the 2027 bill asks on every paint. */
    if (asking[m]) { asking[m].push(done); return; }
    asking[m] = [done];
    var answer = function (ok) { var q = asking[m] || []; delete asking[m]; q.forEach(function (f) { try { f(ok); } catch (_) {} }); };
    fetch('/api/wallet/enroll?merchant=' + encodeURIComponent(m), { cache: 'no-store' })
      .then(function (r) { return r.ok; }, function () { return false; })
      .then(function (ok) {
        var was = state.on;
        state = { on: ok, at: Date.now(), merchant: m }; if (ok) loadQr().catch(function () {}); answer(ok);
        try { document.documentElement.toggleAttribute('data-wallet-card', ok); } catch (_) {}
        /* The 2027 bill draws its card buttons from isOn(): it repaints when the answer lands. */
        if (was !== ok) try { window.dispatchEvent(new CustomEvent('kiwi-wallet-state')); } catch (_) {}
      });
  }
  /* Le lien du QR imprimé sur le reçu : /carte/<boutique>?r=<id serveur de la
     vente>. Seulement pour une vente sans client (sinon le passage est déjà le
     sien), quand la carte est activée ici, et pour un id tiré au hasard : un id
     calculable depuis un numéro de ticket laisserait n'importe qui créditer les
     tickets des autres. L'id serveur est celui de live-link.js › stableId :
     FNV-1a de « boutique|id », sans zéros devant, puis les 32 derniers
     caractères de l'id (tools/wallet-till-test.mjs compare les deux). */
  var UUID_SALE = /^sale-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  var SERVER_SALE = /^sale-ref-[0-9a-f]{1,8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  function serverSaleId(m, sale) {
    if (SERVER_SALE.test(String(sale.serverId || ''))) return sale.serverId;
    var src = String(sale.syncId || sale.id || '');
    if (!UUID_SALE.test(src)) return '';
    var s = m + '|' + src, h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'sale-ref-' + (h >>> 0).toString(16) + '-' + src.slice(-32);
  }
  function cardUrl(sale, origin) {
    if (!sale) return '';
    var m = merchant();
    if (typeof fetch === 'function') cardOn(function () {});          /* tenu à jour pour le reçu suivant */
    if (!m || state.merchant !== m || state.on !== true) return '';
    if (sale.clientId && sale.clientId !== 'passage') return '';
    if (sale.kind && sale.kind !== 'vente') return '';                 /* une avance n'est pas encore un passage */
    var id = serverSaleId(m, sale);
    if (!id) return '';
    var base = origin || (/^https:/.test(location.origin) ? location.origin : 'https://kiwi-os.com');
    return base + '/carte/' + encodeURIComponent(m) + '?r=' + id;
  }

  var qrLib = null;
  function loadQr() {
    if (window.KiwiQR) return Promise.resolve();
    return qrLib || (qrLib = new Promise(function (ok, ko) { var s = document.createElement('script'); s.src = '/assets/qrcode.js?v=1'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }));
  }
  function icon(name) { var i = document.createElement('span'); i.style.setProperty('--i', 'url("/assets/icons/material/' + name + '.svg")'); i.setAttribute('aria-hidden', 'true'); return i; }
  function offer(rec) {
    if (!rec || !rec.id) return;
    style();
    var veil = document.createElement('div'); veil.className = 'kw-wt-veil';
    var sheet = document.createElement('div'); sheet.className = 'kw-wt-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
    var h = document.createElement('h2'); h.textContent = tr('Carte fidélité de {name}', { name: rec.name || '' });
    var p = document.createElement('p'); p.textContent = tr('Un instant…');
    var qr = document.createElement('div'); qr.className = 'kw-wt-qr'; qr.hidden = true;
    var x = document.createElement('button'); x.type = 'button'; x.className = 'kw-wt-x'; x.setAttribute('aria-label', tr('Fermer')); x.appendChild(icon('close'));
    [x, h, qr, p].forEach(function (n) { sheet.appendChild(n); });
    veil.appendChild(sheet); document.body.appendChild(veil);
    var close = function () { clearTimeout(expire); veil.remove(); document.removeEventListener('keydown', esc, true); };
    var esc = function (e) { if (e.key === 'Escape') close(); };
    var expire = 0;
    x.onclick = close; veil.onclick = function (e) { if (e.target === veil) close(); };
    document.addEventListener('keydown', esc, true);
    fetch('/api/wallet/till-token', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: merchant(), clientId: rec.id }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, b: b }; }); })
      .then(function (r) {
        if (!r.ok || !r.b.url) { p.textContent = r.b && r.b.error === 'client-not-found' ? tr('Ce client n’est pas encore synchronisé, réessayez dans un instant') : tr('Carte indisponible pour le moment'); return; }
        return loadQr().then(function () {
          qr.innerHTML = window.KiwiQR.svg(r.b.url, { size: 208, margin: 2, ecl: 'M', dark: '#0A0F0D', light: '#FFFFFF' });
          qr.hidden = false;
          p.textContent = tr('Le client scanne ce code avec son téléphone. Valable dix minutes, une seule fois.');
          expire = setTimeout(function () { qr.hidden = true; p.textContent = tr('Code expiré, rouvrez la carte pour en créer un autre'); }, ((r.b.expiresIn || 600) - 5) * 1000);
        });
      })
      .catch(function () { p.textContent = tr('Carte indisponible pour le moment'); });
  }
  /* Le bouton du client attaché, posé juste après `after` quand la carte est
     activée et qu'un vrai client est là, retiré sinon. `wide` : une ligne avec
     son libellé (ticket boutique, en colonne) ; sinon une icône (note restaurant). */
  function chip(after, rec, opts) {
    if (!after || !after.parentNode) return;
    var mine = function () { var n = after.nextElementSibling; return n && n.classList.contains('kw-wt-chip') ? n : null; };
    if (!rec || !rec.id || rec.id === 'passage') { var gone = mine(); if (gone) gone.remove(); return; }
    cardOn(function (yes) {
      var cur = mine();
      if (!yes) { if (cur) cur.remove(); return; }
      if (!cur) {
        style();
        cur = document.createElement('button'); cur.type = 'button'; cur.className = 'kw-wt-chip' + (opts && opts.wide ? ' is-wide' : '');
        cur.setAttribute('aria-label', tr('Carte Wallet du client')); cur.title = tr('Carte Wallet du client');
        cur.appendChild(icon('account_balance_wallet'));
        if (opts && opts.wide) { var l = document.createElement('b'); l.textContent = tr('Carte Wallet'); cur.appendChild(l); }
        after.insertAdjacentElement('afterend', cur);
      }
      cur.onclick = function (e) { e.preventDefault(); e.stopPropagation(); offer(rec); };
    });
  }

  /* La note du restaurant (caisse-accounting.js, renderSaleClient) réécrit son
     libellé à chaque client posé ou retiré : on suit ce libellé plutôt que
     d'ajouter un appel de plus dans la caisse. */
  function watchNote() {
    var label = document.getElementById('rp-client-label');
    var open = label && label.closest('.rp-client-open');
    if (!open || !window.MutationObserver) return;
    var paint = function () {
      var S = window.KiwiCaisseSaleClient, id = null;
      try { id = S && S.current && S.current(); } catch (_) {}
      var rec = null;
      try { rec = id && window.KiwiClients && window.KiwiClients.get(id); } catch (_) {}
      chip(open, rec ? { id: rec.id, name: rec.name } : null);
    };
    new MutationObserver(paint).observe(label, { childList: true, characterData: true, subtree: true });
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchNote); else watchNote();
  setTimeout(function () { if (typeof fetch === 'function') cardOn(function () {}); }, 4000);   /* le premier reçu du jour sait déjà si la carte est activée */

  /* Is the card on for this store, as last read (null before the first answer)?
     Asking refreshes a stale answer in the background. */
  function isOn() {
    var m = merchant();
    if (!m) return false;
    if (typeof fetch === 'function') cardOn(function () {});
    return state.merchant === m && state.on === true;
  }
  /* The 2027 note's card buttons (till-frame.js) ask through one event:
     'scan' opens the camera scanner (assets/caisse/card-scan.js, loaded the
     first time from the till's lazy registry), 'card' hands the customer on
     the note their card, like the chip of the shipped note. */
  var scanLoad = null;
  function openScanner() {
    var go = function () { try { window.KiwiCardScan.open(); } catch (e) { console.warn('[card-scan]', e); } };
    if (window.KiwiCardScan) return go();
    var link = document.querySelector('[data-caisse-lazy="card-scan"]');
    if (!link) return;
    scanLoad = scanLoad || new Promise(function (ok, ko) { var s = document.createElement('script'); s.src = link.getAttribute('href'); s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
    scanLoad.then(go, function () { scanLoad = null; toast(tr('Vérifiez la connexion puis réessayez.')); });
  }
  if (window.addEventListener) window.addEventListener('kiwi-card-act', function (e) {
    var act = e && e.detail && e.detail.act;
    if (act === 'scan') return openScanner();
    if (act !== 'card') return;
    try {
      var S = window.KiwiCaisseSaleClient, id = S && S.current && S.current();
      var rec = id && window.KiwiClients && window.KiwiClients.get(id);
      if (rec) offer({ id: rec.id, name: rec.name });
    } catch (_) {}
  });
  /* The card can be switched on or off from the dashboard while a till stays open for days. */
  if (typeof setInterval === 'function') setInterval(function () { if (typeof fetch === 'function') cardOn(function () {}); }, 15 * 60000 + 1000);
  /* The counter stand's sign-up page: a new customer scans it and gets a card. */
  function enrollUrl() {
    var m = merchant();
    if (!m) return '';
    var base = /^https:/.test(location.origin) ? location.origin : 'https://kiwi-os.com';
    return base + '/carte/' + encodeURIComponent(m);
  }

  window.KiwiWalletTill = { isOn: isOn, enrollUrl: enrollUrl, loadQr: loadQr, parseCardScan: parseCardScan, canon: canon, findCard: findCard, looksLikeCard: looksLikeCard, take: take, on: on, offer: offer, chip: chip, cardUrl: cardUrl,
    cardSvg: function (url) { return window.KiwiQR ? window.KiwiQR.svg(url, { size: 140, margin: 2, ecl: 'M' }) : ''; },
    _cardState: function (x) { state = { on: x.on, at: Date.now(), merchant: x.merchant }; } };
})();
