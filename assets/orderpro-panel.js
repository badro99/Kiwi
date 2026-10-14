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

  /* Force a publish for whichever vertical this store is.
   *   boutique   → KiwiOrderPro owns the stock snapshot.
   *   restaurant → assets/menu-catalog.js publishes automatically on edit but
   *                exposes no manual trigger, so send the same payload it does
   *                (POST /api/menu {name, type, data}; the server derives the
   *                merchant from the session, so no slug travels). */
  function publish() {
    var P = window.KiwiOrderPro;
    if (P && P.type() === 'boutique') return P.publishNow();

    var S = window.KiwiMenuStore;
    if (!S) return Promise.resolve({ ok: false, error: 'menu-module-absent' });
    var v = null;
    try { v = window.KiwiVenue && KiwiVenue.getCurrentVenueData && KiwiVenue.getCurrentVenueData(); } catch (_) {}
    var data = S.data(v && v.id);
    if (!data || !(data.items || []).length) return Promise.resolve({ ok: false, error: 'carte-vide' });
    return fetch('/api/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name: (v && v.name) || '', type: (v && v.type) || '', data: data }),
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        return (r.ok && j && j.ok) ? j : { ok: false, error: (j && j.error) || ('http-' + r.status) };
      });
    }).catch(function () { return { ok: false, error: 'network' }; });
  }

  /* ── write one tag (Android/Chrome only) ─────────────────────────────────── */
  var writing = false;
  async function writeTag(url, msgEl) {
    if (!nfcSupported || writing) return;
    writing = true;
    msgEl.textContent = 'Approchez le tag du téléphone…';
    try {
      var ndef = new window.NDEFReader();
      await ndef.write({ records: [{ recordType: 'url', data: url }] });
      msgEl.textContent = 'Tag écrit ✓ · collez-le et testez-le.';
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
  var TABLE_DESC = 'Le numéro de table est déjà dans le lien · le client ne le saisit pas.';
  var PLAN_NOTE = '<p class="opp-plan" data-opp-plan>Les tables de votre plan de salle. Une table manque ? Ajoutez-la au plan, son tag apparaît ici.</p>';

  /* Les tables du plan de salle, telles que la caisse les nomme
   * (`num || id`, voir kiwi-caisse.html). Un tag « Table 1..12 » pour une
   * salle dont les tables s'appellent « T1 » ou « Terrasse 2 » ouvrait une
   * table que le comptoir ne reconnaissait pas. null = pas de plan (ou pas
   * lisible) : on garde la liste numérotée. */
  var planTables = null;
  /* Le téléphone ne garde que les chiffres du tag (quatre au plus, voir
   * OrderPro.html › NET), et le serveur reconnaît « T7 » ou « Table 7 » comme
   * la table 7 (functions/api/order/_lib.js › planTableKey). Une table sans
   * numéro, ou dont le numéro est déjà pris par une autre, ne peut donc pas
   * avoir de tag : le panneau le dit au lieu d'écrire un lien qui ouvrirait
   * la mauvaise table. */
  function tagOf(key) {
    var k = String(key).toUpperCase().replace(/\s+/g, '').replace(/^TABLE(?=.)/, '').replace(/^T(?=\d+$)/, '');
    return /^\d{1,4}$/.test(k) ? k : '';
  }
  function readPlan(data) {
    var gone = (data && data.gone && typeof data.gone === 'object') ? data.gone : {};
    var seen = {}, tags = {};
    var out = ((data && Array.isArray(data.tables)) ? data.tables : []).map(function (t) {
      if (!t || gone[String(t.id)]) return null;
      var key = String(t.num || t.id || '').trim();
      if (!key || seen[key]) return null;
      seen[key] = true;
      var name = String(t.name || '').trim();
      var label = name || (/^\d+$/.test(key) ? 'Table ' + key : key);
      var tag = tagOf(key);
      var clash = tag && tags[tag];
      if (tag && !clash) tags[tag] = label;
      return { key: key, label: label, tag: clash ? '' : tag, clash: clash || '' };
    }).filter(Boolean);
    out.sort(function (a, b) {
      if (!a.tag !== !b.tag) return a.tag ? -1 : 1;
      return (a.tag || a.label).localeCompare(b.tag || b.label, 'fr', { numeric: true });
    });
    return out.length ? out : null;
  }
  function loadPlan() {
    return fetch('/api/store?feature=floorplan&merchant=' + encodeURIComponent(merchant()), { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { planTables = readPlan(j && j.data); return planTables; })
      .catch(function () { return planTables; });
  }

  function tableRows() {
    var rows = [row('Tag comptoir · à emporter', 'Commande à emporter, paiement à la caisse.', takeoutLink())];
    if (planTables) {
      planTables.forEach(function (t) {
        rows.push(t.tag ? row(t.label, TABLE_DESC, tableLink(t.tag))
          : blockedRow(t.label, t.clash
            ? 'Même numéro que « ' + t.clash + ' » : un tag ouvrirait l\'autre table. Changez son numéro dans le plan de salle.'
            : 'Pas de numéro : un tag ne peut pas ouvrir cette table. Donnez-lui un numéro dans le plan de salle.'));
      });
    } else {
      for (var i = 1; i <= tableCount; i++) rows.push(row('Table ' + i, TABLE_DESC, tableLink(i)));
    }
    return rows.join('');
  }

  function bodyHtml() {
    var isBoutique = vertical() === 'boutique';
    var rows = [];
    if (isBoutique) {
      rows.push(row('Tag boutique', 'Le client (ou un vendeur) scanne un produit et voit prix, tailles et stock.', browseLink()));
    } else {
      rows.push(tableRows());
    }
    return '' +
      // Publishing is what puts the carte / le stock on the customer's phone. It
      // happens automatically on every edit, but it is invisible — so show its
      // state and give a way to force it, rather than leaving a merchant staring
      // at "carte pas encore publiée" with nothing to press.
      '<div class="opp-pub">' +
        '<div class="opp-pub-row">' +
          '<div><b>Ce que voient vos clients</b><span data-opp-pub-state>Vérification…</span></div>' +
          '<button class="kb atlas" type="button" data-opp-publish>Publier maintenant</button>' +
        '</div>' +
      '</div>' +
      (isBoutique ? '' :
        '<div class="opp-pub">' +
          '<div class="opp-pub-row">' +
            '<div><b>Page client</b><span>Wi-Fi, avis, jeux et classement, Ramadan, écran de la salle.</span></div>' +
            '<button class="kb ghost" type="button" data-action="orderpro-guestpage">Régler</button>' +
          '</div>' +
        '</div>') +
      '<div class="opp-intro">' +
        '<p>Un seul lien par tag. Le tag connaît votre établissement : un client chez vous ne peut pas commander ailleurs.</p>' +
        (nfcSupported
          ? '<p class="opp-ok">Ce téléphone peut écrire les tags directement. Achetez des stickers NTAG213, puis « Écrire le tag ».</p>'
          : '<p class="opp-note">Pour écrire un tag : ouvrez ce panneau depuis un téléphone Android/Chrome, ou copiez le lien et écrivez-le avec l\'application gratuite <b>NFC Tools</b> (iPhone comme Android).</p>') +
      '</div>' +
      '<div class="opp-msg" data-opp-msg>Verrouillez le tag après écriture pour qu\'il ne soit pas réécrit.</div>' +
      (isBoutique || !planTables ? '' : PLAN_NOTE) +
      '<div class="opp-rows">' + rows.join('') + '</div>' +
      (isBoutique || planTables ? '' :
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

  function blockedRow(title, desc) {
    return '<div class="opp-row is-blocked"><div class="opp-rmeta"><b>' + esc(title) + '</b><span>' + esc(desc) + '</span></div></div>';
  }

  function css() {
    if (document.getElementById('opp-css')) return;
    var s = document.createElement('style');
    s.id = 'opp-css';
    s.textContent = [
      '.opp-pub{background:var(--paper-soft,#F7F5F0);border:1px solid var(--n-200,#e4e0d7);border-radius:13px;padding:13px 15px;margin:0 0 16px}',
      '.opp-pub-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
      '.opp-pub-row>div{flex:1;min-width:180px}',
      '.opp-pub-row b{display:block;font-size:13.5px;letter-spacing:-.01em}',
      '.opp-pub-row span{display:block;font-size:12px;color:var(--n-500,#6c766e);margin-top:3px;line-height:1.45}',
      '.opp-pub-row .kb{padding:9px 14px;font-size:12.5px;flex:none}',
      '.opp-intro p{margin:0 0 8px;font-size:13.5px;line-height:1.55;color:var(--n-600,#4a544d)}',
      '.opp-intro .opp-ok{color:var(--atlas,#0B6E4F);font-weight:600}',
      '.opp-intro .opp-note{background:var(--paper-soft,#F7F5F0);border:1px solid var(--n-200,#e4e0d7);border-radius:11px;padding:11px 13px}',
      '.opp-msg{font-size:12px;color:var(--n-500,#6c766e);margin:12px 0 14px;min-height:1.2em}',
      '.opp-rows{display:flex;flex-direction:column;gap:9px}',
      '.opp-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px 14px;background:var(--surface,#fff);border:1px solid var(--n-200,#e4e0d7);border-radius:13px}',
      '.opp-rmeta{flex:1;min-width:200px}',
      '.opp-rmeta b{display:block;font-size:14px;letter-spacing:-.01em}',
      '.opp-rmeta span{display:block;font-size:11.5px;color:var(--n-500,#6c766e);margin-top:2px;line-height:1.4}',
      '.opp-rmeta code{display:block;font-family:var(--mono,ui-monospace);font-size:11px;color:var(--n-500,#6c766e);margin-top:6px;word-break:break-all}',
      '.opp-racts{display:flex;gap:7px;flex-wrap:wrap}',
      '.opp-racts .kb{padding:9px 13px;font-size:12.5px}',
      '.opp-more{margin-top:14px;text-align:center}',
      '.opp-row.is-blocked{background:var(--paper-soft,#F7F5F0);border-style:dashed}',
      '.opp-plan{margin:0 0 10px;font-size:12.5px;line-height:1.5;color:var(--n-600,#4a544d)}',
    ].join('');
    document.head.appendChild(s);
  }

  function bindPanel(el) {
    if (!el || !el.querySelector) return;
    var msg = el.querySelector('[data-opp-msg]');
    var pubState = el.querySelector('[data-opp-pub-state]');

    /* Ask the server what a customer would actually see right now — the only
     * answer that matters, and the same URL their phone hits. */
    function refreshPublished() {
      if (!pubState) return;
      fetch('/api/menu?merchant=' + encodeURIComponent(merchant()), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j) { pubState.textContent = 'État inconnu (hors ligne ?)'; return; }
          var count = (j.shop && j.shop.products || []).length || (j.menu && j.menu.items || []).length;
          if (!count) { pubState.textContent = 'Rien de publié · vos clients voient une page vide.'; return; }
          pubState.textContent = count + (j.shop ? ' produit' : ' article') + (count > 1 ? 's' : '') +
            ' en ligne · ' + (j.name || '·');
        })
        .catch(function () { pubState.textContent = 'État inconnu (hors ligne ?)'; });
    }
    refreshPublished();

    /* Le plan arrive après l'ouverture : on ne repeint que la liste des tags
     * (et la note), jamais l'état de publication déjà lu. */
    if (vertical() !== 'boutique') {
      loadPlan().then(function () {
        if (!el.isConnected) return;
        var list = el.querySelector('.opp-rows');
        if (!list) return;
        list.innerHTML = tableRows();
        var more = el.querySelector('.opp-more');
        if (more) more.hidden = !!planTables;
        var note = el.querySelector('[data-opp-plan]');
        if (planTables && !note) list.insertAdjacentHTML('beforebegin', PLAN_NOTE);
        if (!planTables && note) note.remove();
      });
    }

    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-opp-publish]')) {
        if (pubState) pubState.textContent = 'Publication…';
        publish().then(function (res) {
          if (res && res.ok === false && pubState) {
            pubState.textContent = 'Publication impossible (' + res.error + ')';
            return;
          }
          setTimeout(refreshPublished, 800);
        });
        return;
      }
      var w = e.target.closest('[data-opp-write]');
      if (w) { writeTag(w.dataset.oppWrite, msg); return; }
      var c = e.target.closest('[data-opp-copy]');
      if (c) { copy(c.dataset.oppCopy, msg); return; }
      if (e.target.closest('[data-opp-more]')) {
        tableCount += 12;
        var rows = el.querySelector('.opp-rows');
        if (rows) {
          var add = '';
          for (var i = tableCount - 11; i <= tableCount; i++) add += row('Table ' + i, TABLE_DESC, tableLink(i));
          rows.insertAdjacentHTML('beforeend', add);
        }
        return;
      }
    });
  }

  function mount(el) {
    if (!el || !merchant()) return false;
    css();
    el.innerHTML = bodyHtml();
    bindPanel(el);
    return true;
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
    bindPanel(d && d.el);
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
    mount: mount,
    enabled: enabled,
    links: function () {
      return { base: browseLink(), takeout: takeoutLink(), table: tableLink };
    },
  };
})();
