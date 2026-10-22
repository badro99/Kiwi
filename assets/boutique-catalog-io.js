/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BOUTIQUE CATALOG · les échanges avec le serveur et l'export
 * ---------------------------------------------------------------------------
 * Une partie de window.KiwiBoutiqueCatalog (assets/boutique-catalog.js), sortie
 * du fichier principal telle quelle :
 *   · sync : la copie serveur (/api/catalog), les réservations de stock d'un
 *     encaissement, le stock des autres établissements (/api/stock/lookup) et
 *     les réveils (retour sur l'onglet, retour du réseau, fermeture de page) ;
 *   · csv : l'export du catalogue.
 *
 * Ce fichier ne fait que DÉCLARER deux fabriques ; c'est boutique-catalog.js
 * qui les appelle, chacune à l'endroit où ce code se trouvait, avec l'état
 * qu'il possède (`core.db`, `core.VENUE`) et le journal
 * (assets/boutique-catalog-ledger.js). À charger AVANT boutique-catalog.js.
 * ═══════════════════════════════════════════════════════════════════════════ */
window.__kiwiBoutiqueCatalogParts = window.__kiwiBoutiqueCatalogParts || {};
window.__kiwiBoutiqueCatalogParts.sync = function (core, ledger) {
  'use strict';
  const { DEMO_VENUE, load, persist, notify, dropIndex, migrate, commit, varById } = core;
  const { mergeDocs, materialize, journal, now, baseAtOf } = ledger;

  /* ═════════════════ LE FILET — une copie serveur sur laquelle retomber ══════
   * Jusqu'ici ce catalogue ne vivait QUE dans le localStorage du navigateur qui
   * l'avait saisi. Une fenêtre privée fermée, un deuxième appareil, un cache
   * vidé, et l'inventaire n'existait plus nulle part : rien n'en gardait copie.
   * Un commerçant ne peut pas ressaisir son stock à chaque fois qu'il change de
   * navigateur — ce n'est pas un réglage d'affichage, c'est son magasin.
   *
   * Le stock est donc miroité vers /api/catalog, qui n'est lisible qu'en
   * prouvant son identité sur CE magasin (session du compte, caisse appairée ou
   * opérateur — jamais public, contrairement à /api/menu). Le tableau de bord et
   * la caisse écrivent déjà sous le même slug de boutique : ils tombent
   * naturellement sur le même document.
   *
   * Trois règles, dans cet ordre de priorité :
   *
   *  1. NE JAMAIS PERDRE DE STOCK. Toute panne — hors ligne, 500, table pas
   *     encore migrée, session expirée — est avalée : la copie locale reste la
   *     vérité de travail et la remontée est retentée au prochain enregistrement.
   *     La caisse continue de vendre dans un sous-sol sans réseau.
   *  2. NE JAMAIS ÉCRASER L'AUTRE APPAREIL. On envoie la révision sur laquelle on
   *     s'est basé ; si le serveur a bougé entre-temps il refuse (409) et renvoie
   *     sa copie. On fusionne et on repropose.
   *  3. NE JAMAIS POUSSER AVANT D'AVOIR LU. Un navigateur neuf a un catalogue
   *     vide ; s'il poussait en premier il effacerait le vrai stock.
   *
   * Fusion : union par id, plus deux arbitrages qui manquaient et qui ont coûté
   * cher à un vrai commerçant le 30/07/2026 — son stock revenait indéfiniment à
   * 4 078 unités quoi qu'il vende ou supprime.
   *
   *  · UNE SUPPRESSION EST UN FAIT, PAS UN VIDE. « Union par id, rien ne
   *    disparaît jamais » paraît prudent sur un inventaire, et c'est faux : une
   *    ABSENCE ne se distingue pas d'une IGNORANCE. L'appareil qui supprime un
   *    article se retrouve simplement à ne plus l'avoir, la copie serveur l'a
   *    encore, la fusion le rend — puis le repousse au serveur. La suppression
   *    n'était pas perdue, elle était ANNULÉE, et le geste ne pouvait pas
   *    aboutir un seul jour. D'où `removed` : la carte des ids supprimés, avec
   *    l'instant. Les ids ne sont jamais réattribués (nextId monte), donc un id
   *    marqué supprimé est supprimé, des deux côtés.
   *
   *  · LE COMPTE LE PLUS RÉCENT GAGNE, PAS LE COMPTE LOCAL. « cet appareil
   *    d'abord » se juge depuis chaque appareil : la caisse vend, son compte
   *    baisse ; l'onglet tableau de bord resté ouvert garde l'ancien, et quand
   *    c'est LUI qui pousse, c'est l'ancien qui gagne. Les deux se renvoyaient
   *    le même document (révision 165 en production, pour un catalogue de 41
   *    déclinaisons) et le stock ne bougeait plus. Chaque écriture de quantité
   *    horodate donc `stockAt`, et la fusion prend la plus récente des deux.
   *    Un document d'avant ce correctif n'a pas d'horodatage : il compte pour le
   *    plus ancien, donc la première vente qui suit le remet dans le vrai.
   *
   * Le reste des champs (nom, prix, couleur, codes-barres) suit toujours l'appareil
   * local : c'est de l'édition, pas du comptage, et la dernière main qui a tapé
   * est là, devant l'écran. */
  const REV_KEY = (slug) => 'kiwiCatalogRev:v1:' + slug;
  const DIRTY_KEY = (slug) => 'kiwiCatalogDirty:v1:' + slug;
  /* `dirty` : ce navigateur porte une écriture que le serveur n'a pas encore
     acceptée. Posé par commit() (toute mutation locale passe par là), levé
     seulement quand le serveur a dit oui. C'est ce drapeau, avec `ahead.mine`,
     qui empêche un appareil sans rien à dire de republier en boucle. */
  const cloud = { rev: 0, read: Object.create(null), timer: null, busy: false, again: false, tries: 0, last: 0, dirty: false };

  // La démo (Maison Mansour) ne quitte jamais ce navigateur : elle est semée
  // localement et n'appartient à aucun compte.
  function cloudOn() {
    try {
      if (!core.VENUE || core.VENUE === DEMO_VENUE) return false;
      if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) return true;
      /* Une caisse APPAIRÉE est un appareil réel, même sans session du
         propriétaire. KiwiEnv ne voit que la session/le domaine : sur la
         tablette du magasin il répondait donc faux, cloudBind() ne lisait
         jamais /api/catalog, et le stock restait celui d'un vieux localStorage
         pendant que le dashboard et God mode affichaient la copie serveur.

         On n'ouvre que LE magasin lié à ce terminal. Le serveur revérifie le
         cookie httpOnly kiwi_till dans /api/catalog ; ce test client décide
         seulement s'il faut tenter la synchro, il n'accorde aucun accès. */
      const pairedMerchant = window.KiwiPlatform?.pairedMerchant?.() || (JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null') || {}).merchant;
      return !!(pairedMerchant && String(pairedMerchant) === String(core.VENUE));
    } catch (e) { return false; }
  }
  function readRev(slug) {
    try { return parseInt(localStorage.getItem(REV_KEY(slug)) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function writeRev(slug, rev) {
    try { localStorage.setItem(REV_KEY(slug), String(rev || 0)); } catch (e) {}
  }
  function dirtyToken(slug) {
    try { return localStorage.getItem(DIRTY_KEY(slug)); } catch (e) { return null; }
  }
  function markCatalogDirty() {
    cloud.dirty = true;
    try {
      const token = Date.now().toString(36) + ':' + Math.random().toString(36).slice(2);
      localStorage.setItem(DIRTY_KEY(core.VENUE), token);
      return token;
    } catch (e) { return null; }
  }
  function clearCatalogDirty(slug, token) {
    try {
      if (!token || localStorage.getItem(DIRTY_KEY(slug)) === token) {
        localStorage.removeItem(DIRTY_KEY(slug));
      }
    } catch (e) {}
    cloud.dirty = !!dirtyToken(slug);
  }

  /* Le compteur d'EAN-13 maison vit dans UNE clé locale (assets/barcode.js). Un
   * deuxième appareil qui reçoit le catalogue du premier démarre à zéro et
   * rééditerait exactement les mêmes codes — deux articles différents sous le
   * même code-barres, que la douchette ne pourrait plus départager. On remonte
   * donc le compteur au-dessus du plus grand code maison déjà présent. */
  function healSeq() {
    try {
      let max = 0;
      (core.db.variants || []).forEach((v) => ((v && v.barcodes) || []).forEach((b) => {
        const m = /^20(\d{10})\d$/.exec(String((b && b.code) || ''));
        if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
      }));
      if (!max) return;
      // barcode.js lit une clé fixe ; pages-pro.js en reporte une par magasin.
      // On remonte les deux, sinon le compteur repart selon la surface ouverte.
      ['kiwiBarcodeSeq:maisonMansour', 'kiwiBarcodeSeq:' + core.VENUE].forEach((K) => {
        const cur = parseInt(localStorage.getItem(K) || '0', 10) || 0;
        if (max > cur) localStorage.setItem(K, String(max));
      });
    } catch (e) {}
  }

  /* Lit la copie serveur et la réconcilie avec la locale. `first` = tout premier
   * contact pour ce magasin : c'est le seul cas où un catalogue local vide est
   * remplacé en bloc (le navigateur neuf adopte le magasin). Ensuite on fusionne
   * toujours, pour ne pas jeter ce qui vient d'être saisi ici. */
  function pull(first) {
    const slug = core.VENUE;
    if (!cloudOn()) return Promise.resolve(false);
    return fetch('/api/catalog?merchant=' + encodeURIComponent(slug), {
      headers: { Accept: 'application/json' },
    })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((res) => {
        // Le commerçant a changé de magasin pendant l'aller-retour : cette
        // réponse concerne l'inventaire d'une autre boutique, on la jette.
        if (!res || slug !== core.VENUE) return false;
        /* Only a valid server document satisfies "read before write". A 500 used
           to become `null` but still set cloud.read, licensing the next local
           mutation to overwrite a server copy this browser had never seen. */
        cloud.read[slug] = 1;
        cloud.last = Date.now();
        cloud.dirty = cloud.dirty || !!dirtyToken(slug);

        const serverRev = +res.rev || 0;
        const theirs = res.data;
        load();
        const mineEmpty = !(core.db.products && core.db.products.length);
        const theirsEmpty = !(theirs && theirs.products && theirs.products.length);

        if (theirsEmpty) {
          // Rien en ligne : c'est ce navigateur qui fait référence.
          cloud.rev = serverRev;
          if (!mineEmpty) schedulePush(0);
          return false;
        }
        cloud.rev = serverRev;
        if (!mineEmpty && readRev(slug) === serverRev) {
          /* Same revision does not mean "nothing to do" when a prior offline
             push failed. The local movement is still dirty and must leave now
             that the server is reachable again. */
          if (cloud.dirty) schedulePush(0);
          healSeq();
          return false;
        }

        const adopt = first && mineEmpty;
        core.db = adopt ? theirs : mergeDocs(core.db, theirs);
        dropIndex();
        migrate();   // la copie serveur peut venir d'un build antérieur aux familles
        persist(); writeRev(slug, serverRev); healSeq(); notify();
        /* ── NE PAS REPUBLIER CE QU'ON VIENT DE LIRE ──────────────────────────
           On repoussait après CHAQUE fusion, systématiquement. Un appareil qui
           n'avait rien changé republiait donc le document qu'il venait de
           recevoir : le serveur incrémentait sa révision, l'autre appareil
           relisait, refusionnait, republiait à son tour. C'est cette boucle qui
           a porté le document d'un client à la révision 165 pour 41 articles —
           et c'est sous ce bruit que l'écrasement du stock passait inaperçu.
           On ne remonte donc que si nous portons vraiment quelque chose que le
           serveur n'a pas : une vente, une création, une suppression, un
           comptage plus récent. mergeDocs vient de le dire. */
        if (!adopt && (cloud.dirty || ledger.ahead.mine)) schedulePush(0);
        return true;
      })
      .catch(() => false);   // hors ligne → la copie locale reste la vérité
  }

  function schedulePush(delay) {
    if (!cloudOn()) return;
    if (!cloud.dirty || !dirtyToken(core.VENUE)) markCatalogDirty();
    if (cloud.timer) clearTimeout(cloud.timer);
    cloud.timer = setTimeout(pushNow, delay == null ? 900 : delay);
  }

  function pushNow(opts) {
    cloud.timer = null;
    if (!cloudOn()) return;
    const slug = core.VENUE;
    // Règle 3 : jamais pousser avant d'avoir lu, sinon un navigateur neuf efface.
    if (!cloud.read[slug]) { pull(true); return; }
    if (cloud.busy) { cloud.again = true; return; }
    const sentDirty = dirtyToken(slug);
    cloud.busy = true;
    fetch('/api/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: slug, baseRev: cloud.rev, data: core.db }),
      // L'onglet peut se fermer juste après une vente : keepalive laisse la
      // requête partir quand même.
      keepalive: !!(opts && opts.keepalive),
    })
      .then((r) => r.json().then((j) => ({ status: r.status, j })).catch(() => ({ status: r.status, j: null })))
      .then((res) => {
        if (slug !== core.VENUE) return;
        if (res.status === 200 && res.j && res.j.ok) {
          cloud.rev = Math.max(cloud.rev, +res.j.rev || 0);
          writeRev(slug, cloud.rev);
          /* Accepté : plus rien à remonter. Levé ICI et nulle part ailleurs — un
             drapeau baissé sur un envoi refusé perdrait la vente silencieusement. */
          clearCatalogDirty(slug, sentDirty);
          cloud.tries = 0;
          return;
        }
        // 409 : le serveur a bougé (ou a refusé un envoi vide). Il nous rend sa
        // copie — on fusionne et on repropose, quelques fois au plus pour ne
        // jamais tourner en rond si l'autre appareil écrit en continu.
        if (res.status === 409 && res.j && res.j.data && cloud.tries < 3) {
          cloud.tries++;
          core.db = mergeDocs(core.db, res.j.data);
          dropIndex();
          migrate();
          cloud.rev = +res.j.rev || 0;
          persist(); writeRev(slug, cloud.rev); healSeq(); notify();
          cloud.again = true;
        }
        // 401 / 503 / 500 → on garde tout en local et on retentera plus tard.
      })
      .catch(() => { /* hors ligne : la vente continue, la remontée attendra */ })
      .then(() => {
        cloud.busy = false;
        if (cloud.again) { cloud.again = false; schedulePush(400); }
      });
  }

  /* A checkout reservation is a small server-side compare-and-swap against the
     current catalogue. Unlike the background full-document mirror, it returns a
     definite answer before payment: either these exact variants are held, or the
     till must not collect money. Network failure remains an explicit offline
     fallback; a real stock refusal never does. */
  function saleStockAction(action, ref, lines) {
    load();
    if (!cloudOn() || typeof fetch !== 'function') return Promise.resolve({ ok: false, offline: true });
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 4500) : null;
    return fetch('/api/catalog', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: core.VENUE, stockAction: action, ref: String(ref || '').slice(0, 64), lines: lines || [] }),
      signal: controller ? controller.signal : undefined,
    }).then((r) => r.json().then((j) => ({ status: r.status, j })).catch(() => ({ status: r.status, j: null })))
      .then((res) => {
        if (res.status === 200 && res.j && res.j.ok && res.j.data) {
          core.db = mergeDocs(core.db, res.j.data);
          dropIndex(); migrate(); materialize(core.db);
          cloud.rev = Math.max(cloud.rev, +res.j.rev || 0);
          writeRev(core.VENUE, cloud.rev); persist(); healSeq(); notify();
          if (ledger.ahead.mine) { markCatalogDirty(); schedulePush(0); }
          return { ok: true };
        }
        if (res.status === 409 && res.j && res.j.error === 'stock-insufficient') {
          if (res.j.data) {
            core.db = mergeDocs(core.db, res.j.data); dropIndex(); migrate(); materialize(core.db);
            cloud.rev = Math.max(cloud.rev, +res.j.rev || 0); writeRev(core.VENUE, cloud.rev); persist(); notify();
            if (ledger.ahead.mine) { markCatalogDirty(); schedulePush(0); }
          }
          return { ok: false, issue: res.j.issue || null };
        }
        /* The till can legitimately have a durable local catalogue before the
           shared catalogue table is available (freshly paired shop, migration
           still rolling out, or the first background upload not accepted yet).
           Those replies are explicit non-writes: no server hold exists, so the
           established offline checkout path is safe and will publish the sale
           with its idempotency reference later. Treating every 409/503 as an
           ambiguous hold blocked a stocked shop at “Vérification du stock…”. */
        const reason = (res.j && res.j.error) || '';
        if ((res.status === 409 && reason === 'catalog-missing')
            || (res.status === 503 && (reason === 'unmigrated' || reason === 'not-configured'))) {
          return { ok: false, offline: true, reason };
        }
        if (res.status === 409) {
          if (res.j && res.j.data) {
            core.db = mergeDocs(core.db, res.j.data); dropIndex(); migrate(); materialize(core.db);
            cloud.rev = Math.max(cloud.rev, +res.j.rev || 0); writeRev(core.VENUE, cloud.rev); persist(); notify();
            if (ledger.ahead.mine) { markCatalogDirty(); schedulePush(0); }
          }
          return { ok: false, fatal: true, reason: (res.j && res.j.error) || 'stock-contention' };
        }
        if (res.status === 401 || res.status === 403 || res.status === 400) {
          return { ok: false, fatal: true, reason: (res.j && res.j.error) || 'stock-action-refused' };
        }
        /* Once a request was sent, a lost/5xx response is ambiguous: Cloudflare
           may have committed the hold before the connection broke. Never fall
           back to a second local debit. Retrying the same ref is idempotent. */
        return { ok: false, fatal: true, uncertain: true, reason: reason || ('http-' + res.status) };
      }).catch(() => ({ ok: false, fatal: true, uncertain: true, reason: 'network-uncertain' }))
      .finally(() => { if (timeout) clearTimeout(timeout); });
  }

  function reserveSale(ref, lines) { return saleStockAction('reserve', ref, lines); }
  function confirmSale(ref) {
    /* Confirm locally first. If the network disappears after the card terminal
       approves, the next catalogue push carries `vente`, never an ambiguous hold. */
    let touched = false;
    (core.db.moves || []).forEach((m) => {
      if (m && m.ref === ref && m.why === 'reserve') {
        m.why = 'vente'; touched = true;
        /* La réservation n'entre pas au registre (TRANSIENT dans
           maison-stock-movements.js) et la renommer ne bouge aucun stock : la
           vente confirmée n'y entrait donc jamais. C'est ici qu'elle devient une
           sortie de marchandise, c'est ici qu'on la raconte. */
        const v = varById(m.vid);
        if (v) {
          const d = +m.d || 0, after = Math.max(0, +v.stock || 0);
          journal({ id: m.id, variant: v, at: +m.at || now(), delta: d, before: Math.max(0, after - d), after,
            why: 'vente', actor: m.actor || '', ref: m.ref || '' });
        }
      }
    });
    if (touched) commit();
    return saleStockAction('confirm', ref);
  }
  function releaseSale(ref) {
    /* Release locally before asking the server. If Wi-Fi dies between opening and
       cancelling payment, the inverse movement remains durable and retries through
       the ordinary catalogue mirror. IDs match the server action, so both routes
       arriving is still exactly one release. */
    const held = (core.db.moves || []).filter((m) => m && m.ref === ref && m.why === 'reserve');
    const paid = (core.db.moves || []).some((m) => m && m.ref === ref && m.why === 'vente');
    if (!paid && held.length) {
      let at = now();
      held.forEach((m) => {
        const id = 'rel-' + String(m.id).slice(0, 60);
        if ((core.db.moves || []).some((x) => x && x.id === id)) return;
        const v = varById(m.vid); at = Math.max(at + 1, baseAtOf(v) + 1, (+m.at || 0) + 1);
        core.db.moves.push({ id, vid: m.vid, d: -(+m.d || 0), at, why: 'release', ref: String(ref).slice(0, 64) });
      });
      materialize(core.db); commit();
    }
    return saleStockAction('release', ref);
  }

  /* ─── « et dans l'autre boutique ? » ──────────────────────────────────────
   *
   * Un commerçant à deux magasins scanne un article à Casa pour une cliente qui
   * veut du 40 : il ne reste que du 38 ici. La réponse — « il y en a trois à
   * Marrakech » — existait déjà dans D1, sous le même compte, mais rien ne la
   * demandait. Le vendeur téléphonait, ou renonçait.
   *
   * Le serveur (functions/api/stock/lookup.js) répond pour TOUS les magasins du
   * compte d'un coup, et c'est lui qui décide lesquels : la liste des
   * établissements vit dans le localStorage de ce navigateur, la lui faire
   * confiance laisserait n'importe qui nommer le magasin qu'il veut lire.
   *
   * Trois précautions, parce que ceci se déclenche sur un SCAN — le geste qui
   * doit rester instantané :
   *   · jamais bloquant. Le scan affiche le stock local immédiatement ; ce qui
   *     revient d'ici ne fait que compléter le panneau, plus tard.
   *   · `cloudOn()`, comme le reste de la synchro : une session de démonstration
   *     n'appelle rien, et un magasin de démo ne peut pas en interroger un vrai.
   *   · un compte MONO-magasin arrête de demander. La première réponse dit
   *     combien de magasins existent ; s'il n'y a que celui-ci, `solo` se pose et
   *     les scans suivants n'atteignent plus le réseau du tout. */
  const cross = { solo: false, cache: Object.create(null), inflight: Object.create(null) };

  function crossStock(opts) {
    opts = opts || {};
    const code = String(opts.code || '').trim();
    const q = String(opts.q || '').trim();
    if (!code && q.length < 2) return Promise.resolve(null);
    if (!cloudOn()) return Promise.resolve(null);
    // Un seul établissement sur ce compte : la question n'a pas de sens.
    if (cross.solo && !opts.force) return Promise.resolve(null);

    const slug = core.VENUE;
    /* La référence entre dans la clé du cache : le propriétaire vient peut-être
       de la poser depuis le tableau de bord sur un article scanné il y a dix
       secondes, et servir la réponse d'avant lui montrerait « rien ailleurs »
       juste après avoir fait le geste censé y remédier. */
    const key = slug + '|' + (code ? 'c:' + code : 'q:' + q.toLowerCase())
      + '|s:' + String(opts.sku || '').trim().toLowerCase();
    // Deux scans du même code à quelques secondes d'intervalle (l'employé
    // rescanne pour montrer l'écran à la cliente) ne font qu'un appel.
    const hit = cross.cache[key];
    if (hit && Date.now() - hit.at < 30000) return Promise.resolve(hit.res);
    if (cross.inflight[key]) return cross.inflight[key];

    /* La référence commune part AVEC le code. Le code seul ne suffit pas : une
     * étiquette imprimée ici ne veut rien dire dans l'autre magasin, et c'est
     * précisément le cas du commerçant qui étiquette lui-même sa marchandise.
     * Le serveur essaie le code d'abord (le plus sûr quand c'est un vrai
     * code fabricant) et retombe sur la référence. */
    const sku = String(opts.sku || '').trim();
    const url = '/api/stock/lookup?from=' + encodeURIComponent(slug)
      + (code ? '&code=' + encodeURIComponent(code) : '&q=' + encodeURIComponent(q))
      + (sku ? '&sku=' + encodeURIComponent(sku) : '');

    const p = fetch(url, { headers: { Accept: 'application/json' } })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((res) => {
        // Le magasin actif a changé pendant l'aller-retour : cette réponse parle
        // d'ailleurs, on la jette plutôt que de l'afficher sous le mauvais nom.
        if (slug !== core.VENUE) return null;
        if (!res || !res.ok || !Array.isArray(res.stores)) return null;
        if (res.stores.length <= 1) { cross.solo = true; return null; }
        const out = {
          code: res.code || '',
          // Seulement les AUTRES : le magasin où l'on se tient est déjà à l'écran.
          stores: res.stores.filter((s) => s && !s.self),
        };
        cross.cache[key] = { at: Date.now(), res: out };
        return out;
      })
      .catch(() => null)      // hors ligne → le scan local a déjà répondu
      .then((v) => { delete cross.inflight[key]; return v; });

    cross.inflight[key] = p;
    return p;
  }

  // Changer de magasin invalide tout : « l'autre boutique » ne désigne plus les
  // mêmes, et un compte solo ici peut être multi-magasins là.
  function crossReset() {
    cross.solo = false;
    cross.cache = Object.create(null);
    cross.inflight = Object.create(null);
  }

  // Le magasin actif vient de changer (ou la page vient de s'ouvrir) : on lit sa
  // copie serveur une fois.
  function cloudBind() {
    const slug = core.VENUE;
    if (!cloudOn() || cloud.read[slug]) return;
    cloud.dirty = !!dirtyToken(slug);
    pull(true);
  }

  /* Revenir sur l'onglet est le moment où l'on veut voir ce que l'AUTRE appareil
   * a fait — la caisse a vendu pendant qu'on regardait ailleurs. On relit, sans
   * marteler le serveur. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!cloudOn() || Date.now() - cloud.last < 20000) return;
    pull(false);
  });

  /* An offline stock movement must not wait for a second sale to reach D1.
     Browser `online` is only a wake-up hint; pushNow still handles failures and
     revision conflicts safely. */
  window.addEventListener('online', () => {
    if (!cloudOn()) return;
    if (cloud.dirty) schedulePush(0);
    else if (Date.now() - cloud.last >= 20000) pull(false);
  });

  /* A till can stay visible for an entire shift. Visibility-only refresh meant
     two open tills never learned about each other's sales. Poll only hosted real
     pages, only while visible, and retain the existing 20 s floor. */
  if (window.location && typeof window.setInterval === 'function') {
    window.setInterval(() => {
      if (document.visibilityState !== 'visible' || !cloudOn() || cloud.busy) return;
      if (Date.now() - cloud.last >= 20000) pull(false);
    }, 20000);
  }

  // Une modification en attente ne doit pas mourir avec l'onglet.
  window.addEventListener('pagehide', () => {
    if (cloud.timer) { clearTimeout(cloud.timer); cloud.timer = null; pushNow({ keepalive: true }); }
  });

  return {
    cloud, DIRTY_KEY, markCatalogDirty, schedulePush, pull, cloudBind,
    reserveSale, confirmSale, releaseSale, crossStock, crossReset,
  };
};

