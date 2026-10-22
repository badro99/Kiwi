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

/* ── Ci-dessous, l'ancien assets/orderpro-guestpage.js (réuni ici le 22 octobre 2026, corps inchangé). ── */
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · ORDER PRO, LA PAGE CLIENT CÔTÉ PROPRIÉTAIRE (assets/orderpro-guestpage.js)
 * ---------------------------------------------------------------------------
 * Ce que le propriétaire règle de la page d'accueil que ses clients trouvent
 * en posant leur téléphone sur le tag de la table (assets/orderpro-guest.js) :
 *   · le Wi-Fi des clients, le lien de sa page d'avis, ses réseaux ;
 *   · les jeux : ses propres quiz, ceux de Kiwi, une manche pour toute la
 *     salle, les pseudos à retirer du classement ;
 *   · le Ramadan : sa ville, et l'écart avec l'heure de sa mosquée ;
 *   · le lien de l'écran de la salle (order-tv.html).
 *
 * Un seul document, `guestpage` dans store_docs (functions/api/store.js),
 * nettoyé par le serveur (functions/api/order/_guest.js › cleanGuestDoc) :
 * ce que ce fichier envoie de travers est retiré là-bas, pas ici.
 *
 * S'ouvre par le gestionnaire `orderpro-guestpage` (onglet « Page client » de
 * la carte, bouton du panneau des tags). Charger APRÈS orderpro-publish.js,
 * qui connaît le slug du commerce.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var STR = {
    fr: {
      title: 'Page client', subtitle: 'Ce que vos clients trouvent en posant leur téléphone sur le tag',
      loading: 'Chargement…', load_failed: 'Lecture impossible. Vérifiez la connexion et rouvrez ce panneau.',
      save: 'Enregistrer', saving: 'Enregistrement…', saved: 'Enregistré · vos clients le voient maintenant.',
      save_failed: 'Enregistrement impossible ({e}).', conflict: 'Modifié depuis un autre appareil. Rechargé : refaites votre changement.',
      wifi: 'Wi-Fi des clients', wifi_ssid: 'Nom du réseau', wifi_pw: 'Mot de passe',
      wifi_help: 'Le client le copie d’un geste. Laissez vide pour ne pas l’afficher.',
      review: 'Avis', review_url: 'Lien de votre page d’avis', review_help: 'Google, TripAdvisor… Un lien https. Le bouton apparaît aussi après le paiement.',
      socials: 'Réseaux', socials_help: 'Votre pseudo ou l’adresse de la page.',
      games: 'Jeux', games_on: 'Proposer les jeux aux clients', games_help: 'Quiz, Memory des plats de votre carte, Sudoku. Un score demande une table ouverte.',
      builtin: 'Ajouter les quiz Kiwi (cuisine marocaine, thé et café, le Maroc)',
      own: 'Vos quiz', own_none: 'Pas encore de quiz à vous.', own_add: 'Nouveau quiz',
      quiz_title: 'Titre du quiz', quiz_q: 'Question {n}', quiz_choice: 'Réponse {n}', quiz_right: 'Bonne réponse',
      quiz_add_q: 'Ajouter une question', quiz_del_q: 'Retirer', quiz_del: 'Supprimer ce quiz', quiz_count: '{n} questions', quiz_count_1: '1 question',
      quiz_help: 'Deux à quatre réponses par question. Cochez la bonne. Une question incomplète n’est pas gardée.',
      round: 'Partie de la salle', round_help: 'Tout le monde joue le même quiz en même temps. Le classement passe sur l’écran de la salle.',
      round_quiz: 'Quiz', round_len: 'Durée', round_start: 'Lancer la partie', round_stop: 'Arrêter',
      round_live: 'En cours · {q} · se termine à {t}', round_need: 'Allumez les jeux et enregistrez pour lancer une partie.',
      min: '{n} min',
      board: 'Classement du mois', board_none: 'Personne encore ce mois-ci.', hide: 'Masquer', unhide: 'Réafficher',
      hidden: 'Pseudos masqués', hidden_help: 'Un pseudo masqué disparaît du classement et de l’écran de la salle.',
      ramadan: 'Ramadan', ramadan_on: 'Afficher l’heure du ftour et proposer « servir au ftour »',
      city: 'Ville', offset: 'Écart avec le coucher du soleil (minutes)',
      offset_help: 'Comparez l’heure affichée ci-dessous avec celle de votre mosquée, et ajustez.',
      iftar_today: 'Aujourd’hui, vos clients voient : ftour à {t}.', iftar_after: 'Enregistrez pour voir l’heure calculée.',
      tv: 'Écran de la salle', tv_help: 'Ouvrez ce lien sur une télé ou une tablette : classement du mois, partie en cours, heure du ftour.',
      copy: 'Copier le lien', open: 'Ouvrir', copied: 'Lien copié',
      preview: 'Voir la page d’une table', off: 'Order Pro n’est pas activé pour ce commerce.',
    },
    en: {
      title: 'Guest page', subtitle: 'What guests find when they tap their phone on the tag',
      loading: 'Loading…', load_failed: 'Could not load. Check the connection and reopen this panel.',
      save: 'Save', saving: 'Saving…', saved: 'Saved · guests see it now.',
      save_failed: 'Could not save ({e}).', conflict: 'Changed from another device. Reloaded: please redo your change.',
      wifi: 'Guest Wi-Fi', wifi_ssid: 'Network name', wifi_pw: 'Password',
      wifi_help: 'Guests copy it in one tap. Leave empty to hide it.',
      review: 'Reviews', review_url: 'Link to your review page', review_help: 'Google, TripAdvisor… An https link. The button also shows after payment.',
      socials: 'Social', socials_help: 'Your handle or the page address.',
      games: 'Games', games_on: 'Offer games to guests', games_help: 'Quizzes, a Memory of your own dishes, Sudoku. A score needs an open table.',
      builtin: 'Add the Kiwi quizzes (Moroccan food, tea and coffee, Morocco)',
      own: 'Your quizzes', own_none: 'No quiz of your own yet.', own_add: 'New quiz',
      quiz_title: 'Quiz title', quiz_q: 'Question {n}', quiz_choice: 'Answer {n}', quiz_right: 'Right answer',
      quiz_add_q: 'Add a question', quiz_del_q: 'Remove', quiz_del: 'Delete this quiz', quiz_count: '{n} questions', quiz_count_1: '1 question',
      quiz_help: 'Two to four answers per question. Tick the right one. An incomplete question is dropped.',
      round: 'Room game', round_help: 'Everyone plays the same quiz at the same time. The ranking shows on the room screen.',
      round_quiz: 'Quiz', round_len: 'Length', round_start: 'Start the game', round_stop: 'Stop',
      round_live: 'Live · {q} · ends at {t}', round_need: 'Switch games on and save to start a game.',
      min: '{n} min',
      board: 'This month’s ranking', board_none: 'Nobody yet this month.', hide: 'Hide', unhide: 'Show again',
      hidden: 'Hidden nicknames', hidden_help: 'A hidden nickname leaves the ranking and the room screen.',
      ramadan: 'Ramadan', ramadan_on: 'Show the iftar time and offer “serve at iftar”',
      city: 'City', offset: 'Offset from sunset (minutes)',
      offset_help: 'Compare the time shown below with your mosque’s, and adjust.',
      iftar_today: 'Today, guests see: iftar at {t}.', iftar_after: 'Save to see the computed time.',
      tv: 'Room screen', tv_help: 'Open this link on a TV or tablet: monthly ranking, live game, iftar time.',
      copy: 'Copy link', open: 'Open', copied: 'Link copied',
      preview: 'See a table’s page', off: 'Order Pro is not switched on for this business.',
    },
    ar: {
      title: 'صفحة الزبون', subtitle: 'ما يجده الزبائن عند وضع هاتفهم على البطاقة',
      loading: 'جارٍ التحميل…', load_failed: 'تعذّرت القراءة. تحقق من الاتصال وأعد فتح هذه اللوحة.',
      save: 'حفظ', saving: 'جارٍ الحفظ…', saved: 'تم الحفظ · يراه الزبائن الآن.',
      save_failed: 'تعذّر الحفظ ({e}).', conflict: 'تم التعديل من جهاز آخر. أُعيد التحميل: أعد تعديلك.',
      wifi: 'واي فاي الزبائن', wifi_ssid: 'اسم الشبكة', wifi_pw: 'كلمة المرور',
      wifi_help: 'ينسخها الزبون بلمسة. اتركها فارغة لإخفائها.',
      review: 'التقييمات', review_url: 'رابط صفحة تقييماتك', review_help: 'Google، TripAdvisor… رابط https. يظهر الزر أيضاً بعد الدفع.',
      socials: 'الشبكات', socials_help: 'اسم حسابك أو عنوان الصفحة.',
      games: 'الألعاب', games_on: 'اقتراح الألعاب على الزبائن', games_help: 'مسابقات، لعبة ذاكرة بأطباقك، سودوكو. النتيجة تتطلب طاولة مفتوحة.',
      builtin: 'إضافة مسابقات Kiwi (المطبخ المغربي، الشاي والقهوة، المغرب)',
      own: 'مسابقاتك', own_none: 'لا توجد مسابقة خاصة بك بعد.', own_add: 'مسابقة جديدة',
      quiz_title: 'عنوان المسابقة', quiz_q: 'السؤال {n}', quiz_choice: 'الجواب {n}', quiz_right: 'الجواب الصحيح',
      quiz_add_q: 'إضافة سؤال', quiz_del_q: 'إزالة', quiz_del: 'حذف هذه المسابقة', quiz_count: '{n} أسئلة', quiz_count_1: 'سؤال واحد',
      quiz_help: 'من جوابين إلى أربعة لكل سؤال. حدّد الصحيح. السؤال الناقص لا يُحفظ.',
      round: 'لعبة القاعة', round_help: 'يلعب الجميع نفس المسابقة في نفس الوقت. يظهر الترتيب على شاشة القاعة.',
      round_quiz: 'المسابقة', round_len: 'المدة', round_start: 'بدء اللعبة', round_stop: 'إيقاف',
      round_live: 'جارية · {q} · تنتهي على {t}', round_need: 'فعّل الألعاب واحفظ لبدء لعبة.',
      min: '{n} د',
      board: 'ترتيب هذا الشهر', board_none: 'لا أحد بعد هذا الشهر.', hide: 'إخفاء', unhide: 'إظهار',
      hidden: 'الأسماء المخفية', hidden_help: 'الاسم المخفي يختفي من الترتيب ومن شاشة القاعة.',
      ramadan: 'رمضان', ramadan_on: 'عرض وقت الإفطار واقتراح «التقديم عند الإفطار»',
      city: 'المدينة', offset: 'الفرق مع غروب الشمس (بالدقائق)',
      offset_help: 'قارن الوقت المعروض أدناه بوقت مسجدك، ثم عدّل.',
      iftar_today: 'اليوم، يرى زبائنك: الإفطار على {t}.', iftar_after: 'احفظ لرؤية الوقت المحسوب.',
      tv: 'شاشة القاعة', tv_help: 'افتح هذا الرابط على تلفاز أو لوحة: ترتيب الشهر، اللعبة الجارية، وقت الإفطار.',
      copy: 'نسخ الرابط', open: 'فتح', copied: 'تم نسخ الرابط',
      preview: 'عرض صفحة طاولة', off: 'Order Pro غير مفعّل لهذا المحل.',
    },
  };
  /* Les mêmes clés que le serveur (functions/api/order/_guest.js › CITIES). */
  var CITIES = [['casablanca', 'Casablanca'], ['rabat', 'Rabat'], ['marrakech', 'Marrakech'], ['fes', 'Fès'], ['tanger', 'Tanger'],
    ['agadir', 'Agadir'], ['meknes', 'Meknès'], ['oujda', 'Oujda'], ['kenitra', 'Kénitra'], ['tetouan', 'Tétouan'],
    ['eljadida', 'El Jadida'], ['essaouira', 'Essaouira'], ['safi', 'Safi'], ['benimellal', 'Béni Mellal'], ['nador', 'Nador'],
    ['ouarzazate', 'Ouarzazate'], ['laayoune', 'Laâyoune'], ['dakhla', 'Dakhla']];
  var ROUND_MINUTES = [10, 15, 20, 30, 45];
  var MAX_QUIZZES = 12, MAX_QUESTIONS = 20;

  function lang() { try { var l = localStorage.getItem('kiwiLang'); return STR[l] ? l : 'fr'; } catch (_) { return 'fr'; } }
  function tr(k, map) {
    var s = (STR[lang()] && STR[lang()][k]) || STR.fr[k] || k;
    return String(s).replace(/\{(\w+)\}/g, function (_, x) { return map && map[x] != null ? map[x] : ''; });
  }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function merchant() { try { return (window.KiwiOrderPro && window.KiwiOrderPro.merchant()) || ''; } catch (_) { return ''; } }
  function enabled() { try { return !!(window.KiwiConfig && window.KiwiConfig.features && window.KiwiConfig.features.orderpro === true); } catch (_) { return false; } }
  function q() { return 'merchant=' + encodeURIComponent(merchant()); }
  function tvLink() { return location.origin + '/order-tv.html?s=' + encodeURIComponent(merchant()) + (lang() === 'fr' ? '' : '&lang=' + lang()); }
  /* Le même calcul que le serveur (functions/api/order/_guest.js › nickKey). */
  function nickKey(v) {
    return String(v == null ? '' : v).normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 40);
  }
  function clock(ts, zone) {
    try { return new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(lang() === 'en' ? 'en-GB' : 'fr-FR', { timeZone: zone || 'Africa/Casablanca', hour: '2-digit', minute: '2-digit' }).format(new Date(ts)); }
    catch (_) { return ''; }
  }

  async function getJSON(url) {
    try {
      var r = await fetch(url, { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      var j = await r.json().catch(function () { return null; });
      return r.ok ? j : Object.assign({ ok: false, status: r.status }, j || {});
    } catch (_) { return null; }
  }

  /* ── L'état du panneau ───────────────────────────────────────────────── */
  function blankDoc() {
    return { wifi: { ssid: '', password: '' }, review: { url: '' }, socials: { instagram: '', facebook: '', tiktok: '' },
      games: { on: false, builtin: true, quizzes: [], hidden: [], round: null }, ramadan: { on: false, city: 'casablanca', offset: 5 } };
  }
  function normalize(d) {
    var b = blankDoc();
    d = d && typeof d === 'object' ? d : {};
    ['wifi', 'review', 'socials', 'ramadan'].forEach(function (k) { if (d[k] && typeof d[k] === 'object') Object.assign(b[k], d[k]); });
    if (d.games && typeof d.games === 'object') Object.assign(b.games, d.games);
    b.games.quizzes = Array.isArray(b.games.quizzes) ? b.games.quizzes.map(function (x) {
      return { id: String(x.id || ''), title: String(x.title || ''), questions: (x.questions || []).map(function (y) {
        return { q: String(y.q || ''), choices: (y.choices || []).slice(0, 4).map(String), answer: Number(y.answer) || 0 };
      }) };
    }) : [];
    b.games.hidden = Array.isArray(b.games.hidden) ? b.games.hidden.slice() : [];
    return b;
  }
  var S = null;   // { doc, rev, pub, board, el, busy, openQuiz }

  async function readAll() {
    var res = await getJSON('/api/store?feature=guestpage&' + q());
    if (!res || res.ok === false) return false;
    S.doc = normalize(res.data);
    S.rev = Number(res.rev) || 0;
    await readPublic();
    return true;
  }
  /* Ce que voit un client, et donc l'heure du ftour réellement affichée. */
  async function readPublic() {
    var g = await getJSON('/api/order/guest?' + q() + '&lang=' + lang());
    S.pub = g && g.ok ? g : null;
    S.board = [];
    if (S.doc.games.on) {
      var b = await getJSON('/api/order/game?' + q() + '&board=month');
      S.board = b && b.ok ? (b.board || []) : [];
    }
  }

  /* Lit le formulaire dans S.doc (le formulaire est la vérité tant qu'il est ouvert). */
  function collect() {
    var el = S.el, d = S.doc;
    var v = function (sel) { var x = el.querySelector(sel); return x ? x.value : ''; };
    var c = function (sel) { var x = el.querySelector(sel); return !!(x && x.checked); };
    d.wifi.ssid = v('[data-g="ssid"]').trim();
    d.wifi.password = v('[data-g="pw"]').trim();
    d.review.url = v('[data-g="review"]').trim();
    d.socials.instagram = v('[data-g="instagram"]').trim();
    d.socials.facebook = v('[data-g="facebook"]').trim();
    d.socials.tiktok = v('[data-g="tiktok"]').trim();
    d.games.on = c('[data-g="games"]');
    d.games.builtin = c('[data-g="builtin"]');
    d.ramadan.on = c('[data-g="ramadan"]');
    d.ramadan.city = v('[data-g="city"]') || 'casablanca';
    var off = Math.round(Number(v('[data-g="offset"]')));
    d.ramadan.offset = Number.isFinite(off) ? Math.max(-30, Math.min(30, off)) : 5;
    el.querySelectorAll('[data-quiz]').forEach(function (box) {
      var quiz = d.games.quizzes[Number(box.dataset.quiz)];
      if (!quiz) return;
      var title = box.querySelector('[data-qt]');
      if (title) quiz.title = title.value.trim();
      box.querySelectorAll('[data-qq]').forEach(function (qb) {
        var qi = Number(qb.dataset.qq), item = quiz.questions[qi];
        if (!item) return;
        item.q = qb.querySelector('[data-qtext]').value.trim();
        item.choices = [].map.call(qb.querySelectorAll('[data-qc]'), function (i) { return i.value.trim(); });
        var right = qb.querySelector('[data-qr]:checked');
        item.answer = right ? Number(right.value) : 0;
      });
    });
  }
  /* Ce qui part au serveur : les réponses vides tombent, la bonne réponse
   * suit sa place. Le serveur refait le tri de toute façon. */
  function outgoing() {
    var d = JSON.parse(JSON.stringify(S.doc));
    d.games.quizzes = d.games.quizzes.map(function (quiz) {
      return { id: quiz.id, title: quiz.title, questions: quiz.questions.map(function (item) {
        var keep = [], answer = -1;
        item.choices.forEach(function (ch, i) { if (ch) { if (i === item.answer) answer = keep.length; keep.push(ch); } });
        return { q: item.q, choices: keep, answer: answer };
      }).filter(function (item) { return item.q && item.choices.length >= 2 && item.answer >= 0; }) };
    }).filter(function (quiz) { return quiz.title && quiz.questions.length; });
    return d;
  }

  async function save(note) {
    if (S.busy) return false;
    S.busy = true;
    say(tr('saving'));
    var out = outgoing();
    var r = null, j = null;
    try {
      r = await fetch('/api/store', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ feature: 'guestpage', merchant: merchant(), data: out, baseRev: S.rev }) });
      j = await r.json().catch(function () { return null; });
    } catch (_) { r = null; }
    S.busy = false;
    if (r && r.status === 409 && j && j.error === 'stale') {
      await readAll();
      render();
      say(tr('conflict'), true);
      return false;
    }
    if (!r || !r.ok || !j || j.ok === false) { say(tr('save_failed', { e: (j && j.error) || (r ? 'http-' + r.status : 'network') }), true); return false; }
    S.rev = Number(j.rev) || S.rev + 1;
    S.doc = normalize(out);
    await readPublic();
    render();
    say(note || tr('saved'));
    return true;
  }

  function say(text, bad) {
    var m = S && S.el && S.el.querySelector('[data-g-msg]');
    if (!m) return;
    m.textContent = text;
    m.classList.toggle('is-bad', !!bad);
  }

  /* ── Le rendu ────────────────────────────────────────────────────────── */
  function field(label, key, value, opts) {
    opts = opts || {};
    return '<div class="kf-group"><label class="kf-label" for="ogp-' + key + '">' + esc(label) + '</label>'
      + '<input class="kf-input" id="ogp-' + key + '" data-g="' + key + '" value="' + esc(value) + '"'
      + (opts.type ? ' type="' + opts.type + '"' : '') + (opts.max ? ' maxlength="' + opts.max + '"' : '')
      + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + (opts.dir ? ' dir="' + opts.dir + '"' : '') + ' /></div>';
  }
  function check(label, key, on) {
    return '<label class="ogp-check"><input type="checkbox" data-g="' + key + '"' + (on ? ' checked' : '') + ' /><span>' + esc(label) + '</span></label>';
  }
  function section(title, help, inner) {
    return '<section class="ogp-sec"><h4>' + esc(title) + '</h4>' + (help ? '<p class="kf-help">' + esc(help) + '</p>' : '') + inner + '</section>';
  }

  function quizHtml(quiz, i) {
    var n = quiz.questions.length;
    var open = S.openQuiz === i;
    var qs = quiz.questions.map(function (item, qi) {
      var choices = [0, 1, 2, 3].map(function (k) {
        return '<div class="ogp-choice"><input type="radio" name="ogp-r-' + i + '-' + qi + '" data-qr value="' + k + '"' + (item.answer === k ? ' checked' : '')
          + ' aria-label="' + esc(tr('quiz_right')) + '" /><input class="kf-input" data-qc maxlength="80" placeholder="' + esc(tr('quiz_choice', { n: k + 1 })) + '" value="' + esc(item.choices[k] || '') + '" /></div>';
      }).join('');
      return '<div class="ogp-q" data-qq="' + qi + '"><div class="ogp-qhead"><b>' + esc(tr('quiz_q', { n: qi + 1 })) + '</b>'
        + '<button class="kb ghost" type="button" data-g-delq="' + i + ':' + qi + '">' + esc(tr('quiz_del_q')) + '</button></div>'
        + '<input class="kf-input" data-qtext maxlength="200" value="' + esc(item.q) + '" />' + choices + '</div>';
    }).join('');
    return '<details class="ogp-quiz" data-quiz="' + i + '"' + (open ? ' open' : '') + '><summary><b>' + esc(quiz.title || tr('own_add')) + '</b><span>'
      + esc(n === 1 ? tr('quiz_count_1') : tr('quiz_count', { n: n })) + '</span></summary>'
      + '<div class="ogp-quiz-body"><div class="kf-group"><label class="kf-label">' + esc(tr('quiz_title')) + '</label><input class="kf-input" data-qt maxlength="80" value="' + esc(quiz.title) + '" /></div>'
      + '<p class="kf-help">' + esc(tr('quiz_help')) + '</p>' + qs
      + '<div class="ogp-actions">' + (n < MAX_QUESTIONS ? '<button class="kb ghost" type="button" data-g-addq="' + i + '">' + esc(tr('quiz_add_q')) + '</button>' : '')
      + '<button class="kb ghost ogp-danger" type="button" data-g-delquiz="' + i + '">' + esc(tr('quiz_del')) + '</button></div></div></details>';
  }

  function roundHtml() {
    var d = S.doc, pub = S.pub, now = Date.now();
    var games = pub && pub.guest && pub.guest.games;
    if (!d.games.on || !games) return '<p class="kf-help">' + esc(tr('round_need')) + '</p>';
    var r = d.games.round && d.games.round.endTs > now ? d.games.round : null;
    if (r) {
      var qz = (games.quizzes || []).find(function (x) { return x.id === r.quizId; });
      return '<div class="ogp-live"><span>' + esc(tr('round_live', { q: qz ? qz.title : r.quizId, t: clock(r.endTs, pub.zone) })) + '</span>'
        + '<button class="kb ghost" type="button" data-g-stop>' + esc(tr('round_stop')) + '</button></div>';
    }
    return '<div class="kf-row ogp-round"><div class="kf-group"><label class="kf-label">' + esc(tr('round_quiz')) + '</label><select class="kf-input" data-g-rquiz>'
      + (games.quizzes || []).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.title) + '</option>'; }).join('') + '</select></div>'
      + '<div class="kf-group"><label class="kf-label">' + esc(tr('round_len')) + '</label><select class="kf-input" data-g-rlen>'
      + ROUND_MINUTES.map(function (m) { return '<option value="' + m + '"' + (m === 15 ? ' selected' : '') + '>' + esc(tr('min', { n: m })) + '</option>'; }).join('') + '</select></div></div>'
      + '<button class="kb atlas" type="button" data-g-start' + ((games.quizzes || []).length ? '' : ' disabled') + '>' + esc(tr('round_start')) + '</button>';
  }

  function boardHtml() {
    var rows = S.board.length ? S.board.map(function (r, i) {
      return '<div class="ogp-brow"><span class="ogp-rank">' + (i + 1) + '</span><b>' + esc(r.nick) + '</b><span class="ogp-score">' + esc(r.score) + '</span>'
        + '<button class="kb ghost" type="button" data-g-hide="' + esc(r.nick) + '">' + esc(tr('hide')) + '</button></div>';
    }).join('') : '<p class="kf-help">' + esc(tr('board_none')) + '</p>';
    var chips = S.doc.games.hidden.length ? '<div class="kf-label ogp-sub">' + esc(tr('hidden')) + '</div><div class="ogp-chips">'
      + S.doc.games.hidden.map(function (h, i) { return '<button class="ogp-chip" type="button" data-g-unhide="' + i + '">' + esc(h) + '<span>' + esc(tr('unhide')) + '</span></button>'; }).join('')
      + '</div><p class="kf-help">' + esc(tr('hidden_help')) + '</p>' : '';
    return rows + chips;
  }

  function bodyHtml() {
    var d = S.doc, pub = S.pub;
    var iftar = pub && pub.ramadan && pub.ramadan.today;
    var games = section(tr('games'), tr('games_help'),
      check(tr('games_on'), 'games', d.games.on) + check(tr('builtin'), 'builtin', d.games.builtin)
      + '<div class="kf-label ogp-sub">' + esc(tr('own')) + '</div>'
      + (d.games.quizzes.length ? d.games.quizzes.map(quizHtml).join('') : '<p class="kf-help">' + esc(tr('own_none')) + '</p>')
      + (d.games.quizzes.length < MAX_QUIZZES ? '<button class="kb ghost" type="button" data-g-addquiz>' + esc(tr('own_add')) + '</button>' : ''));
    return '<div class="ogp" dir="' + (lang() === 'ar' ? 'rtl' : 'ltr') + '">'
      + section(tr('wifi'), tr('wifi_help'), '<div class="kf-row">' + field(tr('wifi_ssid'), 'ssid', d.wifi.ssid, { max: 64, dir: 'ltr' }) + field(tr('wifi_pw'), 'pw', d.wifi.password, { max: 64, dir: 'ltr' }) + '</div>')
      + section(tr('review'), tr('review_help'), field(tr('review_url'), 'review', d.review.url, { type: 'url', ph: 'https://g.page/r/…', dir: 'ltr' }))
      + section(tr('socials'), tr('socials_help'), '<div class="kf-row ogp-three">' + field('Instagram', 'instagram', d.socials.instagram, { dir: 'ltr', ph: '@' })
        + field('Facebook', 'facebook', d.socials.facebook, { dir: 'ltr' }) + field('TikTok', 'tiktok', d.socials.tiktok, { dir: 'ltr', ph: '@' }) + '</div>')
      + games
      + section(tr('round'), tr('round_help'), roundHtml())
      + (d.games.on ? section(tr('board'), '', boardHtml()) : '')
      + section(tr('ramadan'), '', check(tr('ramadan_on'), 'ramadan', d.ramadan.on)
        + '<div class="kf-row"><div class="kf-group"><label class="kf-label" for="ogp-city">' + esc(tr('city')) + '</label><select class="kf-input" id="ogp-city" data-g="city">'
        + CITIES.map(function (c) { return '<option value="' + c[0] + '"' + (d.ramadan.city === c[0] ? ' selected' : '') + '>' + esc(c[1]) + '</option>'; }).join('') + '</select></div>'
        + field(tr('offset'), 'offset', d.ramadan.offset, { type: 'number' }) + '</div>'
        + '<p class="kf-help">' + esc(tr('offset_help')) + '</p>'
        + (d.ramadan.on ? '<p class="ogp-iftar">' + esc(iftar ? tr('iftar_today', { t: clock(iftar, pub.zone) }) : tr('iftar_after')) + '</p>' : ''))
      + section(tr('tv'), tr('tv_help'), '<code class="ogp-code">' + esc(tvLink()) + '</code><div class="ogp-actions">'
        + '<button class="kb ghost" type="button" data-g-copy="' + esc(tvLink()) + '">' + esc(tr('copy')) + '</button>'
        + '<a class="kb ghost" href="' + esc(tvLink()) + '" target="_blank" rel="noopener">' + esc(tr('open')) + '</a></div>')
      + '</div>';
  }

  function render() {
    if (!S || !S.el) return;
    var body = S.el.querySelector('.kiwi-drawer-body');
    if (!body) return;
    var keepScroll = body.scrollTop;
    body.innerHTML = bodyHtml();
    body.scrollTop = keepScroll;
  }

  function css() {
    if (document.getElementById('ogp-css')) return;
    var s = document.createElement('style');
    s.id = 'ogp-css';
    s.textContent = [
      '.ogp-sec{padding:0 0 18px;margin:0 0 18px;border-bottom:1px solid var(--n-200,#e4e0d7)}',
      '.ogp-sec:last-child{border-bottom:0;margin-bottom:0}',
      '.ogp-sec h4{margin:0 0 4px;font-size:15px;font-weight:600;letter-spacing:-.01em}',
      '.ogp-sec>.kf-help{margin:0 0 12px}',
      '.ogp-three{grid-template-columns:repeat(3,minmax(0,1fr))}',
      '.ogp-check{display:flex;gap:10px;align-items:flex-start;margin:0 0 10px;font-size:13.5px;line-height:1.45;cursor:pointer}',
      '.ogp-check input{width:18px;height:18px;margin:1px 0 0;accent-color:var(--atlas,#0B6E4F);flex:none}',
      '.ogp-sub{margin:14px 0 8px}',
      '.ogp-quiz{border:1px solid var(--n-200,#e4e0d7);border-radius:12px;margin:0 0 8px;background:var(--paper-soft,#F7F5F0)}',
      '.ogp-quiz summary{display:flex;justify-content:space-between;gap:10px;padding:11px 13px;cursor:pointer;font-size:13.5px;list-style:none}',
      '.ogp-quiz summary::-webkit-details-marker{display:none}',
      '.ogp-quiz summary span{color:var(--n-500,#6c766e);font-size:12px}',
      '.ogp-quiz-body{padding:0 13px 13px}',
      '.ogp-q{border-top:1px solid var(--n-200,#e4e0d7);padding:10px 0 4px}',
      '.ogp-qhead{display:flex;justify-content:space-between;align-items:center;margin:0 0 6px;font-size:12.5px}',
      '.ogp-qhead .kb{padding:5px 10px;font-size:11.5px}',
      '.ogp-choice{display:flex;gap:8px;align-items:center;margin:6px 0 0}',
      '.ogp-choice input[type=radio]{width:17px;height:17px;flex:none;accent-color:var(--atlas,#0B6E4F)}',
      '.ogp-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
      '.ogp-actions .kb{padding:9px 13px;font-size:12.5px;text-decoration:none}',
      '.ogp-danger{color:var(--danger,#B42318)}',
      '.ogp-live{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;border-radius:12px;background:var(--paper-soft,#F7F5F0);border:1px solid var(--atlas,#0B6E4F);font-size:13.5px;font-weight:550}',
      '.ogp-round{margin-bottom:10px}',
      '.ogp-brow{display:grid;grid-template-columns:24px 1fr auto auto;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--n-200,#e4e0d7);font-size:13.5px}',
      '.ogp-brow .kb{padding:5px 10px;font-size:11.5px}',
      '.ogp-rank,.ogp-score{font-family:var(--mono,ui-monospace);font-size:12.5px;color:var(--n-500,#6c766e)}',
      '.ogp-score{color:var(--ink,#0A0F0D)}',
      '.ogp-chips{display:flex;flex-wrap:wrap;gap:6px}',
      '.ogp-chip{display:inline-flex;gap:8px;align-items:center;padding:6px 11px;border-radius:999px;border:1px solid var(--n-200,#e4e0d7);background:var(--paper-soft,#F7F5F0);font:inherit;font-size:12.5px;color:inherit;cursor:pointer}',
      '.ogp-chip span{color:var(--atlas,#0B6E4F);font-weight:600}',
      '.ogp-iftar{margin:10px 0 0;padding:10px 12px;border-radius:10px;background:var(--paper-soft,#F7F5F0);font-size:13.5px;font-weight:550}',
      '.ogp-code{display:block;font-family:var(--mono,ui-monospace);font-size:11.5px;color:var(--n-500,#6c766e);word-break:break-all}',
      '.ogp-msg{font-size:12.5px;color:var(--n-500,#6c766e);flex:1;min-width:0}',
      '.ogp-msg.is-bad{color:var(--danger,#B42318)}',
      '.ogp-foot{display:flex;align-items:center;gap:12px;width:100%}',
      '@media (max-width:560px){.ogp-three{grid-template-columns:1fr}}',
    ].join('');
    document.head.appendChild(s);
  }

  function bind() {
    S.el.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-g-save]')) { collect(); save(); return; }
      if (t.closest('[data-g-addquiz]')) {
        collect();
        S.doc.games.quizzes.push({ id: 'q' + Date.now().toString(36), title: '', questions: [{ q: '', choices: ['', '', '', ''], answer: 0 }] });
        S.openQuiz = S.doc.games.quizzes.length - 1;
        render();
        return;
      }
      var addq = t.closest('[data-g-addq]');
      if (addq) {
        collect();
        var qz = S.doc.games.quizzes[Number(addq.dataset.gAddq)];
        if (qz && qz.questions.length < MAX_QUESTIONS) qz.questions.push({ q: '', choices: ['', '', '', ''], answer: 0 });
        S.openQuiz = Number(addq.dataset.gAddq);
        render();
        return;
      }
      var delq = t.closest('[data-g-delq]');
      if (delq) {
        collect();
        var p = delq.dataset.gDelq.split(':').map(Number);
        var qz2 = S.doc.games.quizzes[p[0]];
        if (qz2) qz2.questions.splice(p[1], 1);
        S.openQuiz = p[0];
        render();
        return;
      }
      var delquiz = t.closest('[data-g-delquiz]');
      if (delquiz) {
        collect();
        S.doc.games.quizzes.splice(Number(delquiz.dataset.gDelquiz), 1);
        S.openQuiz = -1;
        render();
        return;
      }
      if (t.closest('[data-g-start]')) {
        collect();
        var quizSel = S.el.querySelector('[data-g-rquiz]'), lenSel = S.el.querySelector('[data-g-rlen]');
        if (!quizSel || !quizSel.value) return;
        var now = Date.now(), len = Math.max(5, Math.min(180, Number(lenSel && lenSel.value) || 15));
        S.doc.games.round = { id: 'r' + now.toString(36), quizId: quizSel.value, startTs: now, endTs: now + len * 60000 };
        save();
        return;
      }
      if (t.closest('[data-g-stop]')) { collect(); S.doc.games.round = null; save(); return; }
      var hide = t.closest('[data-g-hide]');
      if (hide) {
        collect();
        var nick = hide.dataset.gHide;
        if (!S.doc.games.hidden.some(function (h) { return nickKey(h) === nickKey(nick); })) S.doc.games.hidden.push(nick);
        save();
        return;
      }
      var unhide = t.closest('[data-g-unhide]');
      if (unhide) { collect(); S.doc.games.hidden.splice(Number(unhide.dataset.gUnhide), 1); save(); return; }
      var cp = t.closest('[data-g-copy]');
      if (cp) {
        var text = cp.dataset.gCopy;
        try { navigator.clipboard.writeText(text).then(function () { say(tr('copied')); }, function () { say(text); }); }
        catch (_) { say(text); }
      }
    });
    /* La bonne réponse se coche, la question garde sa place : rien à refaire. */
    S.el.addEventListener('toggle', function (e) {
      var box = e.target.closest && e.target.closest('[data-quiz]');
      if (box && box.open) S.openQuiz = Number(box.dataset.quiz);
    }, true);
  }

  async function open() {
    var Kw = window.Kiwi;
    if (!Kw || !Kw.drawer || !merchant()) return;
    css();
    var d = Kw.drawer({
      title: tr('title'), subtitle: tr('subtitle'), width: 600,
      body: '<p class="kf-help">' + esc(enabled() ? tr('loading') : tr('off')) + '</p>',
      foot: '<div class="ogp-foot"><span class="ogp-msg" data-g-msg role="status" aria-live="polite"></span><button class="kb atlas" type="button" data-g-save>' + esc(tr('save')) + '</button></div>',
    });
    S = { doc: blankDoc(), rev: 0, pub: null, board: [], el: d && d.el, busy: false, openQuiz: -1 };
    if (!S.el) return;
    bind();
    if (!(await readAll())) {
      var body = S.el.querySelector('.kiwi-drawer-body');
      if (body) body.innerHTML = '<p class="kf-help">' + esc(tr('load_failed')) + '</p>';
      var btn = S.el.querySelector('[data-g-save]');
      if (btn) btn.disabled = true;
      return;
    }
    render();
  }

  function register() {
    var Kw = window.Kiwi;
    if (!Kw || !Kw.handlers) return;
    Kw.handlers['orderpro-guestpage'] = open;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', register);
  else register();

  window.KiwiGuestPageEditor = { open: open, _test: { normalize: normalize, outgoing: function (doc) { var keep = S; S = { doc: normalize(doc) }; var o = outgoing(); S = keep; return o; }, nickKey: nickKey, STR: STR } };
})();
