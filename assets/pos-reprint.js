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

  /* ── ce que la liste montre ───────────────────────────────────────────────
   * Les ventes d'AUJOURD'HUI, la plus récente d'abord. Le jour, parce que c'est
   * la seule fenêtre où le ticket recomposé est fidèle : le pied de page, la
   * TVA et l'adresse sont relus de la fiche ACTUELLE, et sur la journée en
   * cours ils n'ont pas pu changer. Un ticket de mardi réimprimé avec l'entête
   * de jeudi serait un faux — mieux vaut ne pas le proposer.
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
    if (!Array.isArray(src)) return [];

    var now = new Date();
    return src.filter(function (e) {
      if (!e) return false;
      var d = new Date(e.ts);
      if (isNaN(d.getTime()) || !sameDay(d, now)) return false;
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
      '.kx-rp-foot { padding: 10px 16px 16px; display: flex; justify-content: flex-end; }',
    ].join('\n');
    document.head.appendChild(st);
  }

  var veil = null;

  function close() { if (veil) veil.classList.remove('is-open'); }

  function open(vertical) {
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

    var body = list.length
      ? list.map(function (e, i) {
        return '<button type="button" class="kx-rp-row" data-kx-rp="' + i + '">'
          + '<span class="kx-rp-t">' + esc(hm(e.ts)) + '</span>'
          + '<span class="kx-rp-m"><span class="kx-rp-l">' + esc(e.label || 'Vente') + '</span>'
          + '<span class="kx-rp-r">' + esc(e.ref || 'sans numéro') + '</span></span>'
          + '<span class="kx-rp-a">' + esc(mad(e.total)) + '</span></button>';
      }).join('')
      /* Dire POURQUOI c'est vide. « Aucun ticket » laisserait croire à une
       * panne le soir d'une bonne journée, alors que le journal ne garde que
       * le jour en cours. */
      : '<div class="kx-rp-empty">Aucune vente encaissée aujourd\'hui sur ce terminal.<br>'
        + 'La liste repart à zéro chaque matin.</div>';

    box.innerHTML = '<div class="kx-rp-head"><h3>Réimprimer un ticket</h3>'
      + '<p>Les ventes d\'aujourd\'hui sur ce terminal. Le duplicata garde le numéro '
      + 'et l\'heure d\'origine, et porte la mention « duplicata ».</p></div>'
      + '<div class="kx-rp-list">' + body + '</div>'
      + '<div class="kx-rp-foot"><button type="button" class="ma-btn" data-kx-rp-close>Fermer</button></div>';

    box.querySelectorAll('[data-kx-rp]').forEach(function (b) {
      b.addEventListener('click', function () {
        var e = list[+b.getAttribute('data-kx-rp')];
        close();
        reprint(vertical, e);
      });
    });
    var x = box.querySelector('[data-kx-rp-close]');
    if (x) x.addEventListener('click', close);

    veil.classList.add('is-open');
    if (window.lucide) try { window.lucide.createIcons(); } catch (_) {}
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
    b.title = "Ressortir un ticket de la journée, avec son numéro d'origine";
    b.setAttribute('aria-label', 'Réimprimer un ticket');
    b.innerHTML = ICON + '<span>Réimprimer</span>';
    b.addEventListener('click', function () { open(vertical); });
    lock.parentNode.insertBefore(b, lock);
    return b;
  }

  window.KiwiPosReprint = {
    mount: mount, open: open, rows: rows, docFrom: docFrom,
    reprint: reprint, provide: provide,
  };
})();
