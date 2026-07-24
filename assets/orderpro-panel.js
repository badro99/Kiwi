/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · ORDERPRO PANEL (assets/orderpro-panel.js) — the merchant's NFC tags.
 * ---------------------------------------------------------------------------
 * Order Pro is switched on per client from god mode. The moment it is, this
 * panel appears in the dashboard and answers the only question the merchant
 * actually has: "what do I write on the stickers?"
 *
 * There is no per-restaurant setup, no second domain, no build. Every store
 * shares ONE page; the store's identity is a slug in the link, so making a new
 * client live is: flip the toggle → write the tags. The links here are generated
 * from that slug:
 *     …/order?s=<merchant>&t=4     one per table (dine-in)
 *     …/order?s=<merchant>&m=takeout   the counter tag (takeaway)
 * A phone that taps the table-4 sticker in store A cannot reach store B, because
 * the slug it carries is store A's and the backend scopes everything by it.
 *
 * On Android/Chrome the browser can write the tag itself (Web NFC). Everywhere
 * else — including every iPhone — the link is copyable and gets written with the
 * free "NFC Tools" app; the panel says so rather than pretending.
 *
 * Load me AFTER orderpro-publish.js (it owns the merchant slug).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function K() { return window.Kiwi || null; }
  function merchant() { try { return (window.KiwiOrderPro && KiwiOrderPro.merchant()) || ''; } catch (_) { return ''; } }
  function vertical() { try { return (window.KiwiOrderPro && KiwiOrderPro.type()) || 'restaurant'; } catch (_) { return 'restaurant'; } }

  function enabled() {
    // Same rule as the server (functions/api/catalog.js): a PUBLIC surface is
    // never on by default — the operator has to have switched it on.
    try { return !!(window.KiwiConfig && window.KiwiConfig.features && window.KiwiConfig.features.orderpro === true); }
    catch (_) { return false; }
  }

  function base() { return location.origin + '/order'; }
  function tableLink(n) { return base() + '?s=' + encodeURIComponent(merchant()) + '&t=' + encodeURIComponent(n); }
  function takeoutLink() { return base() + '?s=' + encodeURIComponent(merchant()) + '&m=takeout'; }
  function browseLink() { return base() + '?s=' + encodeURIComponent(merchant()); }

  var nfcSupported = (typeof window.NDEFReader !== 'undefined');

  /* ── write one tag (Android/Chrome only) ─────────────────────────────────── */
  var writing = false;
  async function writeTag(url, msgEl) {
    if (!nfcSupported || writing) return;
    writing = true;
    msgEl.textContent = 'Approchez le tag du téléphone…';
    try {
      var ndef = new window.NDEFReader();
      await ndef.write({ records: [{ recordType: 'url', data: url }] });
      msgEl.textContent = 'Tag écrit ✓ — collez-le et testez-le.';
    } catch (e) {
      msgEl.textContent = (e && e.name === 'NotAllowedError')
        ? 'Autorisation NFC refusée.'
        : 'Écriture impossible. Vérifiez que le NFC est activé.';
    }
    writing = false;
  }

  function copy(text, msgEl) {
    var done = function () { msgEl.textContent = 'Lien copié ✓'; };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { msgEl.textContent = text; });
        return;
      }
    } catch (_) {}
    msgEl.textContent = text;         // no clipboard → show it so it can be selected
  }

  /* ── the panel ───────────────────────────────────────────────────────────── */
  var tableCount = 12;

  function bodyHtml() {
    var isBoutique = vertical() === 'boutique';
    var rows = [];
    if (isBoutique) {
      rows.push(row('Tag boutique', 'Le client (ou un vendeur) scanne un produit et voit prix, tailles et stock.', browseLink()));
    } else {
      rows.push(row('Tag comptoir · à emporter', 'Commande à emporter, paiement à la caisse.', takeoutLink()));
      for (var i = 1; i <= tableCount; i++) {
        rows.push(row('Table ' + i, 'Le numéro de table est déjà dans le lien — le client ne le saisit pas.', tableLink(i)));
      }
    }
    return '' +
      '<div class="opp-intro">' +
        '<p>Un seul lien par tag. Le tag connaît votre établissement : un client chez vous ne peut pas commander ailleurs.</p>' +
        (nfcSupported
          ? '<p class="opp-ok">Ce téléphone peut écrire les tags directement. Achetez des stickers NTAG213, puis « Écrire le tag ».</p>'
          : '<p class="opp-note">Pour écrire un tag : ouvrez ce panneau depuis un téléphone Android/Chrome, ou copiez le lien et écrivez-le avec l\'application gratuite <b>NFC Tools</b> (iPhone comme Android).</p>') +
      '</div>' +
      '<div class="opp-msg" data-opp-msg>Verrouillez le tag après écriture pour qu\'il ne soit pas réécrit.</div>' +
      '<div class="opp-rows">' + rows.join('') + '</div>' +
      (isBoutique ? '' :
        '<div class="opp-more"><button class="kb ghost" type="button" data-opp-more>Afficher plus de tables</button></div>');
  }

  function row(title, desc, url) {
    return '' +
      '<div class="opp-row">' +
        '<div class="opp-rmeta"><b>' + esc(title) + '</b><span>' + esc(desc) + '</span>' +
          '<code>' + esc(url) + '</code></div>' +
        '<div class="opp-racts">' +
          (nfcSupported ? '<button class="kb atlas" type="button" data-opp-write="' + esc(url) + '">Écrire le tag</button>' : '') +
          '<button class="kb ghost" type="button" data-opp-copy="' + esc(url) + '">Copier le lien</button>' +
        '</div>' +
      '</div>';
  }

  function css() {
    if (document.getElementById('opp-css')) return;
    var s = document.createElement('style');
    s.id = 'opp-css';
    s.textContent = [
      '.opp-intro p{margin:0 0 8px;font-size:13.5px;line-height:1.55;color:var(--n-600,#4a544d)}',
      '.opp-intro .opp-ok{color:var(--atlas,#0B6E4F);font-weight:600}',
      '.opp-intro .opp-note{background:var(--paper-soft,#F7F5F0);border:1px solid var(--n-200,#e4e0d7);border-radius:11px;padding:11px 13px}',
      '.opp-msg{font-size:12px;color:var(--n-500,#6c766e);margin:12px 0 14px;min-height:1.2em}',
      '.opp-rows{display:flex;flex-direction:column;gap:9px}',
      '.opp-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px 14px;background:var(--surface,#fff);border:1px solid var(--n-200,#e4e0d7);border-radius:13px}',
      '.opp-rmeta{flex:1;min-width:200px}',
      '.opp-rmeta b{display:block;font-size:14px;letter-spacing:-.01em}',
      '.opp-rmeta span{display:block;font-size:11.5px;color:var(--n-500,#6c766e);margin-top:2px;line-height:1.4}',
      '.opp-rmeta code{display:block;font-family:var(--mono,ui-monospace);font-size:10.5px;color:var(--n-500,#6c766e);margin-top:6px;word-break:break-all}',
      '.opp-racts{display:flex;gap:7px;flex-wrap:wrap}',
      '.opp-racts .kb{padding:9px 13px;font-size:12.5px}',
      '.opp-more{margin-top:14px;text-align:center}',
    ].join('');
    document.head.appendChild(s);
  }

  function open() {
    var Kw = K();
    if (!Kw || !Kw.drawer) return;
    if (!merchant()) return;
    css();
    var d = Kw.drawer({
      title: 'Order Pro · tags NFC',
      subtitle: 'Commande depuis le téléphone du client',
      width: 560,
      body: bodyHtml(),
    });
    var el = d && d.el;
    if (!el || !el.querySelector) return;
    var msg = el.querySelector('[data-opp-msg]');
    el.addEventListener('click', function (e) {
      var w = e.target.closest('[data-opp-write]');
      if (w) { writeTag(w.dataset.oppWrite, msg); return; }
      var c = e.target.closest('[data-opp-copy]');
      if (c) { copy(c.dataset.oppCopy, msg); return; }
      if (e.target.closest('[data-opp-more]')) {
        tableCount += 12;
        var rows = el.querySelector('.opp-rows');
        if (rows) {
          var add = '';
          for (var i = tableCount - 11; i <= tableCount; i++) {
            add += row('Table ' + i, 'Le numéro de table est déjà dans le lien — le client ne le saisit pas.', tableLink(i));
          }
          rows.insertAdjacentHTML('beforeend', add);
        }
        return;
      }
    });
  }

  /* ── register with the dashboard ─────────────────────────────────────────── */
  function register() {
    var Kw = K();
    if (!Kw || !Kw.handlers) return;
    Kw.handlers['orderpro-tags'] = open;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', register);
  else register();

  window.KiwiOrderProPanel = {
    open: open,
    enabled: enabled,
    links: function () {
      return { base: browseLink(), takeout: takeoutLink(), table: tableLink };
    },
  };
})();