window.__kiwiBoutiqueCatalogParts.csv = function (core) {
  'use strict';
  const { catById, variantsOf, COLOR_BY_ID, famOf } = core;

  /* ───────────────── CSV export (simple) ─────────────────
     `couleur` is the general family, the same word the merchant sees on screen,
     so a report reads like the shop does. `couleur_saisie` carries the original
     shade when there was one — a re-import or an accountant looking at last
     season's records still finds "Bleu nuit" next to its Bleu. */
  /* Le `cout` fait partie de l'export, sinon la boucle « exporter → corriger
     dans Excel → réimporter » perdrait silencieusement le prix d'achat de tout
     le stock — et avec lui la valorisation et la marge. L'import lit cette
     colonne (BOUTIQUE_COLS.cout dans assets/catalog-import.js) : les deux bouts
     doivent bouger ensemble. */
  function exportCsv() {
    const rows = [['produit', 'categorie', 'couleur', 'couleur_saisie', 'taille', 'prix_mad', 'cout', 'stock', 'code_barres', 'type']];
    core.db.products.filter((p) => !p.archived).forEach((p) => {
      const cat = catById(p.categoryId);
      variantsOf(p.id).forEach((v) => {
        const fam = COLOR_BY_ID(famOf(v));
        (v.barcodes.length ? v.barcodes : [{ code: '', type: '' }]).forEach((b) => {
          rows.push([p.name, cat ? cat.name : '', fam ? fam.label : v.colorLabel, v.colorSource || '', v.size, p.priceMAD, p.cost || '', v.stock, b.code, b.type]);
        });
      });
    });
    const cell = (c) => {
      let s = String(c == null ? '' : c);
      if (/^[\t\r ]*[=+\-@]/.test(s)) s = "'" + s;
      return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return rows.map((r) => r.map(cell).join(',')).join('\n');
  }

  return { exportCsv };
};
