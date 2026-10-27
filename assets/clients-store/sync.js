  function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return h; }

  /* ── real backend sync (fail-soft) — /api/clients + D1 (functions/api/clients.js)
   * Same contract as live-link's /api/sale: gated on kiwiLive (or a real/hosted env),
   * NEVER demo/seed books, and endpoint absence (404/503/offline) is a silent no-op.
   * localStorage stays the source of truth same-browser; the server carries the book
   * across devices (caisse tablet ⇄ dashboard laptop).
   * Profile edits merge by changed field; server arrival resolves conflicts. ─────────────────── */
  function realEnv() { try { return !!(window.KiwiEnv && KiwiEnv.isReal && KiwiEnv.isReal()); } catch (_) { return false; } }
  function syncable(book) {
    return (ls('kiwiLive') === '1' || ls('kiwiPaired') === '1' || realEnv()) && !!book && !isDemoBook(book) && !SEED_VENUES[book];
  }
  function curKey(book) { return 'kiwi:clients-cur:v1:' + book; }
  function getCursor(book) { var n = Number(ls(curKey(book))); return n > 0 ? n : 0; }
  function setCursor(book, c) { try { localStorage.setItem(curKey(book), String(c || 0)); } catch (_) {} }

  /* ── LA FILE D'ATTENTE ────────────────────────────────────────────────────
   * Ces deux appels étaient « fire-and-forget » : un POST qui échoue — hors
   * ligne, table pas encore migrée, session expirée — n'était jamais rejoué. La
   * fiche restait bien dans le navigateur, mais elle n'atteignait le serveur
   * qu'au prochain passage du client en caisse, c'est-à-dire peut-être jamais.
   * Un tunnel de réseau au comptoir suffisait à ce qu'une cliente inscrite le
   * matin n'existe pas sur le portable du patron le soir.
   *
   * On garde donc les identifiants en souffrance. Ils sont rejoués au tour de
   * synchronisation suivant, en relisant la fiche COURANTE depuis le carnet
   * local — jamais un instantané figé, sinon on renverrait un solde de points
   * périmé par-dessus un plus récent. Une suppression est mise en file sous
   * '-<id>' : elle doit être rejouée elle aussi, ou le client supprimé revient
   * depuis l'autre appareil. */
  /* ── UN SEUL PROPRIÉTAIRE POUR LES QUATRE FILES ──────────────────────────
   * Fiches, achats et retours, récompenses données, récompenses refusées :
   * chaque file lisait et écrivait localStorage pour son compte et avalait une
   * écriture refusée (stockage plein, navigation privée). Si la caisse était en
   * plus hors ligne à ce moment-là, l'événement était perdu : les points
   * n'arrivaient jamais au serveur (et disparaissaient au tirage suivant), une
   * récompense donnée pouvait l'être encore sur une autre caisse, et un ticket
   * rejoué comptait deux fois. Seules outboxRead et outboxWrite touchent
   * désormais ces clés : une écriture refusée est gardée en mémoire, la file
   * part quand même pendant cette session, et la copie gardée est écrite dès
   * que le stockage l'accepte (outboxPersistHeld, au début de chaque tour).
   * tools/clients-outbox-owner-test.mjs tient ces trois règles. */
  var heldQueues = {};
  function outboxRead(key) {
    if (heldQueues[key]) return heldQueues[key].slice();
    try { var a = JSON.parse(ls(key) || '[]'); return Array.isArray(a) ? a : []; }
    catch (_) { return []; }
  }
  function outboxWrite(key, list) {
    try { localStorage.setItem(key, JSON.stringify(list)); delete heldQueues[key]; return true; }
    catch (_) { heldQueues[key] = list.slice(); return false; }
  }
  function outboxPersistHeld() {
    Object.keys(heldQueues).forEach(function (key) { outboxWrite(key, heldQueues[key]); });
  }

  function outKey(book) { return 'kiwi:clients-out:v1:' + book; }
  function outRead(book) { return outboxRead(outKey(book)); }
  function outWrite(book, a) {
    // Pas de plafond. La file est déjà regroupée par fiche (un jeton par client,
    // '-<id>' pour une suppression, outAdd ne double jamais) : dix modifications
    // d'une même fiche y tiennent une place, et sa taille suit le nombre de
    // clients en souffrance, pas le nombre d'éditions. Quelques octets par
    // client, quand le carnet local en garde des centaines. L'ancien plafond à
    // 500 sortait les plus anciens jetons en silence : une fiche modifiée hors
    // ligne, ou une suppression, n'était plus jamais rejouée tant que le client
    // ne repassait pas en caisse, et l'autre appareil ne l'apprenait pas.
    outboxWrite(outKey(book), a);
  }
  function outAdd(book, token) {
    if (!syncable(book) || !token) return;
    var a = outRead(book);
    if (a.indexOf(token) === -1) { a.push(token); outWrite(book, a); }
  }
  function outDrop(book, token) {
    var a = outRead(book);
    var i = a.indexOf(token);
    if (i >= 0) { a.splice(i, 1); outWrite(book, a); }
  }

  function purchaseKey(book) { return 'kiwi:clients-purchases:v1:' + book; }
  function purchaseRead(book) {
    return outboxRead(purchaseKey(book)).filter(function (e) { return e && e.ref && e.clientId; });
  }
  function purchaseWrite(book, events) {
    // Never evict unacknowledged purchases. The server event table is the
    // durable acknowledgement boundary; trimming here would silently lose
    // sales after a long offline period.
    outboxWrite(purchaseKey(book), events);
  }
  function purchaseAdd(book, event) {
    if (!syncable(book) || !event || !event.ref) return;
    var events = purchaseRead(book);
    if (!events.some(function (e) { return e.ref === event.ref; })) {
      events.push(event); purchaseWrite(book, events);
    }
  }
  function purchaseDrop(book, ref) {
    purchaseWrite(book, purchaseRead(book).filter(function (e) { return e.ref !== ref; }));
  }
  function purchaseFailure(book, ref, reason) {
    var events = purchaseRead(book);
    events.forEach(function (e) { if (e.ref === ref) e.lastFailure = reason; });
    purchaseWrite(book, events);
  }
  // Fresh detached values: callers cannot mutate the pending queue.
  function purchaseSyncStatus(book) {
    var events = purchaseRead(book || bookId());
    return { count: events.length, failures: events.filter(function (e) { return e.lastFailure; }).map(function (e) {
      return { ref: e.ref, reason: e.lastFailure };
    }) };
  }
  function purchasePush(book, event, afterClientCreate) {
    if (!syncable(book) || !event || !event.ref) return;
    var isRefund = event.kind === 'refund';
    /* Le retour attend que l'achat de son ticket soit au serveur : arrivé avant
       lui, le serveur ne trouverait rien à reprendre et l'acquitterait sans effet. */
    if (isRefund && purchaseRead(book).some(function (e) {
      return e.kind !== 'refund' && e.clientId === event.clientId && e.saleRef && e.saleRef === event.saleRef;
    })) return;
    try {
      fetch('/api/clients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify(isRefund ? { merchant: book, refund: {
          clientId: event.clientId, ref: event.ref, amount: -Number(event.amount || 0),
          items: event.items || [], saleRef: event.saleRef || '',
        } } : { merchant: book, purchase: {
          clientId: event.clientId, ref: event.ref, amount: event.amount,
          method: event.method || '', items: event.items || [], saleRef: event.saleRef || '',
        } }),
      }).then(async function (r) {
        if (r && r.ok) {
          var receipt = await r.json();
          var ledgerBook = readBook(book);
          var ledgerClient = ledgerBook.list.filter(function (c) { return c.id === event.clientId; })[0];
          if (ledgerClient) {
            var ledgers = ledgerClient.loyaltySales || (ledgerClient.loyaltySales = Object.create(null));
            var ledger = Object.hasOwn(ledgers, event.saleRef) ? ledgers[event.saleRef]
              : (ledgers[event.saleRef] = { paid: 0, earned: 0, stamped: 0, refunded: 0, clawed: 0, unstamped: 0 });
            if (purchaseRead(book).some(function (e) { return e.ref === event.ref; })
                && !(ledgerClient.purchaseRefs || []).includes(event.ref)) {
              ledger[isRefund ? 'refunded' : 'paid'] += isRefund ? -Number(receipt.spend || 0) : Number(receipt.spend || 0);
              ledger[isRefund ? 'clawed' : 'earned'] += isRefund ? -Number(receipt.points || 0) : Number(receipt.points || 0);
              ledger[isRefund ? 'unstamped' : 'stamped'] += isRefund ? -Number(receipt.stamps || 0) : Number(receipt.stamps || 0);
              ledgerClient.points = Math.max(0, Number(ledgerClient.points || 0) + Number(receipt.points || 0) - Number(event.points || 0));
              ledgerClient.stamps = Math.max(0, Number(ledgerClient.stamps || 0) + Number(receipt.stamps || 0) - Number(event.stamps || 0));
              ledgerClient.spend = money(Number(ledgerClient.spend || 0) + Number(receipt.spend || 0) - Number(event.spend || 0));
              writeBook(ledgerBook, book);
            }
          }
          purchaseDrop(book, event.ref);
          if (!isRefund) purchaseRead(book).forEach(function (e) {
            if (e.kind === 'refund' && e.clientId === event.clientId && e.saleRef === event.saleRef) purchasePush(book, e);
          });
          return;
        }
        purchaseFailure(book, event.ref, r ? 'http-' + r.status : 'offline');
        /* A client created at checkout and its purchase used to be sent as two
         * unrelated requests.  If the purchase won the race, D1 returned
         * client-not-found and the history appeared only after a later poll.
         * Create/refresh that exact profile first, then retry this same stable
         * event once.  The server ledger keeps the retry idempotent. */
        if (r && r.status === 404 && !afterClientCreate) {
          var rec = get(event.clientId, book);
          var created = pushClient(rec, book);
          if (created && typeof created.then === 'function') {
            created.then(function (ok) { if (ok) purchasePush(book, event, true); });
          }
        }
      }).catch(function () { purchaseFailure(book, event.ref, 'offline'); });
    } catch (_) { purchaseFailure(book, event.ref, 'offline'); }
  }
  function flushPurchases(book) {
    var events = purchaseRead(book), batch = events.slice(0, 25);
    // Rotate before sending: refusals and transient failures retain their full
    // audit event without monopolising the next tick's bounded batch.
    purchaseWrite(book, events.slice(batch.length).concat(batch));
    batch.forEach(function (event) { purchasePush(book, event); });
  }

  function redemptionKey(book) { return 'kiwi:clients-redemptions:v1:' + book; }
  function redemptionRead(book) {
    return outboxRead(redemptionKey(book)).filter(function (e) { return e && e.ref && e.clientId; });
  }
  function redemptionWrite(book, events) {
    outboxWrite(redemptionKey(book), events);
  }
  function redemptionAdd(book, event) {
    if (!syncable(book) || !event || !event.ref) return;
    var events = redemptionRead(book);
    if (!events.some(function (e) { return e.ref === event.ref; })) {
      events.push(event); redemptionWrite(book, events);
    }
  }
  function redemptionDrop(book, ref) {
    redemptionWrite(book, redemptionRead(book).filter(function (e) { return e.ref !== ref; }));
  }
  function refusedKey(book) { return 'kiwi:clients-refused-redemptions:v1:' + book; }
  function refusedRedemptions(book) {
    return outboxRead(refusedKey(book || bookId())).filter(function (e) { return e && e.ref && e.clientId && e.error; });
  }
  function redemptionRefuse(book, event, error) {
    var refused = refusedRedemptions(book);
    if (!refused.some(function (e) { return e.ref === event.ref; })) {
      refused.push({ ref: event.ref, clientId: event.clientId, error: error, at: now() });
    }
    // Keep the pending event if the refusal could not be persisted.
    if (!outboxWrite(refusedKey(book), refused)) return;
    redemptionDrop(book, event.ref);
    /* Le refus arrive sur la caisse qui a donné la remise : c'est là qu'il faut
       le dire. La fiche du tableau de bord ne le lit que sur cet appareil. */
    try {
      if (typeof window.KiwiCaisseToast === 'function') {
        window.KiwiCaisseToast('Récompense refusée par le serveur', 6000, 'warn',
          'Peut-être déjà utilisée sur une autre caisse. Vérifiez la fiche du client.');
      }
    } catch (_) {}
  }
  function redemptionRef(id) {
    return 'redemption:' + id + ':' + now() + ':' + Math.abs(hash(String(Math.random()))).toString(36);
  }
  function reserveRedemption(id, book, event) {
    book = book || bookId();
    event = event || { ref: redemptionRef(id), clientId: id };
    return redemptionPush(book, event, false, true).then(function (result) {
      return { ref: event.ref, accepted: result === 'accepted', refused: result === 'refused' };
    });
  }
  function redemptionPush(book, event, afterClientCreate, probe) {
    if (!syncable(book) || !event || !event.ref || (typeof navigator !== 'undefined' && navigator.onLine === false)) return Promise.resolve('retry');
    return Promise.resolve().then(function () {
      return fetch('/api/clients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ merchant: book, redemption: { clientId: event.clientId, ref: event.ref } }),
      });
    }).then(function (r) {
      if (r && r.ok) { redemptionDrop(book, event.ref); return 'accepted'; }
      if (!r || !(r.status >= 400 && r.status < 500) || [401, 403, 408, 429].indexOf(r.status) !== -1) return 'retry';
      return r.json().then(function (data) {
        var code = data && data.error;
        if (code === 'client-not-found' && !afterClientCreate) {
          return pushClient(get(event.clientId, book), book).then(function (ok) {
            return ok ? redemptionPush(book, event, true, probe) : 'retry';
          });
        }
        /* Les points qui rendent la récompense prête peuvent être dans un achat
           encore en file : tant que les achats de ce client ne sont pas arrivés,
           ce n'est pas un refus, ni pour la file ni pour la vérification d'avant
           paiement (qui garde alors la récompense, comme hors ligne). */
        if (code === 'reward-not-ready' && purchaseRead(book).some(function (e) {
          return e && e.kind !== 'refund' && e.clientId === event.clientId;
        })) return 'retry';
        if (['reward-not-ready', 'loyalty-off', 'client-not-found', 'ref-conflict', 'client-and-ref-required'].indexOf(code) !== -1) {
          if (!probe) redemptionRefuse(book, event, code);
          return 'refused';
        }
        return 'retry';
      });
    }).catch(function () { return 'retry'; });
  }
  function flushRedemptions(book) {
    var events = redemptionRead(book), batch = events.slice(0, 25);
    // Rotate before sending: refusals and transient failures retain their full
    // audit event without monopolising the next tick's bounded batch.
    redemptionWrite(book, events.slice(batch.length).concat(batch));
    batch.forEach(function (event) { redemptionPush(book, event); });
  }

  // Persist the last observed profile with the record, including while offline.
  // Comparing against it distinguishes an edit from an unchanged stale field.
  function profileSnapshot(rec) {
    var out = {};
    ['name', 'phone', 'email', 'birthday', 'gender', 'city', 'address', 'notes',
      'hospitality', 'tags', 'consent', 'consentEmail', 'source', 'firstSeen', 'lastSeen'].forEach(function (k) {
      if (rec[k] !== undefined) out[k] = rec[k];
    });
    return JSON.parse(JSON.stringify(out));
  }

  function pushClient(rec, book) {
    if (!syncable(book) || !rec || !rec.id) return Promise.resolve(false);
    var id = rec.id;
    var sent = profileSnapshot(rec);
    outAdd(book, id);
    try {
      return fetch('/api/clients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify(Object.assign({ merchant: book }, rec)),
      }).then(function (r) {
        if (r && r.ok) {
          var d = readBook(book), current = d.list.filter(function (c) { return c.id === id; })[0];
          // An old acknowledgement must not clear a newer edit's outbox entry.
          if (current && JSON.stringify(profileSnapshot(current)) === JSON.stringify(sent)) {
            current.profileBase = sent;
            clientsStore.set(d, book);
            outDrop(book, id);
          }
          return true;
        }
        outAdd(book, id);                    // 401 / 503 / 500 → on retentera
        return false;
      }).catch(function () { outAdd(book, id); return false; });
    } catch (_) { outAdd(book, id); return Promise.resolve(false); }
  }
  function deleteRemote(id, book) {
    if (!syncable(book) || !id) return;
    // Une suppression en attente annule un envoi en attente de la même fiche :
    // rejouer le POST ressusciterait ce qu'on vient d'effacer.
    outDrop(book, id);
    try {
      fetch('/api/clients?merchant=' + encodeURIComponent(book) + '&id=' + encodeURIComponent(id),
        { method: 'DELETE', keepalive: true })
        .then(function (r) {
          if (r && r.ok) { outDrop(book, '-' + id); return; }
          outAdd(book, '-' + id);
        }).catch(function () { outAdd(book, '-' + id); });
    } catch (_) { outAdd(book, '-' + id); }
  }

  /* Rejoue ce qui n'est jamais parti. Silencieux : un échec remet simplement le
   * jeton en file, et le carnet local n'a jamais cessé d'être utilisable. */
  function flushOutbox(book) {
    if (!syncable(book)) return;
    var pending = outRead(book);
    if (!pending.length) return;
    var byId = {};
    readBook(book).list.forEach(function (c) { byId[c.id] = c; });
    pending.slice(0, 25).forEach(function (token) {
      if (token.charAt(0) === '-') { deleteRemote(token.slice(1), book); return; }
      var rec = byId[token];
      // La fiche a quitté le carnet local sans passer par remove() : il n'y a
      // plus rien à envoyer, on sort le jeton plutôt que de retenter sans fin.
      if (!rec) { outDrop(book, token); return; }
      pushClient(rec, book);
    });
  }

  // map a D1 row (snake_case, 0/1) back onto a client record.
  function fromServer(r) {
    var hospitality = {};
    try { hospitality = JSON.parse(r.hospitality || '{}') || {}; } catch (_) {}
    var out = {
      id: r.id, name: r.name || '', phone: r.phone || '', email: r.email || '', birthday: r.birthday || '',
      gender: r.gender || '', city: r.city || '', address: r.address || '', notes: r.notes || '',
      hospitality: hospitality && typeof hospitality === 'object' && !Array.isArray(hospitality) ? hospitality : {},
      points: r.points || 0, stamps: r.stamps || 0, visits: r.visits || 0, spend: r.spend || 0,
      consent: !!r.consent, consentEmail: !!r.consent_email, source: r.source || 'caisse',
      firstSeen: r.first_seen || 0, lastSeen: r.last_seen || 0, updated: r.updated_ts || 0,
      loyaltySales: r.loyalty_sales || {},
      purchaseRefs: Array.isArray(r.purchase_refs) ? r.purchase_refs.slice() : [],
      rewardRefs: Array.isArray(r.reward_refs) ? r.reward_refs.slice() : [],
      history: (Array.isArray(r.purchase_history) ? r.purchase_history : []).map(function (row) {
        return { ref: row.saleRef || row.ref || '', ts: +row.createdAt || 0, amount: money(row.amount), method: String(row.method || ''), items: Array.isArray(row.items) ? row.items : [] };
      }),
    };
    /* Les étiquettes voyagent avec la fiche. Un serveur dont la colonne n'est
     * pas encore migrée n'en envoie pas : on n'écrase alors pas celles du carnet
     * local par une liste vide, comme le faisait l'ancien `tags: []`. */
    if (Array.isArray(r.tags)) out.tags = r.tags.map(String);
    return out;
  }
  function pendingPurchaseDelta(book, id) {
    var out = { points: 0, stamps: 0, visits: 0, spend: 0 };
    purchaseRead(book).forEach(function (event) {
      if (event.clientId !== id) return;
      out.points += Number(event.points || 0); out.stamps += Number(event.stamps || 0);
      out.visits += Number(event.visits || 0); out.spend += Number(event.spend != null ? event.spend : (event.amount || 0));
    });
    return out;
  }
  function pendingRedemptionDelta(book, id) {
    var out = { points: 0, stamps: 0 };
    redemptionRead(book).forEach(function (event) {
      if (event.clientId !== id) return;
      out.points -= Number(event.points || 0); out.stamps -= Number(event.stamps || 0);
    });
    return out;
  }
  // Merge server rows while retaining unacknowledged profile field edits.
  function mergeServer(book, rows) {
    var d = readBook(book), changed = false, byId = {};
    d.list.forEach(function (c) { byId[c.id] = c; });
    var gone = {};
    rows.forEach(function (r) {
      /* Une pierre tombale : ce client a été supprimé sur un autre appareil.
       * Sans ce cas, la ligne serait fusionnée comme une fiche ordinaire — vidée
       * de son nom et de son téléphone par le serveur — et le carnet afficherait
       * un client anonyme et immortel à la place d'une suppression. */
      if (r && r.deleted) {
        if (byId[r.id]) { gone[r.id] = 1; changed = true; }
        // La suppression est acquise : plus rien à rejouer pour cette fiche.
        outDrop(book, r.id); outDrop(book, '-' + r.id);
        return;
      }
      var sc = fromServer(r), local = byId[sc.id];
      sc.profileBase = profileSnapshot(sc);
      // Pulls accept server order, while preserving fields still queued locally.
      if (local && local.profileBase) {
        Object.keys(profileSnapshot(local)).forEach(function (key) {
          var base = local.profileBase[key];
          // Une base relevée avant que les étiquettes ne voyagent n'en a pas : c'était [].
          if (key === 'tags' && base === undefined) base = [];
          if (JSON.stringify(local[key]) !== JSON.stringify(base)) sc[key] = local[key];
        });
      }
      sc.purchaseRefs.forEach(function (ref) { purchaseDrop(book, ref); });
      sc.rewardRefs.forEach(function (ref) { redemptionDrop(book, ref); });
      var pending = pendingPurchaseDelta(book, sc.id);
      var pendingReward = pendingRedemptionDelta(book, sc.id);
      if (local && (pending.points || pending.stamps || pending.visits || pending.spend
        || pendingReward.points || pendingReward.stamps)) {
        sc.points = Number(sc.points || 0) + pending.points;
        sc.stamps = Number(sc.stamps || 0) + pending.stamps;
        sc.visits = Number(sc.visits || 0) + pending.visits;
        sc.spend = Number(sc.spend || 0) + pending.spend;
        sc.points = Math.max(0, sc.points + pendingReward.points);
        sc.stamps = Math.max(0, sc.stamps + pendingReward.stamps);
        sc.lastSeen = Math.max(Number(sc.lastSeen || 0), Number(local.lastSeen || 0));
        sc.updated = Math.max(Number(sc.updated || 0), Number(local.updated || 0));
      }
      if (!local) {
        if (!Array.isArray(sc.tags)) sc.tags = [];
        d.list.push(sc); byId[sc.id] = sc; changed = true;
        var mm = /^c(\d+)_/.exec(sc.id); if (mm) { var n = parseInt(mm[1], 10); if (n > (d.seq || 0)) d.seq = n; }
      } else if (local.profileBase || (sc.updated || 0) >= (local.updated || 0)) {
        if ((!sc.history || !sc.history.length) && Array.isArray(local.history)) sc.history = local.history;
        Object.assign(local, sc); changed = true;
      }
    });
    if (changed) {
      d.list = d.list.filter(function (c) { return !gone[c.id]; });
      clientsStore.set(d, book); // notifies subscribers; does NOT re-push
    }
    return changed;
  }
  /* Une page au plus par appel côté serveur (500 fiches). Un navigateur neuf qui
   * adopte un carnet de 2 000 clients doit continuer à demander tant qu'il
   * reste des pages, sinon il s'arrête à la première et croit avoir tout lu.
   * Le garde-fou de profondeur évite qu'une réponse incohérente ne fasse
   * tourner la boucle sans fin. */
  var clientPulls = Object.create(null);
  function pull(book, cb, depth) {
    // Tolerate pull(cb): the till modals call KiwiClients.pull(callback).
    // Without this the callback (a function) becomes the merchant key and the
    // till fetches /api/clients?merchant=function… instead of its own book.
    if (typeof book === 'function') { depth = cb; cb = book; book = null; }
    book = book || bookId();
    if (!syncable(book)) { if (cb) cb(false); return; }
    if (!(depth > 0)) {
      if (clientPulls[book]) { if (cb) clientPulls[book].push(cb); return; }
      var callbacks = clientPulls[book] = cb ? [cb] : [];
      cb = function (changed, error) {
        delete clientPulls[book];
        callbacks.forEach(function (fn) { try { fn(changed, error); } catch (_) {} });
      };
    }
    var since = getCursor(book);
    try {
      fetchDeadline('/api/clients?merchant=' + encodeURIComponent(book) + '&since=' + since, { headers: { Accept: 'application/json' } })
        .then(function (r) { return (r && r.ok) ? r.json() : null; })
        .then(function (data) {
          if (!data || !Array.isArray(data.clients)) { if (cb) cb(false); return; }
          var changed = data.clients.length ? mergeServer(book, data.clients) : false;
          // Le curseur n'avance que s'il avance vraiment : sur une réponse
          // incohérente, mieux vaut relire deux fois que sauter des fiches.
          if (data.cursor > since) setCursor(book, data.cursor);
          if (data.more && data.cursor > since && (depth || 0) < 20) {
            pull(book, function (more, error) { if (cb) cb(changed || more, error); }, (depth || 0) + 1);
            return;
          }
          if (cb) cb(changed);
        }).catch(function (error) { if (cb) cb(false, error); });
    } catch (error) { if (cb) cb(false, error); }
  }
  var pollTimer = null;
  function tick() {
    var b = bookId();
    if (!syncable(b)) return;
    outboxPersistHeld();   // une file gardée en mémoire retourne sur le disque dès qu'il l'accepte
    flushOutbox(b);   // d'abord ce qui n'est jamais parti d'ici…
    flushPurchases(b);
    flushRedemptions(b);
    pull(b);          // …puis ce que les autres appareils ont fait
  }
  function startSync() {
    tick();
    if (!pollTimer) pollTimer = setInterval(tick, 15000);
  }

