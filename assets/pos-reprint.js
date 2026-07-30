/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · RÉIMPRIMER — un bouton, toutes les caisses.
 * ---------------------------------------------------------------------------
 * Le rouleau bourre. Le client s'en va sans son ticket. La caissière a coupé
 * trop tôt. Sur la caisse restaurant on rouvre le journal et on ressort le
 * ticket ; sur les quinze autres métiers il n'y avait rien — pas de bouton, pas
 * d'écran, pas de reprise. Le seul recours était de refaire la vente, ce qui
 * encaisse deux fois la même chose et fausse le Z du soir.
 *
 * Ce module met la même reprise partout. Il se pose à côté de « Verrouiller »
 * (#xx-lock), comme « Rafraîchir » (assets/caisse-refresh.js) : chaque métier a
 * son préfixe, tous ont ce pied de rail, et copier la classe du voisin suffit à
 * ressembler au bouton d'à côté sur seize écrans sans une ligne de CSS par
 * métier.
 *
 * TROIS PROMESSES, tenues par tools/pos-reprint-test.js :
 *
 *  1. UNE RÉIMPRESSION N'EST PAS UNE VENTE. On ne rappelle jamais record(), on
 *     ne consomme jamais un numéro. Le tiroir et le Z ne bougent pas : le seul
 *     effet d'appuyer sur ce bouton est du papier qui sort.
 *  2. LE TICKET EST L'ORIGINAL. Même numéro, même heure, mêmes lignes, même
 *     mode de paiement. Retimbrer la réimpression à l'heure actuelle ferait
 *     d'un ticket de 12 h 40 une pièce de 19 h 05, introuvable au rapprochement.
 *  3. LE DOUBLE SE DIT. `copy` marque chaque réimpression — deux exemplaires du
 *     même reçu qui circulent sans le dire, c'est une pièce qu'on ne peut plus
 *     rapprocher, et la porte ouverte à un retour remboursé deux fois.
 *
 * D'OÙ VIENNENT LES VENTES. Par défaut du journal partagé
 * (KiwiPosSale.today) : quatorze métiers plus le pressing y encaissent, et il
 * survit au rechargement. La boutique tient le sien (SALES + son propre
 * stockage) et fige déjà le VRAI ticket remis dans `sale.rc` ; elle s'annonce
 * donc avec provide() et ce ticket-là ressort tel quel, à l'octet près — c'est
 * mieux qu'un ticket recomposé.
 *
 * JUSQU'OÙ ON REMONTE. Le jour en cours toujours ; les jours d'avant seulement
 * quand la vente porte son ticket figé. Le détail — et pourquoi — est au-dessus
 * de rows().
 *
 * LA DÉMO NE CHANGE PAS. isReal() faux ⇒ aucun bouton n'est posé. Les quinze
 * démos gardent exactement l'écran d'avant, et de toute façon elles n'écrivent
 * rien dans le journal : un bouton y aurait ouvert une liste vide.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>'
    + '<rect x="6" y="14" width="12" height="8" rx="1"/></svg>';

  /* ── les métiers qui tiennent leur propre journal ──
   * id du métier → fonction rendant ses ventes du jour. Sans entrée ici, on lit
   * le journal partagé. */
  var providers = {};
  function provide(vertical, fn) {
    if (vertical && typeof fn === 'function') providers[String(vertical)] = fn;
  }

  function real() {
    try {
      if (window.KiwiPosSale && window.KiwiPosSale.isReal) return !!window.KiwiPosSale.isReal();
      return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal());
    } catch (_) { return false; }
  }

  function toast(msg) {
    var stack = document.getElementById('toast-stack');
    if (!stack) return;
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(function () { el.classList.add('fade'); }, 3000);
    setTimeout(function () { el.remove(); }, 3300);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function mad(n) {
    var v = Math.round((+n || 0) * 100) / 100;
    var dec = Math.round(v * 100) % 100 === 0 ? 0 : 2;
    return v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' MAD';
  }

  function hm(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '--:--';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* ── le jour d'une vente, dit comme au comptoir ───────────────────────────
   * La liste pouvant désormais couvrir plus d'une journée, une heure seule ne
   * suffit plus : « 18:34 » sans le jour, c'est le ticket de mardi qu'on
   * ressort en croyant prendre celui d'aujourd'hui. Chaque groupe porte donc
   * son jour, et le premier groupe dit « Aujourd'hui » plutôt que rien — une
   * liste qui commence sans en-tête se lit comme une liste du jour.
   *
   * Écrit DIRECTEMENT dans la langue du comptoir, et pas en français à faire
   * traduire ensuite : « samedi 25 » porte un quantième, donc la phrase change
   * chaque jour et aucun dictionnaire à correspondance exacte ne peut la
   * rattraper — une caissière arabophone lirait un jour français au milieu de
   * son écran. Les deux mots du dessus (aujourd'hui, hier) suivent la même
   * route, pour que le groupe entier parle d'une seule voix. */
  var DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var LOCALE = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA' };
  var WORDS = {
    fr: { today: "Aujourd'hui", yest: 'Hier' },
    en: { today: 'Today', yest: 'Yesterday' },
    ar: { today: 'اليوم', yest: 'أمس' },
  };
  function lang() {
    try {
      var l = window.KiwiCaisseLang && window.KiwiCaisseLang.get();
      return WORDS[l] ? l : 'fr';
    } catch (_) { return 'fr'; }
  }
  function dayLabel(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var L = lang();
    var n = new Date();
    if (sameDay(d, n)) return WORDS[L].today;
    n.setDate(n.getDate() - 1);
    if (sameDay(d, n)) return WORDS[L].yest;
    try {
      return d.toLocaleDateString(LOCALE[L], { weekday: 'long', day: 'numeric' });
    } catch (_) { return DAYS[d.getDay()] + ' ' + d.getDate(); }
  }

  /* ── ce que la liste montre ───────────────────────────────────────────────
   * Le jour en cours, la vente la plus récente d'abord — PLUS les jours
   * précédents dont on a gardé le ticket exact.
   *
   * La règle a longtemps été « aujourd'hui, point », et elle avait une bonne
   * raison : un ticket RECOMPOSÉ relit l'en-tête, la TVA et l'adresse de la
   * fiche ACTUELLE, si bien qu'un ticket de mardi réimprimé jeudi sortirait
   * avec le pied de page de jeudi. C'est un faux, et on ne le propose pas.
   *
   * Mais la boutique fige le VRAI ticket remis dans `rc`, au moment du paiement
   * (voir pos-boutique.js). Celui-là ressort à l'octet près : l'objection ne le
   * concerne pas. L'interdire quand même privait la caissière de la seule pièce
   * dont elle dispose quand une cliente revient le lendemain — alors que le
   * journal garde une semaine et que l'écran des échanges l'affichait déjà.
   *
   * D'où la règle exacte : le jour en cours toujours, les jours d'avant
   * seulement s'ils portent leur ticket figé. Les quinze autres métiers lisent
   * un journal qui ne tient que la journée (KiwiPosSale.today) : pour eux, la
   * liste est celle d'avant, au ticket près.
   *
   * Le tri est fait ici et pas laissé au journal : le journal partagé pousse en
   * fin de tableau, la boutique empile en tête. Deux ordres, une seule liste. */
  function rows(vertical) {
    var src = [];
    try {
      var p = providers[String(vertical)];
      if (p) src = p() || [];
      else if (window.KiwiPosSale && window.KiwiPosSale.today) src = window.KiwiPosSale.today(vertical) || [];
    } catch (_) { return []; }
    if (!Array.isArray(src)) src = [];

    /* Le lot serveur vient compléter, jamais remplacer : une référence déjà
       connue localement garde sa version locale, seule porteuse du ticket figé. */
    var seen = {}, remoteByRef = {};
    (serverDay[String(vertical)] || []).forEach(function (e) {
      if (e && e.ref) remoteByRef[String(e.ref)] = e;
    });
    src.forEach(function (e) {
      if (!e || !e.ref) return;
      seen[String(e.ref)] = 1;
      /* The local copy has the exact frozen receipt; the server copy has the
         database id required to cancel it. Keep both advantages on one row. */
      var remote = remoteByRef[String(e.ref)];
      if (remote && remote.saleId) e.saleId = remote.saleId;
    });
    src = src.concat((serverDay[String(vertical)] || []).filter(function (e) {
      return e && e.ref && !seen[String(e.ref)];
    }));

    var now = new Date();
    return src.filter(function (e) {
      if (!e) return false;
      var d = new Date(e.ts);
      if (isNaN(d.getTime())) return false;
      /* Hors du jour : seulement avec le ticket figé. Sans lui, il faudrait le
       * recomposer avec l'en-tête d'aujourd'hui — voir plus haut. */
      if (!sameDay(d, now) && !e.rc) return false;
      /* Un montant nul ou négatif n'a pas de ticket à ressortir : un différé
       * n'a rien encaissé, et un remboursement porte son propre reçu. */
      return (+e.total || 0) > 0;
    }).sort(function (a, b) { return (+b.ts || 0) - (+a.ts || 0); });
  }

  /* ── l'écriture du journal, retournée en ticket ───────────────────────────
   * PURE et exportée : c'est ici que se tiennent les promesses 1 et 2, et une
   * fonction pure se laisse vérifier (tools/pos-reprint-test.js).
   *
   * `ref` et `ts` sont recopiés TELS QUELS. Ne jamais retomber sur nextRef() ni
   * sur Date.now() en cas d'absence : un numéro fabriqué à la réimpression est
   * un numéro qui n'existe dans aucun livre, et il coûtera plus cher à
   * quelqu'un qu'un champ vide. */
  function docFrom(entry) {
    if (!entry) return null;
    return {
      ref: String(entry.ref == null ? '' : entry.ref),
      ts: entry.ts,
      label: String(entry.label || ''),
      /* Le mot du métier passe avant le mot normalisé : « espèces » est ce que
       * la caissière a choisi, `cash` est ce que la base en a fait. Le reçu sait
       * traduire les deux (methodLabel), autant lui donner le plus précis. */
      method: entry.raw || entry.method || '',
      total: +entry.total || 0,
      lines: (Array.isArray(entry.lines) ? entry.lines : []).map(function (l) {
        return { name: (l && l.name) || '', qty: (l && +l.qty) || 1, total: (l && +l.total) || 0 };
      }),
    };
  }

  /* ── imprimer ─────────────────────────────────────────────────────────────
   * `copy: true` demande au reçu SON mot de duplicata, dans la langue du
   * ticket. Écrire « DUPLICATA » en dur ici imprimerait du français sur un reçu
   * arabe (voir assets/receipt.js).
   *
   * Rien n'est écrit nulle part : ni record(), ni nextRef(), ni le stock. Le
   * seul effet est le papier. */
  function reprint(vertical, entry) {
    var K = window.KiwiReceipt;
    if (!K || !K.print) { toast("Impression indisponible sur cet appareil"); return Promise.resolve(null); }

    var doc;
    try {
      /* La boutique a figé le VRAI ticket remis. Le ressortir bat toute
       * recomposition : c'est le document que la cliente a eu en main, remise
       * comprise, et non une approximation reconstruite depuis les totaux. */
      if (entry && entry.rc && K.fromSnapshot) doc = K.fromSnapshot(entry.rc, { copy: true });
      else doc = K.build(docFrom(entry), { copy: true });
    } catch (_) { doc = null; }
    if (!doc) { toast('Ticket introuvable'); return Promise.resolve(null); }

    toast('Impression du reçu…');
    return Promise.resolve(K.print(doc)).then(
      function (r) {
        toast(r && r.ok ? 'Duplicata imprimé' : "Impression échouée, le ticket n'est pas sorti");
        return r;
      },
      function () { toast("Impression échouée, le ticket n'est pas sorti"); return null; }
    );
  }

  /* ── imprimer LA LISTE ────────────────────────────────────────────────────
   * Le même papier que les reçus — logo, en-tête, mentions, largeur de rouleau,
   * langue — parce que c'est KiwiReceipt qui le compose (buildSummary). Le
   * commerçant a choisi son ticket une fois dans le tableau de bord ; ce
   * récapitulatif en hérite au lieu de lui demander une deuxième fois.
   *
   * Ce n'est PAS un duplicata : pas de `copy`, un bandeau qui dit ce que c'est,
   * et aucune ligne d'encaissement. Et comme une réimpression, ça n'écrit rien
   * nulle part — ni vente, ni numéro, ni stock. */
  function printList(list) {
    var K = window.KiwiReceipt;
    if (!K || !K.buildSummary || !K.print) { toast("Impression indisponible sur cet appareil"); return Promise.resolve(null); }
    if (!list || !list.length) { toast('Aucune vente à imprimer'); return Promise.resolve(null); }
    var doc;
    try {
      doc = K.buildSummary(list, {
        /* Les bornes viennent de la liste elle-même, pas de l'horloge : le
           papier doit dire la période qu'il CONTIENT. */
        from: list[list.length - 1].ts,
        to: list[0].ts,
      });
    } catch (_) { doc = null; }
    if (!doc) { toast('Récapitulatif indisponible'); return Promise.resolve(null); }

    toast('Impression de la liste…');
    return Promise.resolve(K.print(doc)).then(
      function (r) {
        toast(r && r.ok ? 'Liste imprimée' : "Impression échouée, la liste n'est pas sortie");
        return r;
      },
      function () { toast("Impression échouée, la liste n'est pas sortie"); return null; }
    );
  }

  /* ── le panneau ──────────────────────────────────────────────────────────
   * Le kit modal de la caisse (.modal-veil / .modal), pour ressembler aux
   * fenêtres du métier sans les redéfinir. */
  function css() {
    if (document.getElementById('kx-reprint-css')) return;
    var st = document.createElement('style');
    st.id = 'kx-reprint-css';
    st.textContent = [
      '.kx-reprint { cursor: pointer; }',
      '#kx-rp-veil .modal { max-width: 440px; width: calc(100vw - 32px); }',
      '.kx-rp-head { padding: 18px 20px 12px; }',
      '.kx-rp-head h3 { margin: 0 0 4px; font-size: 17px; }',
      '.kx-rp-head p { margin: 0; font-size: 12.5px; opacity: .62; line-height: 1.45; }',
      '.kx-rp-list { max-height: min(52vh, 420px); overflow-y: auto; padding: 4px 12px 12px; }',
      '.kx-rp-day { padding: 13px 12px 5px; font-size: 10.5px; letter-spacing: .07em;',
      '  text-transform: uppercase; opacity: .45; }',
      '.kx-rp-list > .kx-rp-day:first-child { padding-top: 4px; }',
      '.kx-rp-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 12px;',
      '  border: 0; border-radius: 12px; background: transparent; cursor: pointer; text-align: left;',
      '  font: inherit; color: inherit; }',
      '.kx-rp-row + .kx-rp-row { margin-top: 2px; }',
      '.kx-rp-row:hover, .kx-rp-row:focus-visible { background: rgba(125,242,176,.10); outline: none; }',
      '.kx-rp-t { font-variant-numeric: tabular-nums; font-size: 12.5px; opacity: .6; min-width: 42px; }',
      '.kx-rp-m { flex: 1; min-width: 0; }',
      '.kx-rp-l { display: block; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.kx-rp-r { display: block; font-size: 11.5px; opacity: .55; font-variant-numeric: tabular-nums; }',
      '.kx-rp-a { font-variant-numeric: tabular-nums; font-size: 14px; font-weight: 600; }',
      '.kx-rp-empty { padding: 26px 20px 30px; text-align: center; font-size: 13px; opacity: .6; line-height: 1.5; }',
      '.kx-rp-foot { padding: 10px 16px 16px; display: flex; justify-content: flex-end;',
      '  gap: 8px; flex-wrap: wrap; }',
      '.kx-rp-all { margin-inline-end: auto; display: inline-flex; align-items: center; gap: 7px; }',
      '.kx-rp-all svg { width: 15px; height: 15px; }',
      '.kx-rp-ticket { padding: 4px 20px 18px; }',
      '.kx-rp-ticket-lines { margin: 12px 0 16px; border-top: 1px solid rgba(128,128,128,.18); }',
      '.kx-rp-ticket-line { display:flex;justify-content:space-between;gap:12px;padding:9px 0;',
      '  border-bottom:1px solid rgba(128,128,128,.13);font-size:13px; }',
      '.kx-rp-ticket-actions { display:flex;gap:8px; }',
      '.kx-rp-ticket-actions .ma-btn { flex:1;justify-content:center; }',
      '.kx-rp-cancel { color:#b53b31!important;border-color:rgba(181,59,49,.35)!important; }',
      '.kx-rp-pin { padding: 0 20px 18px; }',
      '.kx-rp-pin input { box-sizing:border-box;width:100%;padding:13px 14px;border:1px solid rgba(128,128,128,.3);',
      '  border-radius:11px;background:transparent;color:inherit;font:600 20px/1 monospace;text-align:center;letter-spacing:.32em; }',
      '.kx-rp-error { min-height:18px;margin:8px 0 0;color:#b53b31;font-size:12px; }',
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ── LES VENTES DE LA BOUTIQUE, PAS SEULEMENT CELLES DE CE COMPTOIR ───────
   * Le journal local ne contient que ce que CET appareil a encaissé. Sur une
   * boutique à deux caisses, chacune ignore l'autre : une cliente servie au
   * comptoir A qui redemande son ticket au comptoir B s'entendait répondre
   * qu'aucune vente n'existait — pendant que le tableau de bord, qui lit le
   * serveur, affichait bien les deux. Constaté chez un client le 30/07/2026 :
   * 28 tickets sur un terminal, 2 sur l'autre, aucune passerelle.
   *
   * On demande donc au serveur la journée du commerce. Deux règles :
   *
   *  · LE LOCAL GAGNE. Une vente présente des deux côtés garde sa version
   *    locale, parce qu'elle seule porte le ticket FIGÉ (`rc`) — le document
   *    réellement remis. La copie serveur, elle, doit être recomposée.
   *  · ÇA NE BLOQUE JAMAIS. La liste s'ouvre immédiatement sur le journal
   *    local ; le serveur complète après. Un bouton de secours qui attend le
   *    réseau n'est pas un secours (c'est aussi pourquoi ce fichier est dans la
   *    coquille hors ligne). */
  var serverDay = {};                             /* le dernier lot serveur, par métier */
  function startOfToday() { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function merchant() {
    try {
      var pv = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
      return String((pv && pv.merchant) || localStorage.getItem('kiwiLiveMerchant') || '');
    } catch (_) { return ''; }
  }
  function fetchDay(vertical) {
    var m = merchant();
    if (!m || typeof fetch !== 'function') return Promise.resolve([]);
    return fetch('/api/feed?merchant=' + encodeURIComponent(m) + '&from=' + startOfToday(), {
      credentials: 'same-origin',
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var out = ((j && j.sales) || []).map(function (s) {
        return {
          saleId: String(s.id || ''),
          ts: +s.ts || 0,
          total: +s.amount || 0,
          ref: String(s.ref || ''),
          label: String(s.label || ''),
          method: String(s.method || ''),
          lines: Array.isArray(s.lines) ? s.lines : [],
          remote: true,                            /* recomposé : pas de ticket figé */
        };
      });
      serverDay[String(vertical)] = out;
      return out;
    }).catch(function () { return []; });
  }

  var veil = null;

  function close() { if (veil) veil.classList.remove('is-open'); }

  function cancelSale(entry, pin) {
    var m = merchant();
    if (!m || !entry || !entry.saleId || typeof fetch !== 'function') {
      return Promise.reject(new Error('sale-unavailable'));
    }
    return fetch('/api/sale/cancel', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ merchant: m, id: entry.saleId, pin: String(pin || '') }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j.ok) { var err = new Error((j && j.error) || 'cancel-failed'); err.code = j && j.error; throw err; }
        return j;
      });
    });
  }

  function showTicket(vertical, entry) {
    var box = veil && veil.querySelector('.modal');
    if (!box || !entry) return;
    var lines = (entry.lines || []).map(function (l) {
      return '<div class="kx-rp-ticket-line"><span>' + esc((l.qty || 1) + ' × ' + (l.name || 'Article'))
        + '</span><b>' + esc(mad(l.total || 0)) + '</b></div>';
    }).join('');
    box.innerHTML = '<div class="kx-rp-head"><h3>' + esc(entry.ref || 'Ticket') + '</h3>'
      + '<p>' + esc(dayLabel(entry.ts) + ' · ' + hm(entry.ts)) + ' · ' + esc(mad(entry.total)) + '</p></div>'
      + '<div class="kx-rp-ticket"><div class="kx-rp-ticket-lines">' + (lines || '<div class="kx-rp-ticket-line">Détail indisponible</div>') + '</div>'
      + '<div class="kx-rp-ticket-actions"><button type="button" class="ma-btn" data-kx-rp-back>Retour</button>'
      + '<button type="button" class="ma-btn" data-kx-rp-print>Réimprimer</button>'
      + '<button type="button" class="ma-btn kx-rp-cancel" data-kx-rp-cancel>Annuler la vente</button></div></div>';
    box.querySelector('[data-kx-rp-back]').addEventListener('click', function () { open(vertical, { noFetch: true }); });
    box.querySelector('[data-kx-rp-print]').addEventListener('click', function () { close(); reprint(vertical, entry); });
    var cancel = box.querySelector('[data-kx-rp-cancel]');
    if (!entry.saleId) {
      cancel.disabled = true;
      cancel.title = 'Synchronisation de la vente en cours';
    } else cancel.addEventListener('click', function () { showPin(vertical, entry); });
  }

  function showPin(vertical, entry) {
    var box = veil && veil.querySelector('.modal');
    if (!box) return;
    box.innerHTML = '<div class="kx-rp-head"><h3>Confirmer l’annulation</h3>'
      + '<p>Entrez votre code personnel. Cette annulation sera visible par le propriétaire avec votre nom, le ticket et le montant.</p></div>'
      + '<div class="kx-rp-pin"><input data-kx-rp-pin inputmode="numeric" maxlength="4" autocomplete="off" type="password" aria-label="Code personnel à 4 chiffres">'
      + '<div class="kx-rp-error" data-kx-rp-error></div><div class="kx-rp-ticket-actions">'
      + '<button type="button" class="ma-btn" data-kx-rp-back>Retour</button>'
      + '<button type="button" class="ma-btn kx-rp-cancel" data-kx-rp-confirm>Annuler définitivement</button></div></div>';
    var input = box.querySelector('[data-kx-rp-pin]');
    var error = box.querySelector('[data-kx-rp-error]');
    var confirm = box.querySelector('[data-kx-rp-confirm]');
    box.querySelector('[data-kx-rp-back]').addEventListener('click', function () { showTicket(vertical, entry); });
    function submit() {
      if (!/^\d{4}$/.test(input.value)) { error.textContent = 'Entrez votre code personnel à 4 chiffres.'; return; }
      confirm.disabled = true; error.textContent = '';
      cancelSale(entry, input.value).then(function () {
        serverDay[String(vertical)] = (serverDay[String(vertical)] || []).filter(function (e) { return e.saleId !== entry.saleId; });
        close();
        try { document.dispatchEvent(new CustomEvent('kiwi-sales-voided', { detail: { refs: [entry.ref], merchant: merchant() } })); } catch (_) {}
        toast('Vente annulée · ' + (entry.ref || '') + ' · ' + mad(entry.total));
      }).catch(function (err) {
        confirm.disabled = false;
        error.textContent = err && err.code === 'bad-pin' ? 'Code personnel incorrect.'
          : err && err.code === 'sale-too-old' ? 'Cette vente est trop ancienne pour être annulée en caisse.'
          : err && err.code === 'already-cancelled' ? 'Cette vente est déjà annulée.'
          : 'Annulation impossible. Vérifiez la connexion et réessayez.';
      });
    }
    confirm.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    setTimeout(function () { try { input.focus(); } catch (_) {} }, 0);
  }

  function open(vertical, opts) {
    css();
    if (!veil) {
      veil = document.createElement('div');
      veil.className = 'modal-veil';
      veil.id = 'kx-rp-veil';
      veil.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="Réimprimer un ticket"></div>';
      veil.addEventListener('click', function (e) { if (e.target === veil) close(); });
      document.body.appendChild(veil);
    }
    var box = veil.querySelector('.modal');
    var list = rows(vertical);

    var body = '';
    if (list.length) {
      /* Un en-tête quand le jour change, et pas une ligne de plus. La liste
       * étant déjà triée du plus récent au plus ancien, les jours sortent
       * groupés d'eux-mêmes — il n'y a rien à regrouper, juste à annoncer. */
      var day = null;
      list.forEach(function (e, i) {
        var lab = dayLabel(e.ts);
        if (lab !== day) { day = lab; body += '<div class="kx-rp-day">' + esc(lab) + '</div>'; }
        body += '<button type="button" class="kx-rp-row" data-kx-rp="' + i + '">'
          + '<span class="kx-rp-t">' + esc(hm(e.ts)) + '</span>'
          + '<span class="kx-rp-m"><span class="kx-rp-l">' + esc(e.label || 'Vente') + '</span>'
          + '<span class="kx-rp-r">' + esc(e.ref || 'sans numéro') + '</span></span>'
          + '<span class="kx-rp-a">' + esc(mad(e.total)) + '</span></button>';
      });
    } else {
      /* Dire POURQUOI c'est vide. « Aucun ticket » laisserait croire à une
       * panne le soir d'une bonne journée, alors qu'il s'agit d'une fenêtre. */
      body = '<div class="kx-rp-empty">Aucun ticket à ressortir sur ce terminal.<br>'
        + 'La liste tient les ventes du jour, et celles des jours précédents dont '
        + 'le ticket a été gardé.</div>';
    }

    box.innerHTML = '<div class="kx-rp-head"><h3>Réimprimer un ticket</h3>'
      + '<p>Les ventes encaissées sur ce terminal. Le duplicata garde le numéro '
      + 'et l\'heure d\'origine, et porte la mention « duplicata ».</p></div>'
      + '<div class="kx-rp-list">' + body + '</div>'
      /* « Imprimer la liste » à gauche, « Fermer » à droite, et seulement quand
         il y a quelque chose à imprimer : un bouton qui sort une feuille vide
         est un bouton qu'on n'ose plus toucher. */
      + '<div class="kx-rp-foot">'
      + (list.length ? '<button type="button" class="ma-btn kx-rp-all" data-kx-rp-all>' + ICON
        + '<span>Imprimer la liste</span></button>' : '')
      + '<button type="button" class="ma-btn" data-kx-rp-close>Fermer</button></div>';

    box.querySelectorAll('[data-kx-rp]').forEach(function (b) {
      b.addEventListener('click', function () {
        var e = list[+b.getAttribute('data-kx-rp')];
        showTicket(vertical, e);
      });
    });
    var x = box.querySelector('[data-kx-rp-close]');
    if (x) x.addEventListener('click', close);
    var all = box.querySelector('[data-kx-rp-all]');
    if (all) all.addEventListener('click', function () { close(); printList(list); });

    veil.classList.add('is-open');
    if (window.lucide) try { window.lucide.createIcons(); } catch (_) {}

    /* La journée du commerce, demandée APRÈS l'ouverture. Si elle apporte
       quelque chose que ce comptoir ne connaissait pas, on redessine — une
       seule fois, et seulement si le panneau est encore ouvert. */
    if (!opts || !opts.noFetch) {
      var before = list.length;
      fetchDay(vertical).then(function () {
        if (!veil || !veil.classList.contains('is-open')) return;
        /* Even with the same row count, the server may have supplied the id
           that turns a local receipt into a cancellable sale. */
        open(vertical, { noFetch: true });
      });
    }
  }

  /* ── le bouton ───────────────────────────────────────────────────────────
   * Même recette que « Rafraîchir » : on se pose avant #xx-lock en copiant sa
   * classe. Idempotent — repasser sur un écran déjà servi ne fait rien. */
  function mount(root, vertical) {
    if (!root || !real()) return null;
    if (root.querySelector('.kx-reprint')) return null;
    css();
    var lock = root.querySelector('button[id$="-lock"]');
    if (!lock || !lock.parentNode) return null;

    var b = document.createElement('button');
    b.type = 'button';
    b.className = ((lock.className || '').replace(/\bkx-reprint\b/g, '').trim() + ' kx-reprint').trim();
    b.title = "Ressortir un ticket déjà encaissé, avec son numéro d'origine";
    b.setAttribute('aria-label', 'Réimprimer un ticket');
    b.innerHTML = ICON + '<span>Réimprimer</span>';
    b.addEventListener('click', function () { open(vertical); });
    lock.parentNode.insertBefore(b, lock);
    return b;
  }

  window.KiwiPosReprint = {
    mount: mount, open: open, rows: rows, docFrom: docFrom,
    reprint: reprint, printList: printList, provide: provide, cancelSale: cancelSale,
  };
})();
